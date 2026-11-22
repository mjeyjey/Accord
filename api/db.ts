// api/db.ts

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db, authenticate, log, fetchAll, toTrash, restore, closeEndedPeriods, manilaToday, clearAuthCache, Me, Role } from "./_lib.js";
import { sendMail, emailLayout } from "./_otp.js";
import { endOf, hhmm, MAX_PER_DAY } from "./_scheduler.js";
import { passwordProblem } from "./_password.js";
import { notify } from "./_notify.js";

const ALL: Role[] = ["admin", "head", "proctor"];
const MGR: Role[] = ["admin", "head"];

// Who can read/write each table. Heads are further limited to their own department (see inScope).
const RULES: Record<string, { read: Role[]; write: Role[]; select: string }> = {
  departments: { read: ALL, write: MGR, select: "*" },
  programs: {
    read: ALL,
    write: MGR,
    select: "*, department:departments(code,name)",
  },
  profiles: {
    read: MGR,
    write: MGR,
    select: "*, department:departments(code)",
  },
  subjects: {
    read: MGR,
    write: MGR,
    select: "*, program:programs(code,department_id)",
  },
  sections: {
    read: MGR,
    write: MGR,
    select: "*, program:programs(code,department_id)",
  },
  rooms: { read: ALL, write: MGR, select: "*, department:departments(code)" },
  availability: {
    read: ALL,
    write: ALL,
    select: "*, proctor:profiles(full_name,avatar_url,department_id,department:departments(code))",
  },
  exam_periods: { read: ALL, write: MGR, select: "*" },
  schedules: {
    read: ALL,
    write: MGR,
    select:
      "*, section:sections(name,year_level,student_count), subject:subjects(code,title), room:rooms(name,floor,capacity), proctor:profiles(full_name), program:programs(code,department_id), period:exam_periods(id,name,semester,start_date,end_date)",
  },
  audit_log: { read: ["admin"], write: [], select: "*, user:profiles(full_name,avatar_url)" },
  bulletins: { read: ALL, write: ["admin"], select: "*, department:departments(code), author:profiles(role)" },
  notifications: { read: ALL, write: ALL, select: "*" },
};
const SCOPED = ["programs", "subjects", "sections", "schedules"];

async function inScope(me: Me, table: string, row: any): Promise<boolean> {
  if (me.role !== "head") return true;
  // Heads may only touch proctors of their own department.
  if (table === "profiles")
    return (
      row.role === "proctor" &&
      !!me.department_id &&
      row.department_id === me.department_id
    );
  if (!SCOPED.includes(table)) return true;
  let dept: string | null = table === "programs" ? row.department_id : null;
  if (table !== "programs" && row.program_id) {
    const { data } = await db
      .from("programs")
      .select("department_id")
      .eq("id", row.program_id)
      .single();
    dept = data?.department_id ?? null;
  }
  return !!dept && dept === me.department_id;
}

// When a schedule row is edited by hand, make sure it does not break any rule.
async function checkSchedule(
  id: string,
  m: any,
  body: any,
): Promise<string | null> {
  if (body.start_time) body.end_time = endOf(body.start_time);
  if (!m.exam_date || !m.start_time || !m.room_id) return null;
  body.status = "scheduled";
  body.reason = null;
  const [{ data: room }, { data: sec }, { data: clash }] = await Promise.all([
    db.from("rooms").select("name,capacity").eq("id", m.room_id).single(),
    db
      .from("sections")
      .select("name,student_count")
      .eq("id", m.section_id)
      .single(),
    db
      .from("schedules")
      .select("room_id,proctor_id,section_id")
      .eq("exam_date", m.exam_date)
      .eq("start_time", m.start_time)
      .eq("status", "scheduled")
      .neq("id", id),
  ]);
  const c: any[] = clash || [];
  if (room && sec && room.capacity < sec.student_count)
    return `Room ${room.name} holds ${room.capacity} but the section has ${sec.student_count} students`;
  if (c.some((x) => x.room_id === m.room_id))
    return "That room is already used at that time";
  if (m.proctor_id && c.some((x) => x.proctor_id === m.proctor_id))
    return "That proctor is already assigned at that time";
  if (c.some((x) => x.section_id === m.section_id))
    return "That section already has an exam at that time";
  const { count } = await db
    .from("schedules")
    .select("id", { count: "exact", head: true })
    .eq("section_id", m.section_id)
    .eq("exam_date", m.exam_date)
    .eq("status", "scheduled")
    .neq("id", id);
  if ((count || 0) >= MAX_PER_DAY)
    return `A section can have at most ${MAX_PER_DAY} exams per day`;
  return null;
}

const LOCKED = "This exam period has already started, so availability can no longer be added, changed or removed.";

async function periodStarted(date: string): Promise<boolean> {
  const { count } = await db.from("exam_periods").select("id", { count: "exact", head: true })
    .lte("start_date", date).gte("end_date", date).lte("start_date", manilaToday());
  return !!count;
}

async function checkAvailability(row: any, enforceLock = false): Promise<string | null> {
  if (!row.date || !row.start_time || !row.end_time)
    return "Date, start time and end time are required";
  if (hhmm(row.end_time) <= hhmm(row.start_time))
    return "The end time must be after the start time";
  const { count } = await db
    .from("exam_periods")
    .select("id", { count: "exact", head: true })
    .lte("start_date", row.date)
    .gte("end_date", row.date);
  if (!count) return "Pick a date inside an exam period (between its start and end date)";
  if (enforceLock && (await periodStarted(row.date))) return LOCKED;
  return null;
}

async function announcePeriod(me: Me, p: any) {
  const title = `New exam period: ${p.name}`;
  const text = `${p.name} runs from ${p.start_date} to ${p.end_date}. Proctors: please enter your time availability before ${p.start_date}. It locks once the period starts.`;
  await db.from("bulletins").insert({ title, body: text, department_id: null, kind: "availability", created_by: me.id, created_by_name: me.full_name });
  const people = await fetchAll(() => db.from("profiles").select("id").eq("status", "active").neq("id", me.id).order("id"));
  await notify(people.map((x: any) => ({ user_id: x.id, kind: "availability", title, body: text })));
}

async function createUser(me: Me, body: any, res: VercelResponse) {
  if (me.role === "head") {
    if (!me.department_id)
      return res
        .status(403)
        .json({ error: "Your account has no department yet. Ask an admin." });
    body.role = "proctor";
    body.department_id = me.department_id;
  }
  const { email, password, full_name, role, department_id } = body;
  if (!email || !password || !full_name || !role)
    return res
      .status(400)
      .json({ error: "Name, email, password and role are required" });
  const pwBad = passwordProblem(String(password));
  if (pwBad) return res.status(400).json({ error: pwBad });
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user)
    return res
      .status(400)
      .json({ error: error?.message || "Could not create the user" });
  const { error: e2 } = await db.from("profiles").insert({
    id: data.user.id,
    full_name,
    email,
    role,
    department_id: department_id || null,
  });
  if (e2) {
    await db.auth.admin.deleteUser(data.user.id);
    return res.status(400).json({ error: e2.message });
  }
  await log(me, "create", "profiles", { full_name, role });
  return res.status(201).json({ id: data.user.id });
}

async function postBulletin(me: Me, body: any, res: VercelResponse) {
  const title = String(body.title || "").trim();
  const text = String(body.body || "").trim();
  const department_id = body.department_id ? String(body.department_id) : null;
  if (!title || !text) return res.status(400).json({ error: "Title and message are required" });
  const since = new Date(Date.now() - 30000).toISOString();
  const { count: dup } = await db.from("bulletins").select("id", { count: "exact", head: true })
    .eq("created_by", me.id).eq("title", title).eq("body", text).gte("created_at", since);
  if (dup) return res.status(409).json({ error: "That announcement was just posted" });
  const { data, error } = await db.from("bulletins")
    .insert({ title, body: text, department_id, created_by: me.id, created_by_name: me.full_name })
    .select().single();
  if (error) throw error;
  const people = await fetchAll(() => {
    let q: any = db.from("profiles").select("id").eq("status", "active").neq("id", me.id);
    if (department_id) q = q.eq("department_id", department_id);
    return q.order("id");
  });
  await notify(people.map((p: any) => ({
      user_id: p.id, kind: "bulletin", title: `Announcement: ${title}`,
      body: text.length > 140 ? text.slice(0, 137) + "…" : text,
      mail: text,
    })));
  await log(me, "announce", "bulletins", { title, department_id });
  return res.status(201).json(data);
}

// Admins and heads choose how many hours before an exam a proctor may still accept an open block.
function cutoffProblem(body: any): string | null {
  if (!("accept_cutoff_hours" in body)) return null;
  const n = Math.floor(Number(body.accept_cutoff_hours));
  if (!(n >= 0 && n <= 168)) return "Choose between 0 and 168 hours";
  body.accept_cutoff_hours = n;
  return null;
}

// Natural keys: if a row with the same values exists, a second insert is refused.
const NATURAL: Record<string, string[]> = {
  availability: ["proctor_id", "date", "start_time", "end_time"],
  exam_periods: ["name", "start_date", "end_date"],
  sections: ["program_id", "year_level", "name"],
  subjects: ["program_id", "year_level", "semester", "code"],
  programs: ["code"], departments: ["code"], rooms: ["name"],
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const me = await authenticate(req, res);
  if (!me) return;
  const table = String(req.query.table || "");
  if (table === "me") {
    if (req.method === "PATCH") {
      const b: any = req.body || {};
      const patch: any = {};
      if (typeof b.full_name === "string" && b.full_name.trim()) patch.full_name = b.full_name.trim();
      if ("avatar_url" in b) patch.avatar_url = b.avatar_url || null;
      if (b.tour_seen === true) patch.tour_seen_at = new Date().toISOString();
      const { data, error } = await db.from("profiles").update(patch).eq("id", me.id).select().single();
      if (error) return res.status(400).json({ error: error.message });
      clearAuthCache(me.id);
      await log(me, "update", "profiles", { id: me.id, profile: "own details" });
      return res.json(data);
    }
    let department: any = null;
    if (me.department_id) {
      const { data } = await db.from("departments").select("code,name").eq("id", me.department_id).single();
      department = data;
    }
    return res.json({ ...me, department });
  }

  if (table === "trash") {
    if (me.role !== "admin" && me.role !== "head") return res.status(403).json({ error: "Not allowed" });
    try {
      const { data: expired, error: purgeError } = await db.from("trash").delete()
        .lt("deleted_at", new Date(Date.now() - 30 * 86400000).toISOString()).select("id");
      if (purgeError) throw purgeError;
      if (expired?.length) await log(me, "purge", "trash", { count: expired.length, automatic: true });
      const id = req.query.id ? String(req.query.id) : "";
      if (req.method === "GET") {
        const rows = await fetchAll(() => db.from("trash")
          .select("id,entity,label,deleted_by,deleted_by_name,deleted_at").order("deleted_at", { ascending: false }).order("id"));
        return res.json(rows);
      }
      if (req.method === "POST") {
        if (!id) return res.status(400).json({ error: "Missing id" });
        const { data: item, error } = await db.from("trash").select("*").eq("id", id).single();
        if (error || !item) return res.status(404).json({ error: "Trash item not found" });
        try { await restore(item); }
        catch (e: any) {
          if (e?.code === "23503" || e?.code === "23505")
            return res.status(409).json({ error: "Restore its parent first or check for a duplicate code" });
          throw e;
        }
        const { error: deleteError } = await db.from("trash").delete().eq("id", id);
        if (deleteError) throw deleteError;
        await log(me, "restore", item.entity, { id, label: item.label });
        return res.json({ ok: true });
      }
      if (req.method === "DELETE") {
        const query = db.from("trash").delete().select("id");
        const { data, error } = id ? await query.eq("id", id) : await query;
        if (error) throw error;
        await log(me, "purge", "trash", { count: data?.length || 0, id: id || null, automatic: false });
        return res.json({ ok: true, count: data?.length || 0 });
      }
      return res.status(405).end();
    } catch (e: any) {
      return res.status(400).json({ error: e?.message || "Server error" });
    }
  }

  const rule = RULES[table];
  if (!rule || !rule.read.includes(me.role))
    return res.status(403).json({ error: "Not allowed" });
  const id = req.query.id ? String(req.query.id) : "";
  const body: any = req.body || {};
  const mine = me.role === "proctor";

  try {
    if (table === "exam_periods" || table === "notifications") await closeEndedPeriods();
    if (req.method === "GET") {
      let rows = await fetchAll(() => {
        let q: any = db.from(table).select(rule.select);
        if (mine && (table === "schedules" || table === "availability"))
          q = q.eq("proctor_id", me.id);
        if (table === "schedules") q = q.order("exam_date").order("start_time");
        if (table === "audit_log")
          q = q.order("created_at", { ascending: false });
        if (table === "availability") q = q.order("date");
        if (table === "bulletins") q = q.order("created_at", { ascending: false });
        if (table === "notifications")
          q = q.eq("user_id", me.id).order("created_at", { ascending: false });
        return q.order("id");
      });
      if (table === "audit_log") rows = rows.slice(0, 500);
      if (table === "notifications") rows = rows.slice(0, 100);
      if (table === "profiles") {
        const used = await fetchAll(() =>
          db.from("schedules").select("proctor_id")
            .eq("status", "scheduled").not("proctor_id", "is", null)
            .gte("exam_date", manilaToday()).order("id"),
        );
        const hours = new Map<string, number>();
        used.forEach((r: any) => hours.set(r.proctor_id, (hours.get(r.proctor_id) || 0) + 1));
        rows = rows.map((r: any) => ({ ...r, assigned_hours: hours.get(r.id) || 0 }));
      }
      if (table === "bulletins" && me.role !== "admin")
        rows = rows.filter((r) => !r.department_id || r.department_id === me.department_id);
      if (table === "schedules" && me.role === "head")
        rows = rows.filter(
          (r) => r.program?.department_id === me.department_id,
        );
      if (table === "profiles" && me.role === "head")
        rows = rows.filter((r) => r.role === "proctor");
      if (table === "availability" && me.role === "head")
        rows = rows.filter((r) => r.proctor?.department_id === me.department_id);
      return res.json(rows);
    }

    if (!rule.write.includes(me.role))
      return res.status(403).json({ error: "Not allowed" });
    if (table === "departments" && me.role === "head" && req.method !== "PATCH")
      return res.status(403).json({ error: "Only an admin can add or delete departments" });
    if (table === "notifications" && req.method !== "PATCH")
      return res.status(403).json({ error: "Not allowed" });

    if (req.method === "POST") {
      if (table === "bulletins") return await postBulletin(me, body, res);
      if (table === "profiles") return await createUser(me, body, res);
      if (table === "availability" && mine) body.proctor_id = me.id;
      if (table === "exam_periods") {
        delete body.status;
        const bad = cutoffProblem(body);
        if (bad) return res.status(400).json({ error: bad });
      }
      if (table === "availability") {
        const bad = await checkAvailability(body, mine);
        if (bad) return res.status(400).json({ error: bad });
      }
      if (!(await inScope(me, table, body)))
        return res
          .status(403)
          .json({ error: "That is outside your department" });
      const keys = NATURAL[table];
      if (keys && keys.every((k) => body[k] !== undefined && body[k] !== null)) {
        let dup: any = db.from(table).select("id", { count: "exact", head: true });
        for (const k of keys) dup = dup.eq(k, body[k]);
        const { count } = await dup;
        if (count) return res.status(409).json({ error: "That record already exists" });
      }
      const { data, error } = await db
        .from(table)
        .insert(body)
        .select()
        .single();
      if (error) throw error;
      await log(me, "create", table, body);
      if (table === "exam_periods") { try { await announcePeriod(me, data); } catch { /* do not block creation */ } }
      return res.status(201).json(data);
    }

    if (!id) return res.status(400).json({ error: "Missing id" });
    const { data: old } = await db
      .from(table)
      .select("*")
      .eq("id", id)
      .single();
    if (!old) return res.status(404).json({ error: "Not found" });
    if (table === "departments" && me.role === "head") {
      if (old.id !== me.department_id) return res.status(403).json({ error: "Not your department" });
      for (const k of Object.keys(body)) if (k !== "logo_url") delete body[k];
    }
    if (
      !(await inScope(me, table, old)) ||
      (table === "availability" && mine && old.proctor_id !== me.id) ||
      (table === "notifications" && old.user_id !== me.id)
    )
      return res.status(403).json({ error: "Not allowed" });

    if (req.method === "PATCH") {
      if (table === "profiles") { delete body.email; delete body.id; }
      if (table === "exam_periods") {
        delete body.status;
        const bad = cutoffProblem(body);
        if (bad) return res.status(400).json({ error: bad });
      }
      if (table === "notifications")
        for (const k of Object.keys(body)) if (k !== "read") delete body[k];
      if (table === "availability") {
        const bad = mine && (await periodStarted(old.date)) ? LOCKED : await checkAvailability({ ...old, ...body }, mine);
        if (bad) return res.status(400).json({ error: bad });
      }
      if (table === "profiles" && me.role === "head") {
        delete body.role;
        body.department_id = me.department_id;
      }
      if (!(await inScope(me, table, { ...old, ...body })))
        return res
          .status(403)
          .json({ error: "That is outside your department" });
      if (table === "schedules") {
        const bad = await checkSchedule(id, { ...old, ...body }, body);
        if (bad) return res.status(409).json({ error: bad });
      }
      const { data, error } = await db
        .from(table)
        .update(body)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      if (table === "profiles") clearAuthCache(id);
      if (table === "profiles" && old.status === "pending" && body.status === "active" && old.email)
        await sendMail(old.email, "Your Accord account was approved",
          `Hi ${old.full_name},\n\nYour Accord account has been approved. You can now log in.\n\nLa Concepcion College`,
          emailLayout({ preheader: "Your account was approved", heading: "You’re approved",
            intro: `Hi ${String(old.full_name).replace(/[&<>\"]/g, (c: string) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!))}, your Accord account has been approved. You can now log in.`, to: old.email })).catch(() => {});
      if (table !== "notifications") await log(me, "update", table, { id, ...body });
      return res.json(data);
    }

    if (req.method === "DELETE") {
      if (table === "availability" && mine && (await periodStarted(old.date)))
        return res.status(409).json({ error: LOCKED });
      if (table === "profiles") {
        if (id === me.id)
          return res.status(400).json({ error: "You cannot delete yourself" });
        const { error } = await db.auth.admin.deleteUser(id); // cascades to profiles
        if (error) throw error;
        clearAuthCache(id);
      } else {
        if (["departments", "programs", "subjects", "sections", "rooms", "exam_periods"].includes(table))
          await toTrash(me, table, old);
        const { error } = await db.from(table).delete().eq("id", id);
        if (error) throw error;
      }
      await log(me, "delete", table, { id });
      return res.json({ ok: true });
    }
    return res.status(405).end();
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Server error" });
  }
}
