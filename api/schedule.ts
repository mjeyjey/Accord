import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db, authenticate, log, fetchAll, toTrash, acceptClosed, cutoffHours, manilaToday } from "./_lib.js";
import { notify } from "./_notify.js";
import {
  buildSchedule,
  examDates,
  FLOORS,
  groupAvail,
  endOf,
  hhmm,
  isFree,
  SLOTS,
  MAX_PER_DAY,
} from "./_scheduler.js";

// A "batch" = one section's back-to-back exams on one day with one proctor.
const batchOf = (s: any) =>
  fetchAll(() => {
    let q: any = db
      .from("schedules")
      .select("id,start_time")
      .eq("section_id", s.section_id)
      .eq("exam_date", s.exam_date)
      .eq("period_id", s.period_id)
      .eq("status", "scheduled");
    q = s.proctor_id ? q.eq("proctor_id", s.proctor_id) : q.is("proctor_id", null);
    return q.order("start_time").order("id");
  });

const teachesOf = async (pid: string) => new Set<string>((await fetchAll(() =>
  db.from("proctor_subjects").select("subject_code").eq("proctor_id", pid).order("subject_code"))).map((r: any) => r.subject_code));

// true when this proctor may see/accept this open block
function canTake(g: any[], p: any, mine: any[], av: any[], teaches: Set<string>) {
  const f = g[0];
  if (!p || g.some((r) => teaches.has(r.subject?.code))) return false;
  const slots = g.map((r) => hhmm(r.start_time));
  if (mine.some((m) => m.exam_date === f.exam_date && (m.section_id !== f.section_id || slots.includes(hhmm(m.start_time))))) return false;
  const inPeriod = av.filter((a) => a.date >= p.start_date && a.date <= p.end_date);
  return !inPeriod.length || slots.every((t) => isFree(inPeriod, f.exam_date, t));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const me = await authenticate(req, res);
  if (!me) return;
  const action = String(req.query.action || "");
  const b: any = req.body || {};

  try {
    // ---- Flag an emergency: the whole batch (all of that proctor's hours for the section that day)
    if (action === "emergency") {
      const { data: s } = await db
        .from("schedules")
        .select("id,proctor_id,section_id,exam_date,program:programs(code,department_id),section:sections(name,year_level),proctor:profiles(full_name)")
        .eq("id", b.schedule_id)
        .single();
      if (!s) return res.status(404).json({ error: "Schedule not found" });
      if (!s.proctor_id)
        return res.status(400).json({ error: "This exam has no proctor yet" });
      if (me.role === "proctor" && s.proctor_id !== me.id)
        return res.status(403).json({ error: "Not your schedule" });
      await db
        .from("schedules")
        .update({ emergency: true, emergency_note: b.note || null })
        .eq("section_id", s.section_id)
        .eq("exam_date", s.exam_date)
        .eq("proctor_id", s.proctor_id);
      await log(me, "emergency", "schedules", {
        schedule_id: s.id,
        note: b.note,
      });
      const managers = await fetchAll(() =>
        db.from("profiles").select("id,role,department_id").in("role", ["admin", "head"]).order("id"),
      );
      const dept = (s as any).program?.department_id;
      const to = managers.filter((p: any) => p.role === "admin" || p.department_id === dept);
      const label = `${(s as any).program?.code} ${(s as any).section?.year_level}${(s as any).section?.name}`;
      const text = `${(s as any).proctor?.full_name} flagged an emergency for ${label} on ${s.exam_date}` + (b.note ? `: ${b.note}` : "");
      if (to.length)
        await notify(to.map((p: any) => ({ user_id: p.id, kind: "emergency", title: "Proctor emergency", body: text })));
      return res.json({ ok: true });
    }

    // ---- Proctor: open assignments (batches with no proctor yet) from EVERY ongoing exam period
    if (action === "requests" || action === "accept") {
      if (me.role !== "proctor")
        return res.status(403).json({ error: "Only proctors can use this" });

      // "*" keeps this working even before the accept_cutoff_hours column exists.
      const ongoing = await fetchAll(() => db.from("exam_periods").select("*").neq("status", "ended").order("id"));
      const periods = new Map<string, any>(ongoing.map((p: any) => [p.id, p]));
      const closedText = (h: number) => (h ? `closed, it starts in less than ${h} hour${h === 1 ? "" : "s"}` : "closed, it already started");

      if (action === "requests") {
        const today = manilaToday();
        const [open, mine, myAv, teaches] = await Promise.all([
          fetchAll(() =>
            db
              .from("schedules")
              .select(
                "id,section_id,room_id,period_id,exam_date,start_time,end_time,section:sections(name,year_level),subject:subjects(code),room:rooms(name,floor),program:programs(code)",
              )
              .eq("status", "scheduled")
              .is("proctor_id", null)
              .not("exam_date", "is", null)
              .gte("exam_date", today)
              .order("exam_date")
              .order("start_time")
              .order("id"),
          ),
          fetchAll(() =>
            db
              .from("schedules")
              .select("exam_date,start_time,section_id")
              .eq("proctor_id", me.id)
              .eq("status", "scheduled")
              .order("id"),
          ),
          fetchAll(() => db.from("availability").select("*").eq("proctor_id", me.id).order("id")),
          teachesOf(me.id),
        ]);
        const groups = new Map<string, any[]>();
        for (const r of open) {
          if (!periods.has(r.period_id)) continue; // ended (or missing) periods are not offered
          const k = `${r.period_id}|${r.exam_date}|${r.section_id}|${r.room_id}`;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k)!.push(r);
        }
        const out = [...groups.values()]
          .filter((g) => !acceptClosed(g[0].exam_date, g[0].start_time, cutoffHours(periods.get(g[0].period_id))))
          .filter((g) => canTake(g, periods.get(g[0].period_id), mine, myAv, teaches))
          .map((g) => {
            const f = g[0], last = g[g.length - 1];
            const p = periods.get(f.period_id);
            const hours = cutoffHours(p);
            const slots = g.map((r) => hhmm(r.start_time));
            let reason = "";
            if (mine.some((m: any) => m.exam_date === f.exam_date && m.section_id !== f.section_id))
              reason = "You already proctor another section that day";
            else if (mine.some((m: any) => m.exam_date === f.exam_date && slots.includes(hhmm(m.start_time))))
              reason = "You already have an exam at that time";
            return {
              id: f.id,
              section_id: f.section_id,
              period_id: f.period_id,
              period: { id: p.id, name: p.name, semester: p.semester, start_date: p.start_date, end_date: p.end_date },
              program: f.program?.code,
              year: f.section?.year_level,
              exam_date: f.exam_date,
              start: hhmm(f.start_time),
              end: hhmm(last.end_time),
              section: `${f.program?.code} ${f.section?.year_level}${f.section?.name}`,
              subjects: g.map((r) => r.subject?.code).join(", "),
              room: f.room ? `${f.room.name}, ${f.room.floor}` : "",
              can_accept: !reason,
              reason,
              cutoff_hours: hours,
              closes_at: new Date(Date.parse(`${f.exam_date}T${hhmm(f.start_time)}:00+08:00`) - hours * 3600000).toISOString(),
            };
          });
        return res.json(out);
      }

      // accept (one batch, or several days of the same section)
      const first: string[] = Array.isArray(b.schedule_ids) ? b.schedule_ids : [b.schedule_id];
      const myExams = await fetchAll(() => db.from("schedules").select("exam_date,start_time,section_id")
        .eq("proctor_id", me.id).eq("status", "scheduled").order("id"));
      const myAv = await fetchAll(() => db.from("availability").select("*").eq("proctor_id", me.id).order("id"));
      const teaches = await teachesOf(me.id);
      let accepted = 0;
      const skipped: string[] = [];
      for (const sid of first) {
        const { data: s } = await db.from("schedules").select("*").eq("id", sid).single();
        if (!s || s.proctor_id || s.status !== "scheduled" || !s.exam_date) { skipped.push("This assignment was already taken"); continue; }
        const period = periods.get(s.period_id);
        if (!period) { skipped.push("This exam period is no longer open"); continue; }
        const batch = await batchOf(s);
        const ids = batch.map((r: any) => r.id);
        const slots = batch.map((r: any) => hhmm(r.start_time));
        const hours = cutoffHours(period);
        if (acceptClosed(s.exam_date, batch[0].start_time, hours)) { skipped.push(`${s.exam_date}: ${closedText(hours)}`); continue; }
        const full = await fetchAll(() => db.from("schedules").select("exam_date,start_time,section_id,subject:subjects(code)").in("id", ids).order("id"));
        if (!canTake(full, period, myExams, myAv, teaches)) { skipped.push(`${s.exam_date}: not available for you`); continue; }
        if (myExams.some((m: any) => m.exam_date === s.exam_date && (m.section_id !== s.section_id || slots.includes(hhmm(m.start_time))))) {
          skipped.push(`${s.exam_date}: you already proctor another section that day`); continue;
        }
        const { data: upd, error } = await db.from("schedules").update({ proctor_id: me.id })
          .in("id", ids).is("proctor_id", null).select("id");
        if (error) throw error;
        if (!upd?.length) { skipped.push("Someone else just took this assignment"); continue; }
        batch.forEach((r: any) => myExams.push({ exam_date: s.exam_date, start_time: r.start_time, section_id: s.section_id }));
        await log(me, "accept assignment", "schedules", { section_id: s.section_id, date: s.exam_date });
        accepted++;
      }
      if (!accepted) return res.status(409).json({ error: skipped[0] || "Nothing to accept" });
      return res.json({ ok: true, accepted, skipped: skipped.length });
    }

    if (me.role === "proctor")
      return res.status(403).json({ error: "Not allowed" });

    if (action === "subject_catalog") {
      const rows = await fetchAll(() => db.from("subjects").select("code,title").order("code").order("id"));
      const m = new Map<string, string>(); rows.forEach((r: any) => { if (!m.has(r.code)) m.set(r.code, r.title); });
      return res.json([...m].map(([code, title]) => ({ code, title })));
    }
    if (action === "proctor_subjects" || action === "set_proctor_subjects") {
      const { data: p } = await db.from("profiles").select("id,role,department_id").eq("id", b.proctor_id).single();
      if (!p || p.role !== "proctor") return res.status(404).json({ error: "Proctor not found" });
      if (me.role === "head" && p.department_id !== me.department_id) return res.status(403).json({ error: "Outside your department" });
      if (action === "set_proctor_subjects") {
        const codes = [...new Set((Array.isArray(b.codes) ? b.codes : []).map(String))].slice(0, 200);
        await db.from("proctor_subjects").delete().eq("proctor_id", p.id);
        if (codes.length) { const { error } = await db.from("proctor_subjects").insert(codes.map((c) => ({ proctor_id: p.id, subject_code: c }))); if (error) throw error; }
        await log(me, "update", "profiles", { id: p.id, profile: "proctor subjects" });
        return res.json({ ok: true });
      }
      const rows = await fetchAll(() => db.from("proctor_subjects").select("subject_code").eq("proctor_id", p.id).order("subject_code"));
      return res.json(rows.map((r: any) => r.subject_code));
    }

    if (action === "review_period") {
      if (me.role !== "admin") return res.status(403).json({ error: "Only an admin can approve schedules" });
      const { data: p } = await db.from("exam_periods").select("*").eq("id", b.period_id).single();
      if (!p) return res.status(404).json({ error: "Exam period not found" });
      const approve = b.decision === "approve";
      if (p.status === "ended") return res.status(400).json({ error: "This exam period has ended" });
      if (approve && p.status !== "generated") return res.status(400).json({ error: p.status === "approved" ? "Already approved" : "Generate the schedule first" });
      if (!approve && p.status !== "approved") return res.status(400).json({ error: "This schedule is not approved" });
      const { error } = await db.from("exam_periods").update({ status: approve ? "approved" : "generated" }).eq("id", p.id);
      if (error) throw error;
      const progs = await fetchAll(() => db.from("programs").select("department_id").in("id", p.program_ids || []).order("id"));
      const depts = [...new Set(progs.map((x: any) => x.department_id))];
      if (depts.length) {
        const heads = await fetchAll(() => db.from("profiles").select("id").eq("role", "head").eq("status", "active").in("department_id", depts).order("id"));
        if (heads.length) await notify(heads.map((h: any) => ({
          user_id: h.id, kind: "info", title: approve ? "Schedule approved" : "Approval withdrawn",
          body: `The schedule for "${p.name}" was ${approve ? "approved" : "moved back to pending approval"} by ${me.full_name}.`,
        })));
      }
      await log(me, approve ? "approve" : "revoke approval", "exam_periods", { period: p.name });
      return res.json({ ok: true, status: approve ? "approved" : "generated" });
    }

    if (action === "backup") {
      if (me.role !== "admin") return res.status(403).json({ error: "Only an admin can download a backup" });
      const names = ["departments", "programs", "profiles", "subjects", "sections", "rooms", "availability", "exam_periods", "schedules", "audit_log", "trash", "bulletins"];
      const tables: Record<string, any[]> = {};
      for (const t of names) tables[t] = await fetchAll(() => db.from(t).select("*").order("id"));
      await log(me, "backup", "backup", { tables: names.length });
      return res.json({ exported_at: new Date().toISOString(), tables });
    }

    if (action === "user_profile") {
      const { data: p } = await db.from("profiles")
        .select("id,full_name,email,avatar_url,role,department_id,status,department:departments(code,name)")
        .eq("id", b.user_id).single();
      if (!p) return res.status(404).json({ error: "User not found" });
      if (p.role !== "proctor" && me.role !== "admin")
        return res.status(403).json({ error: "Only an admin can view this profile" });
      if (me.role === "head" && p.department_id !== me.department_id)
        return res.status(403).json({ error: "Outside your department" });
      let extra: any = {};
      if (p.role === "proctor") {
        const av = await fetchAll(() => db.from("availability").select("date,start_time,end_time").eq("proctor_id", p.id).order("id"));
        const m = (t: string) => Number(hhmm(t).slice(0, 2)) * 60 + Number(hhmm(t).slice(3, 5));
        const { count } = await db.from("schedules").select("id", { count: "exact", head: true })
          .eq("proctor_id", p.id).eq("status", "scheduled");
        extra = {
          availability_days: new Set(av.map((a: any) => a.date)).size,
          availability_hours: av.reduce((s: number, a: any) => s + (m(a.end_time) - m(a.start_time)) / 60, 0),
          exams: count || 0,
        };
      }
      return res.json({ profile: p, ...extra });
    }

    // ---- Admin/head: the schedule assigned to one proctor
    if (action === "proctor_schedule") {
      const { data: p } = await db
        .from("profiles").select("id,role,department_id").eq("id", b.proctor_id).single();
      if (!p || p.role !== "proctor") return res.status(404).json({ error: "Proctor not found" });
      if (me.role === "head" && p.department_id !== me.department_id)
        return res.status(403).json({ error: "Outside your department" });
      const rows = await fetchAll(() =>
        db.from("schedules")
          .select("id,section_id,exam_date,start_time,end_time,emergency,room:rooms(name,floor),section:sections(name,year_level),subject:subjects(code,title),program:programs(code),period:exam_periods(name)")
          .eq("proctor_id", p.id).eq("status", "scheduled")
          .order("exam_date").order("start_time").order("id"),
      );
      const availability = await fetchAll(() =>
        db.from("availability").select("date,start_time,end_time")
          .eq("proctor_id", p.id).order("date").order("start_time").order("id"),
      );
      return res.json({ schedule: rows, availability });
    }

    // ---- Import rooms (from a spreadsheet parsed in the browser)
    if (action === "import_rooms") {
      const FL = ["Ground", "1st", "2nd", "3rd", "4th", "5th"];
      const seen = new Map<string, any>();
      for (const r of b.rooms || []) {
        const name = String(r.name || "").trim();
        const capacity = Math.floor(Number(r.capacity));
        const floor = FL.includes(r.floor) ? r.floor : "Ground";
        if (!name || !(capacity > 0)) continue;
        seen.set(name, { name, floor, capacity, department_id: null });
      }
      const list = [...seen.values()];
      if (!list.length)
        return res.status(400).json({ error: "No valid rooms to import (need Room and Capacity)" });
      const existing = await fetchAll(() => db.from("rooms").select("name").order("id"));
      const known = new Set(existing.map((x: any) => x.name));
      for (let i = 0; i < list.length; i += 200) {
        const { error } = await db.from("rooms").upsert(list.slice(i, i + 200), { onConflict: "name" });
        if (error) throw error;
      }
      const added = list.filter((x) => !known.has(x.name)).length;
      await log(me, "import rooms", "rooms", { added, updated: list.length - added });
      return res.json({ added, updated: list.length - added });
    }

    // ---- Import a curriculum (parsed from an evaluation sheet) into one program
    if (action === "import_curriculum") {
      const { data: prog } = await db
        .from("programs").select("id,code,department_id").eq("id", b.program_id).single();
      if (!prog) return res.status(404).json({ error: "Program not found" });
      if (me.role === "head" && prog.department_id !== me.department_id)
        return res.status(403).json({ error: "Outside your department" });

      const seen = new Map<string, any>();
      for (const s of b.subjects || []) {
        const year = Number(s.year_level), sem = Number(s.semester);
        const code = String(s.code || "").trim(), title = String(s.title || "").trim();
        if (!(year >= 1 && year <= 6) || ![1, 2, 3].includes(sem) || !code || !title) continue;
        seen.set(`${year}|${sem}|${code}`, { program_id: prog.id, year_level: year, semester: sem, code, title });
      }
      const list = [...seen.values()];
      if (!list.length) return res.status(400).json({ error: "No valid subjects to import" });

      const before = await fetchAll(() =>
        db.from("subjects").select("*").eq("program_id", prog.id).order("id"),
      );
      const known = new Set(before.map((x: any) => `${x.year_level}|${x.semester}|${x.code}`));
      for (let i = 0; i < list.length; i += 200) {
        const { error } = await db.from("subjects").upsert(list.slice(i, i + 200), {
          onConflict: "program_id,year_level,semester,code",
        });
        if (error) throw error;
      }
      let removed = 0, kept = 0;
      if (b.remove_missing) {
        const keep = new Set(list.map((x) => `${x.year_level}|${x.semester}|${x.code}`));
        const gone = before.filter((x: any) => !keep.has(`${x.year_level}|${x.semester}|${x.code}`));
        const used = new Set(
          (await fetchAll(() => db.from("schedules").select("subject_id").eq("program_id", prog.id).order("id")))
            .map((x: any) => x.subject_id),
        );
        const del = gone.filter((x: any) => !used.has(x.id));
        kept = gone.length - del.length;
        for (const subject of del) await toTrash(me, "subjects", subject);
        const delIds = del.map((x: any) => x.id);
        for (let i = 0; i < delIds.length; i += 100)
          await db.from("subjects").delete().in("id", delIds.slice(i, i + 100));
        removed = delIds.length;
      }
      const added = list.filter((x) => !known.has(`${x.year_level}|${x.semester}|${x.code}`)).length;
      await log(me, "import curriculum", "subjects", { program: prog.code, added, updated: list.length - added, removed });
      return res.json({ added, updated: list.length - added, removed, kept });
    }

    // ---- Generate (or regenerate) the schedule for an exam period
    if (action === "generate") {
      const { data: period } = await db
        .from("exam_periods")
        .select("*")
        .eq("id", b.period_id)
        .single();
      if (!period)
        return res.status(404).json({ error: "Exam period not found" });
      if (period.status === "ended")
        return res.status(400).json({ error: "This exam period has ended and can no longer be regenerated" });

      const { data: progs } = await db
        .from("programs")
        .select("*")
        .in("id", period.program_ids);
      let programs: any[] = progs || [];
      if (me.role === "head")
        programs = programs.filter((p) => p.department_id === me.department_id);
      if (!programs.length)
        return res
          .status(400)
          .json({
            error: "No programs of yours are selected in this exam period",
          });
      const pids = programs.map((p) => p.id);

      const [sections, subjects, rooms, proctors, availability, busy] =
        await Promise.all([
          fetchAll(() =>
            db.from("sections").select("*").in("program_id", pids).order("id"),
          ),
          fetchAll(() =>
            db
              .from("subjects")
              .select("*")
              .in("program_id", pids)
              .eq("semester", period.semester)
              .order("code")
              .order("id"),
          ),
          fetchAll(() => db.from("rooms").select("*").order("id")),
          fetchAll(() =>
            db
              .from("profiles")
              .select("id,department_id")
              .eq("role", "proctor")
              .order("id"),
          ),
          fetchAll(() =>
            db
              .from("availability")
              .select("*")
              .gte("date", period.start_date)
              .lte("date", period.end_date)
              .order("id"),
          ),
          // Exams already scheduled for OTHER programs in this period: those rooms/proctors are taken.
          fetchAll(() =>
            db
              .from("schedules")
              .select("room_id,proctor_id,section_id,exam_date,start_time")
              .eq("period_id", period.id)
              .eq("status", "scheduled")
              .not("program_id", "in", `(${pids.join(",")})`)
              .order("id"),
          ),
        ]);

      const ps = await fetchAll(() => db.from("proctor_subjects").select("proctor_id,subject_code").order("proctor_id").order("subject_code"));
      const blocked = new Map<string, Set<string>>();
      ps.forEach((r: any) => { if (!blocked.has(r.proctor_id)) blocked.set(r.proctor_id, new Set()); blocked.get(r.proctor_id)!.add(r.subject_code); });

      if (!rooms.length)
        return res
          .status(400)
          .json({ error: "Add rooms first (Configuration > Rooms)" });
      if (!proctors.length)
        return res
          .status(400)
          .json({ error: "Add proctors first (Configuration > Proctors)" });
      if (!sections.length)
        return res
          .status(400)
          .json({ error: "Add sections with student counts first" });
      const dates = examDates(period.start_date, period.end_date);
      if (!dates.length)
        return res
          .status(400)
          .json({ error: "The exam dates contain no usable days" });

      const { rows, stats } = buildSchedule({
        dates,
        daysPerYear: period.days_per_year,
        programs,
        sections,
        subjects,
        rooms,
        proctors,
        availability,
        busy,
        blocked,
      });

      await db
        .from("schedules")
        .delete()
        .eq("period_id", period.id)
        .in("program_id", pids);
      for (let i = 0; i < rows.length; i += 500) {
        const { error } = await db
          .from("schedules")
          .insert(
            rows
              .slice(i, i + 500)
              .map((r: any) => ({ ...r, period_id: period.id })),
          );
        if (error) throw error;
      }
      await db
        .from("exam_periods")
        .update({ status: "generated" })
        .eq("id", period.id);
      if ((stats as any).tba > 0) {
        await db.from("notifications").delete().eq("title", "Proctors needed").eq("read", false);
        const msg = `${(stats as any).tba} exam hour(s) in "${period.name}" have no proctor yet. Open Assignment requests to accept one.`;
        await notify(proctors.map((p: any) => ({ user_id: p.id, title: "Proctors needed", body: msg, kind: "requests" })));
      }
      await log(me, "generate", "exam_periods", {
        period: period.name,
        ...stats,
      });
      return res.json(stats);
    }

    if (action === "resolve_unplaced") {
      const { data: target } = await db.from("schedules")
        .select("*, program:programs(id,department_id,floor)").eq("id", b.schedule_id).single();
      if (!target || target.status !== "unscheduled")
        return res.status(404).json({ error: "Unscheduled exam not found" });
      if (me.role === "head" && target.program?.department_id !== me.department_id)
        return res.status(403).json({ error: "Outside your department" });
      const [{ data: period }, { data: sec }, { data: room }, unscheduled, busy] = await Promise.all([
        db.from("exam_periods").select("*").eq("id", target.period_id).single(),
        db.from("sections").select("*").eq("id", target.section_id).single(),
        db.from("rooms").select("*").eq("id", b.room_id).single(),
        fetchAll(() => db.from("schedules").select("id,subject_id")
          .eq("period_id", target.period_id).eq("section_id", target.section_id).eq("status", "unscheduled").order("id")),
        fetchAll(() => db.from("schedules").select("room_id,proctor_id,section_id,exam_date,start_time")
          .eq("period_id", target.period_id).eq("status", "scheduled").order("id")),
      ]);
      if (!period || !sec || !room) return res.status(400).json({ error: "The period, section, or room is no longer available" });
      if (!unscheduled.length) return res.status(409).json({ error: "This section has no unplaced exams remaining" });
      const subjects = await fetchAll(() => db.from("subjects").select("*")
        .in("id", unscheduled.map((r: any) => r.subject_id)).order("code").order("id"));
      const { rows } = buildSchedule({
        dates: examDates(period.start_date, period.end_date), daysPerYear: period.days_per_year,
        programs: [target.program], sections: [sec], subjects, rooms: [room], proctors: [], availability: [], busy,
        ignoreCapacity: true, spill: true,
      });
      const placed = rows.filter((r: any) => r.status === "scheduled");
      if (!placed.length) return res.status(409).json({ error: "That room has no free hours. Pick another." });
      const placedSubjects = new Set(placed.map((r: any) => r.subject_id));
      const removeIds = unscheduled.filter((r: any) => placedSubjects.has(r.subject_id)).map((r: any) => r.id);
      const { error: deleteError } = await db.from("schedules").delete().in("id", removeIds);
      if (deleteError) throw deleteError;
      for (let i = 0; i < placed.length; i += 200) {
        const { error } = await db.from("schedules").insert(placed.slice(i, i + 200).map((r: any) => ({ ...r, period_id: target.period_id })));
        if (error) throw error;
      }
      await log(me, "resolve unplaced", "schedules", { section_id: target.section_id, room: room.name, placed: placed.length });
      return res.json({ ok: true, placed: placed.length });
    }

    // For the actions below, b.schedule_id is ANY row of the batch.
    if (["reassign", "candidates", "room_options", "set_room", "swap_room", "reschedule"].includes(action)) {
      const { data: s } = await db
        .from("schedules")
        .select("*, program:programs(department_id,floor)")
        .eq("id", b.schedule_id)
        .single();
      if (!s) return res.status(404).json({ error: "Schedule not found" });
      if (me.role === "head" && s.program?.department_id !== me.department_id)
        return res.status(403).json({ error: "Outside your department" });
      if (!s.exam_date)
        return res
          .status(400)
          .json({ error: "This exam is not scheduled yet" });
      const batch = await batchOf(s);
      const ids = batch.map((r: any) => r.id);
      const slots = batch.map((r: any) => hhmm(r.start_time));

      // ---- Replacement proctors: first those whose entered availability covers every hour,
      // and only if there are none, those who entered no availability at all.
      if (action === "reassign" || action === "candidates") {
        const { data: period } = await db
          .from("exam_periods").select("start_date,end_date").eq("id", s.period_id).single();
        const [proctors, availability, clash, periodRows] = await Promise.all([
          fetchAll(() =>
          db.from("profiles").select("id,full_name,avatar_url,department_id,department:departments(code)").eq("role", "proctor").order("id"),
          ),
          fetchAll(() =>
            db.from("availability").select("*")
              .gte("date", period!.start_date).lte("date", period!.end_date).order("id"),
          ),
          fetchAll(() =>
            db.from("schedules").select("proctor_id,start_time,section_id")
              .eq("exam_date", s.exam_date).eq("status", "scheduled").order("id"),
          ),
          fetchAll(() => db.from("schedules").select("proctor_id")
            .eq("period_id", s.period_id).eq("status", "scheduled").not("proctor_id", "is", null).order("id")),
        ]);
        const codes = (await fetchAll(() => db.from("schedules").select("id,subject:subjects(code)").in("id", ids).order("id"))).map((r: any) => r.subject?.code).filter(Boolean);
        const teachers = new Set(codes.length ? (await fetchAll(() => db.from("proctor_subjects").select("proctor_id,subject_code").in("subject_code", codes).order("proctor_id").order("subject_code"))).map((r: any) => r.proctor_id) : []);
        const loads = new Map<string, number>();
        periodRows.forEach((r: any) => loads.set(r.proctor_id, (loads.get(r.proctor_id) || 0) + 1));
        // taken = same hour clash, OR already proctoring a different section that day
        const taken = new Set(
          clash.filter((c: any) => c.proctor_id && (slots.includes(hhmm(c.start_time)) || c.section_id !== s.section_id))
            .map((c: any) => c.proctor_id),
        );
        const selfFree = !taken.has(me.id);
        const by = groupAvail(availability);
        const base = proctors.filter((p: any) => p.id !== s.proctor_id && !taken.has(p.id) && !teachers.has(p.id));
        const withTime = base.filter(
          (p: any) => by.has(p.id) && slots.every((t: string) => isFree(by.get(p.id), s.exam_date, t)),
        );
        const noInput = base.filter((p: any) => !by.has(p.id));
        const fallback = withTime.length === 0;
        const pool = fallback ? noInput : withTime;
        const same = (p: any) => Number(p.department_id === s.program?.department_id);
        const allSlots = [...SLOTS.AM, ...SLOTS.PM];
        const cover = (p: any) => allSlots.filter((t) => isFree(by.get(p.id), s.exam_date, t)).length;
        pool.sort((a: any, c: any) => cover(c) - cover(a) || same(c) - same(a) || (loads.get(a.id) || 0) - (loads.get(c.id) || 0) || String(a.full_name).localeCompare(c.full_name));

        if (action === "candidates")
          return res.json({
            fallback,
            self: { id: me.id, full_name: me.full_name, free: selfFree },
            candidates: pool.map((p: any) => ({ id: p.id, full_name: p.full_name, avatar_url: p.avatar_url, dept: p.department?.code || "Unassigned", load: loads.get(p.id) || 0, same_department: !!same(p), whole_day: cover(p) === allSlots.length })),
          });

        const covering = !!b.proctor_id && b.proctor_id === me.id;
        if (covering && !selfFree)
          return res.status(409).json({ error: "You already have an exam at those hours" });
        if (!covering && !pool.length)
          return res.status(409).json({ error: "No other proctor is free for those hours" });
        const pick: any = covering ? { id: me.id } : b.proctor_id ? pool.find((p: any) => p.id === b.proctor_id) : pool[0];
        if (!pick) return res.status(409).json({ error: "That proctor is no longer available" });
        await db
          .from("schedules")
          .update({
            proctor_id: pick.id,
            emergency: false,
            emergency_note: null,
          })
          .in("id", ids);
        if (pick.id !== me.id) {
          const [{ data: sec }, { data: pg }] = await Promise.all([
            db.from("sections").select("name,year_level").eq("id", s.section_id).single(),
            db.from("programs").select("code").eq("id", s.program_id).single(),
          ]);
          await notify([{
            user_id: pick.id, kind: "assignment", title: "New assignment",
            body: `${me.full_name} assigned you to proctor ${pg?.code} ${sec?.year_level}${sec?.name} on ${s.exam_date}, ${slots[0]}-${endOf(slots[slots.length - 1])}.`,
          }]);
        }
        await log(me, "reassign", "schedules", {
          section_id: s.section_id,
          date: s.exam_date,
          from: s.proctor_id,
          to: pick.id,
        });
        return res.json({ ok: true, proctor_id: pick.id });
      }

      if (action === "reschedule") {
        const date = String(b.exam_date || ""), start = String(b.start_time || "");
        const block = (["AM", "PM"] as const).find((k) => SLOTS[k].includes(start));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !block)
          return res.status(400).json({ error: "Pick a date and a start hour" });
        const n = batch.length, at = SLOTS[block].indexOf(start);
        if (at + n > SLOTS[block].length)
          return res.status(400).json({ error: `This block has ${n} back-to-back hour(s) and does not fit from ${start}. Pick an earlier start.` });
        const newSlots = SLOTS[block].slice(at, at + n);
        const { data: period } = await db.from("exam_periods").select("start_date,end_date,status").eq("id", s.period_id).single();
        if (!period || period.status === "ended") return res.status(400).json({ error: "This exam period is no longer available" });
        if (date < period.start_date || date > period.end_date) return res.status(400).json({ error: "That date is outside the exam period" });
        if (date < manilaToday()) return res.status(400).json({ error: "Pick today or a later date" });

        const day = (await fetchAll(() => db.from("schedules").select("id,room_id,proctor_id,section_id,start_time")
          .eq("exam_date", date).eq("status", "scheduled").order("id"))).filter((o: any) => !ids.includes(o.id));
        const slotOf = (o: any) => hhmm(o.start_time);
        const mine = day.filter((o: any) => o.section_id === s.section_id);
        if (mine.some((o: any) => newSlots.includes(slotOf(o))))
          return res.status(409).json({ error: "That section already has an exam at that time" });
        if (mine.length + n > MAX_PER_DAY)
          return res.status(409).json({ error: `A section can have at most ${MAX_PER_DAY} exams per day` });
        if (s.room_id && day.some((o: any) => o.room_id === s.room_id && newSlots.includes(slotOf(o))))
          return res.status(409).json({ error: "The room is already used at that time. Change the room first." });

        // Keep the proctor only if they are free and available; otherwise release the block so any proctor can accept it.
        let proctor: string | null = s.proctor_id;
        if (proctor) {
          const clash = day.some((o: any) => o.proctor_id === proctor && (newSlots.includes(slotOf(o)) || o.section_id !== s.section_id));
          const av = await fetchAll(() => db.from("availability").select("*").eq("proctor_id", proctor!).order("id"));
          if (clash || (av.length && !newSlots.every((t) => isFree(av, date, t)))) proctor = null;
        }
        const released = !!s.proctor_id && !proctor;
        const results = await Promise.all(batch.map((r: any, i: number) =>
          db.from("schedules").update({
            exam_date: date, start_time: newSlots[i], end_time: endOf(newSlots[i]), proctor_id: proctor,
            ...(released ? { emergency: false, emergency_note: null } : {}),
          }).eq("id", r.id)));
        const failed = results.find((r) => r.error);
        if (failed?.error) throw failed.error;
        if (s.proctor_id && s.proctor_id !== me.id)
          await notify([{
            user_id: s.proctor_id, kind: "assignment",
            title: released ? "Assignment moved" : "Exam rescheduled",
            body: released
              ? `An exam you were assigned to was moved to ${date}, ${newSlots[0]}. You are not free then, so it is now open for others.`
              : `An exam you proctor was moved to ${date}, ${newSlots[0]}-${endOf(newSlots[n - 1])}.`,
          }]);
        await log(me, "reschedule", "schedules", { section_id: s.section_id, from: s.exam_date, exam_date: date, start: newSlots[0], released });
        return res.json({ ok: true, released });
      }

      const [{ data: sec }, { data: rooms }, day] = await Promise.all([
        db.from("sections").select("student_count").eq("id", s.section_id).single(),
        db.from("rooms").select("*"),
        fetchAll(() => db.from("schedules")
          .select("id,room_id,section_id,start_time,section:sections(name,year_level,student_count),program:programs(code)")
          .eq("exam_date", s.exam_date).eq("status", "scheduled").order("id")),
      ]);
      if (!sec) return res.status(404).json({ error: "Section not found" });
      const slot = (o: any) => hhmm(o.start_time);
      const mine = day.filter((o: any) => o.section_id === s.section_id);
      const mySlots = mine.map(slot), myIds = mine.map((o: any) => o.id);
      const R = (id: string) => (rooms || []).find((r: any) => r.id === id);
      const fl = (f: string) => FLOORS.indexOf(f);
      const pf = fl(s.program?.floor || "Ground");
      const busyFor = (rid: string, skip: string[], times = mySlots) =>
        day.some((o: any) => o.room_id === rid && !skip.includes(o.section_id) && times.includes(slot(o)));
      const tooSmall = (message: string) => res.status(409).json({ code: "capacity", error: message });

      if (action === "room_options") {
        const free = (rooms || []).filter((r: any) => r.id !== s.room_id && !busyFor(r.id, [s.section_id]))
          .map((r: any) => ({ id: r.id, name: r.name, floor: r.floor, capacity: r.capacity, fits: r.capacity >= sec.student_count }))
          .sort((a: any, b: any) => Number(b.fits) - Number(a.fits)
            || Math.abs(fl(a.floor) - pf) - Math.abs(fl(b.floor) - pf)
            || (a.fits ? a.capacity - b.capacity : b.capacity - a.capacity));
        const grouped = new Map<string, any[]>();
        day.filter((o: any) => o.section_id !== s.section_id && o.room_id)
          .forEach((o: any) => grouped.set(o.section_id, [...(grouped.get(o.section_id) || []), o]));
        const swaps = [...grouped.values()].filter((g) => {
          const roomId = g[0].room_id, times = g.map(slot);
          return !!s.room_id && !busyFor(roomId, [s.section_id, g[0].section_id])
            && !day.some((o: any) => o.room_id === s.room_id && ![s.section_id, g[0].section_id].includes(o.section_id) && times.includes(slot(o)));
        }).map((g) => {
          const theirs = R(g[0].room_id), ours = R(s.room_id);
          const fitsMe = !!theirs && theirs.capacity >= sec.student_count;
          const fitsThem = !!ours && ours.capacity >= g[0].section.student_count;
          return { with_id: g[0].id, label: `${g[0].program?.code} ${g[0].section?.year_level}${g[0].section?.name}`,
            room: theirs?.name || "Unknown room", fits: fitsMe && fitsThem, fitsMe, fitsThem };
        }).sort((a, b) => Number(b.fits) - Number(a.fits));
        return res.json({ rooms: free, swaps });
      }

      if (action === "set_room") {
        const room = R(b.room_id);
        if (!room || busyFor(room.id, [s.section_id]))
          return res.status(409).json({ error: "That room is already used at those hours" });
        if (room.capacity < sec.student_count && !b.override)
          return tooSmall(`Room ${room.name} holds ${room.capacity} but the section has ${sec.student_count} students`);
        const { error } = await db.from("schedules").update({ room_id: room.id }).in("id", myIds);
        if (error) throw error;
        await log(me, "change room", "schedules", { section_id: s.section_id, date: s.exam_date, room: room.name, override: !!b.override });
        return res.json({ ok: true });
      }

      if (action === "swap_room") {
        const o = day.find((x: any) => x.id === b.with_id);
        if (!o) return res.status(404).json({ error: "That block no longer exists" });
        const theirs = day.filter((x: any) => x.section_id === o.section_id);
        const roomA = s.room_id, roomB = o.room_id;
        if (!roomA || !roomB) return res.status(409).json({ error: "Both blocks need an assigned room to swap" });
        if (busyFor(roomB, [s.section_id, o.section_id])
          || day.some((x: any) => x.room_id === roomA && ![s.section_id, o.section_id].includes(x.section_id) && theirs.map(slot).includes(slot(x))))
          return res.status(409).json({ error: "That swap clashes with another exam" });
        const a = R(roomA), bRoom = R(roomB);
        if (!b.override && (bRoom!.capacity < sec.student_count || a!.capacity < o.section.student_count))
          return tooSmall("After the swap one of the sections would be in a room that is too small");
        const { error: e1 } = await db.from("schedules").update({ room_id: roomB }).in("id", myIds);
        if (e1) throw e1;
        const { error: e2 } = await db.from("schedules").update({ room_id: roomA }).in("id", theirs.map((x: any) => x.id));
        if (e2) throw e2;
        await log(me, "swap room", "schedules", { section_id: s.section_id, with: o.section_id, date: s.exam_date, override: !!b.override });
        return res.json({ ok: true });
      }
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
