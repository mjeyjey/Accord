import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db, authenticate, fetchAll, manilaToday, acceptClosed, cutoffHours, type Me, type Role } from "./_lib.js";
import { SLOTS, groupAvail, isFree, hhmm, endOf, MAX_PER_DAY } from "./_scheduler.js";
import { geminiEnabled, generate } from "./_gemini.js";

// Keyword-based assistant. All answers come from this app's data or the built-in guide;
// this endpoint does not call an external AI service.
type Link = { label: string; to: string };
const MANAGERS: Role[] = ["admin", "head"];
const ADMIN_TABS = ["Departments", "Programs and floors", "Subjects", "Sections", "Rooms", "Proctors", "Department heads", "Account requests"];
const HEAD_TABS = ["Programs and floors", "Subjects", "Sections", "Rooms", "Proctors", "Account requests"];
const SEL = "id,period_id,section_id,room_id,proctor_id,exam_date,start_time,end_time,status,reason,emergency,emergency_note,program:programs(code,department_id),section:sections(name,year_level,student_count),subject:subjects(code,title),room:rooms(name,floor,capacity),proctor:profiles(full_name)";
const SLOTS_ALL = [...SLOTS.AM, ...SLOTS.PM];
const pad = (n: number) => String(n).padStart(2, "0");
const norm = (s: string) => s.toLowerCase().replace(/[’'`]/g, "").replace(/[^a-z0-9:/\- ]+/g, " ").replace(/\s+/g, " ").trim();
const dateLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const bullets = (xs: string[], max = 12) => xs.slice(0, max).map((x) => `- ${x}`).join("\n") + (xs.length > max ? `\n- …and ${xs.length - max} more` : "");
const floorLabel = (f: string) => f === "Ground" ? "Ground Floor" : `${f} Floor`;
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function parseDate(q: string, today: string): string | null {
  let m = q.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (m) return m[0];
  if (/\b(today|tonight|ngayon)\b/.test(q)) return today;
  if (/\b(tomorrow|tmrw|bukas)\b/.test(q)) return addDays(today, 1);
  if (/\b(yesterday|kahapon)\b/.test(q)) return addDays(today, -1);
  const year = today.slice(0, 4);
  m = q.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? (\d{1,2})\b/);
  if (m && +m[2] >= 1 && +m[2] <= 31) return `${year}-${pad(MONTHS.indexOf(m[1]) + 1)}-${pad(+m[2])}`;
  m = q.match(/\b(\d{1,2}) (jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  if (m && +m[1] >= 1 && +m[1] <= 31) return `${year}-${pad(MONTHS.indexOf(m[2]) + 1)}-${pad(+m[1])}`;
  m = q.match(/\b(\d{1,2})\/(\d{1,2})\b/);
  if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) return `${year}-${pad(+m[1])}-${pad(+m[2])}`;
  m = q.match(/\b(next |this )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (m) {
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    let off = (WEEKDAYS.indexOf(m[2]) - dow + 7) % 7;
    if (m[1] === "next " && off === 0) off = 7;
    return addDays(today, off);
  }
  return null;
}
function parseHours(q: string): string[] {
  const a = q.match(/\b(\d{1,2})(?::(\d{2}))? ?(am|pm)\b/);
  if (a) { const t = `${pad((+a[1] % 12) + (a[3] === "pm" ? 12 : 0))}:00`; return SLOTS_ALL.includes(t) ? [t] : []; }
  const b = q.match(/\b([01]?\d|2[0-3]):00\b/);
  if (b) { const t = `${pad(+b[1])}:00`; return SLOTS_ALL.includes(t) ? [t] : []; }
  if (/\b(morning|umaga)\b/.test(q)) return SLOTS.AM;
  if (/\b(afternoon|hapon|tanghali)\b/.test(q)) return SLOTS.PM;
  return [];
}
function ranges(hours: string[]) {
  const hs = [...hours].sort(); const out: string[] = []; let start = "", prev = "";
  for (const h of hs) {
    if (prev && +h.slice(0, 2) === +prev.slice(0, 2) + 1) { prev = h; continue; }
    if (start) out.push(`${start}-${endOf(prev)}`); start = prev = h;
  }
  if (start) out.push(`${start}-${endOf(prev)}`);
  return out.join(", ");
}
function validLink(me: Me, to: string) {
  if (me.role === "proctor") return ["/my-schedule", "/requests", "/availability"].includes(to);
  if (["/", "/#emergencies", "/#available", "/reports", "/history", "/periods"].includes(to)) return true;
  if (/^\/periods\?period=[0-9a-f-]{36}(&filter=(pending|unplaced|issues))?$/.test(to) || /^\/periods\?filter=(pending|unplaced|issues)$/.test(to)) return true;
  const m = to.match(/^\/config\?tab=(.+)$/);
  if (!m) return false;
  try { return (me.role === "admin" ? ADMIN_TABS : HEAD_TABS).includes(decodeURIComponent(m[1])); } catch { return false; }
}
function link(me: Me, links: Link[], label: string, to: string) {
  if (validLink(me, to) && links.length < 4 && !links.some((l) => l.to === to)) links.push({ label, to });
}

const activePeriods = () => fetchAll(() => db.from("exam_periods").select("*").neq("status", "ended").order("start_date").order("id"));
async function periodsFor(me: Me) {
  const ps = await activePeriods();
  if (me.role !== "head") return ps;
  const progs = await fetchAll(() => db.from("programs").select("id").eq("department_id", me.department_id).order("id"));
  const ids = new Set(progs.map((p) => p.id));
  return ps.filter((p: any) => (p.program_ids || []).some((id: string) => ids.has(id)));
}
async function schedulesFor(me: Me, periodId?: string, date?: string) {
  let ids: string[] = [];
  if (!date) {
    const ps = await periodsFor(me);
    ids = periodId ? (ps.some((p: any) => p.id === periodId) ? [periodId] : []) : ps.map((p: any) => p.id);
    if (!ids.length) return [];
  }
  const rows = await fetchAll(() => {
    let q: any = db.from("schedules").select(SEL);
    q = date ? q.eq("exam_date", date) : q.in("period_id", ids);
    return q.order("exam_date").order("start_time").order("id");
  });
  return me.role === "head" ? rows.filter((r) => r.program?.department_id === me.department_id) : rows;
}
function blocks(rows: any[]) {
  const groups = new Map<string, any[]>();
  for (const r of rows) {
    const k = `${r.period_id}|${r.exam_date}|${r.section_id}|${r.room_id}|${r.proctor_id}`;
    (groups.get(k) || groups.set(k, []).get(k)!).push(r);
  }
  return [...groups.values()].map((g) => {
    g.sort((a, b) => hhmm(a.start_time).localeCompare(hhmm(b.start_time)));
    const f = g[0];
    return { period_id: f.period_id, section_id: f.section_id, date: f.exam_date, slots: g.map((r) => hhmm(r.start_time)),
      time: `${hhmm(f.start_time)}-${hhmm(g[g.length - 1].end_time)}`, section: `${f.program?.code} ${f.section?.year_level}${f.section?.name}`,
      subjects: g.map((r) => r.subject?.code).join(", "), room: f.room?.name || null, proctor: f.proctor?.full_name || null,
      emergency: !!f.emergency, note: f.emergency_note || null, hours: g.length };
  }).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}
const blockLine = (b: any, withProctor = true) =>
  `${dateLabel(b.date)} · ${b.time} · ${b.section}${b.emergency ? " · EMERGENCY" : ""}\n  Subjects: ${b.subjects}\n  ${b.room ? `Room ${b.room}` : "Room TBA"}` +
  (withProctor ? ` · ${b.proctor || "Proctor TBA"}` : "");

// ---------- generic, role-scoped data reader (used by the AI) ----------
const ALLR: Role[] = ["admin", "head", "proctor"];
const READ_SPECS: Record<string, { select: string; roles: Role[]; order: [string, boolean] }> = {
  departments:   { select: "id,code,name", roles: ALLR, order: ["code", true] },
  programs:      { select: "id,code,name,floor,department_id,department:departments(code)", roles: ALLR, order: ["code", true] },
  profiles:      { select: "id,full_name,email,role,status,department_id,created_at,department:departments(code)", roles: MANAGERS, order: ["full_name", true] },
  subjects:      { select: "id,code,title,year_level,semester,program:programs(code,department_id)", roles: MANAGERS, order: ["code", true] },
  sections:      { select: "id,name,year_level,student_count,program:programs(code,department_id)", roles: MANAGERS, order: ["name", true] },
  rooms:         { select: "id,name,floor,capacity,department_id,department:departments(code)", roles: ALLR, order: ["name", true] },
  availability:  { select: "id,proctor_id,date,start_time,end_time,proctor:profiles(full_name,department_id)", roles: ALLR, order: ["date", true] },
  exam_periods:  { select: "*", roles: ALLR, order: ["start_date", true] },
  schedules:     { select: SEL, roles: ALLR, order: ["exam_date", true] },
  bulletins:     { select: "id,title,body,department_id,created_by_name,created_at,kind", roles: ALLR, order: ["created_at", false] },
  notifications: { select: "id,kind,title,body,read,created_at", roles: ALLR, order: ["created_at", false] },
  audit_log:     { select: "id,user_name,action,entity,details,created_at", roles: ["admin"], order: ["created_at", false] },
  trash:         { select: "id,entity,label,deleted_by_name,deleted_at", roles: ["admin"], order: ["deleted_at", false] },
};
const flat = (r: any, p = "", o: any = {}) => {
  for (const [k, v] of Object.entries(r)) {
    const key = p + k;
    if (v === null || v === undefined || v === "" || /(^|\.)id$|_id$/.test(key)) continue;
    if (Array.isArray(v)) o[key] = `${v.length} item(s)`;
    else if (k === "details") o[key] = JSON.stringify(v).slice(0, 200);
    else if (typeof v === "object") flat(v, key + ".", o);
    else o[key] = /time$/.test(k) ? hhmm(String(v)) : v;
  }
  return o;
};

async function readData(me: Me, a: any): Promise<string> {
  const table = String(a?.table || "");
  const has = Object.prototype.hasOwnProperty.call(READ_SPECS, table);
  const spec = has ? READ_SPECS[table] : null;
  if (!spec || !spec.roles.includes(me.role))
    return `You do not have access to "${table}". You can read: ${Object.keys(READ_SPECS).filter((t) => READ_SPECS[t].roles.includes(me.role)).join(", ")}.`;
  if (me.role === "head" && !me.department_id) return "Your account has no department yet.";
  const dept = me.department_id;

  let rows = await fetchAll(() => {
    let q: any = db.from(table).select(spec.select);
    if (table === "notifications") q = q.eq("user_id", me.id);
    if (me.role === "proctor" && (table === "schedules" || table === "availability")) q = q.eq("proctor_id", me.id);
    if (me.role === "head") {
      if (table === "profiles") q = q.eq("role", "proctor").eq("department_id", dept);
      if (table === "programs") q = q.eq("department_id", dept);
      if (table === "departments") q = q.eq("id", dept);
    }
    return q.order(spec.order[0], { ascending: spec.order[1] }).order("id");
  });

  if (me.role === "head") {
    if (["subjects", "sections", "schedules"].includes(table)) rows = rows.filter((r) => r.program?.department_id === dept);
    if (table === "availability") rows = rows.filter((r) => r.proctor?.department_id === dept);
    if (table === "rooms") rows = rows.filter((r) => !r.department_id || r.department_id === dept);
    if (table === "exam_periods") {
      const progs = await fetchAll(() => db.from("programs").select("id").eq("department_id", dept).order("id"));
      const ids = new Set(progs.map((p: any) => p.id));
      rows = rows.filter((p: any) => (p.program_ids || []).some((id: string) => ids.has(id)));
    }
  }
  if (me.role !== "admin" && table === "bulletins") rows = rows.filter((r) => !r.department_id || r.department_id === dept);

  let list = rows.map((r) => flat(r));
  const words = norm(String(a?.search || "")).split(" ").filter(Boolean);
  if (words.length) list = list.filter((r) => { const s = norm(JSON.stringify(r)); return words.every((w) => s.includes(w)); });
  const field = String(a?.field || ""), value = norm(String(a?.value || ""));
  if (field && value) list = list.filter((r) => norm(String(r[field] ?? "")).includes(value));

  const head = `${table}: ${plural(list.length, "record")} match${list.length === 1 ? "" : "es"} (rows in "schedules" are one exam hour each).`;
  if (!list.length) return head;
  const gb = String(a?.group_by || "");
  if (gb) {
    const m = new Map<string, number>();
    list.forEach((r) => { const k = String(r[gb] ?? "(none)"); m.set(k, (m.get(k) || 0) + 1); });
    return `${head}\nCount by ${gb}:\n${bullets([...m.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k}: ${n}`), 30)}`;
  }
  const limit = Math.min(30, Math.max(1, Math.floor(Number(a?.limit)) || 15));
  return `${head}\n${bullets(list.slice(0, limit).map((r) => Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(" · ")), limit)}`;
}

async function answer(me: Me, raw: string, links: Link[], prior?: string) {
  const q = norm(`${prior || ""} ${raw}`), own = norm(raw), today = manilaToday();
  const date = parseDate(own, today) || parseDate(q, today);
  const hours = parseHours(own).length ? parseHours(own) : parseHours(q);
  if (/^(hi|hello|hey|kumusta|musta)\b/.test(q)) return `Hi ${me.full_name.split(" ")[0]}! Ask me about Accord data or how to use it. Type "help" for examples.`;
  if (/\b(help|what can you do|examples|capabilities)\b/.test(q)) {
    if (me.role === "proctor") { link(me, links, "My schedule", "/my-schedule"); link(me, links, "Assignment requests", "/requests"); return `I can look up your schedule, availability and open assignments, or explain Accord. Try:\n- What is my next exam?\n- Which open assignments can I accept?\n- How do I add my availability?\n- How do I flag an emergency?\n- How many hours before an exam can I accept?`; }
    link(me, links, "Exam periods", "/periods"); link(me, links, "Dashboard", "/");
    return `I can look up live schedule data or explain Accord. Try:\n- How many proctors are available today?\n- Which sections are pending a proctor or room?\n- Any emergencies or unplaced exams?\n- What is the schedule of BSIS 3A?\n- Which rooms are free tomorrow at 9am?\n- Pending account requests\n- How do I generate or approve a schedule?`;
  }
  if (/\b(thanks|thank you|salamat)\b/.test(q)) return "You're welcome! Ask me anything else about Accord.";

  const mgr = MANAGERS.includes(me.role);
  if (!mgr) {
    if (/\b(cutoff|cut off|hours before|deadline to accept|how late.*accept)\b/.test(q)) {
      link(me, links, "Assignment requests", "/requests");
      return "Each exam period has its own cutoff, set by an admin or department head. Open assignments close at that many hours before the exam starts; a zero-hour cutoff means they close when the exam starts.";
    }
    if (/\b(availability|free hours|time slots)\b/.test(q) && /\b(my|mine|i|what|show|check)\b/.test(q)) {
      const { data, error } = await db.from("availability").select("date,start_time,end_time").eq("proctor_id", me.id).gte("date", date || today).order("date").order("start_time");
      if (error) throw error; link(me, links, "Open My availability", "/availability");
      if (!data?.length) return "You have no upcoming availability. Open My availability, pick your days and hours, then press Add. Availability locks when the period starts.";
      return `Your availability:\n${bullets(data.map((a) => `${dateLabel(a.date)}: ${hhmm(a.start_time)}-${hhmm(a.end_time)}`))}`;
    }
    if (/\b(open|available|which|any|assignments?|requests?|accept|claim)\b/.test(q)) {
      const [rows, mine, ps] = await Promise.all([
        fetchAll(() => db.from("schedules").select(SEL).eq("status", "scheduled").is("proctor_id", null).not("exam_date", "is", null).gte("exam_date", today).order("exam_date").order("start_time").order("id")),
        fetchAll(() => db.from("schedules").select("exam_date,start_time,section_id").eq("proctor_id", me.id).eq("status", "scheduled").order("id")), activePeriods(),
      ]);
      const pm = new Map<string, any>(ps.map((p: any) => [p.id, p]));
      let list = blocks(rows.filter((r) => pm.has(r.period_id))).filter((b) => !acceptClosed(b.date, b.time.slice(0, 5), cutoffHours(pm.get(b.period_id))));
      const periodMatch = ps.find((p: any) => norm(p.name).length > 2 && q.includes(norm(p.name)));
      if (periodMatch) list = list.filter((b) => b.period_id === periodMatch.id);
      const ok = list.filter((b) => !mine.some((m: any) => m.exam_date === b.date && (m.section_id !== b.section_id || b.slots.includes(hhmm(m.start_time)))));
      link(me, links, "Open Assignment requests", "/requests");
      if (!ok.length) return "There are no open sections you can still accept. Check Assignment requests again later; blocks close at the period's configured cutoff.";
      return `${plural(ok.length, "open block")} you can accept:\n${bullets(ok.slice(0, 12).map((b) => `${blockLine(b, false)} · ${pm.get(b.period_id)?.name} (cutoff ${cutoffHours(pm.get(b.period_id))}h)`))}`;
    }
    if (/\b(my|mine|i have|next|upcoming)\b/.test(q) && /\b(schedule|exam|exams|assignment|duty|block)\b/.test(q)) {
      const { data, error } = await db.from("schedules").select(SEL).eq("proctor_id", me.id).eq("status", "scheduled").gte("exam_date", date || today).order("exam_date").order("start_time").limit(120);
      if (error) throw error; link(me, links, "Open My schedule", "/my-schedule");
      const found = (data || []).filter((r: any) => !date || r.exam_date === date), bs = blocks(found);
      if (!bs.length) return date ? `You have no exam on ${dateLabel(date)}.` : "You have no upcoming exams yet. Check Assignment requests for open sections.";
      return `${date ? `Your exams on ${dateLabel(date)}:` : `Your next exam:\n${bullets([blockLine(bs[0], false)])}\n\nUpcoming blocks:`}\n${bullets(bs.map((b) => blockLine(b, false)))}`;
    }
    return guide(me, q, links);
  }

  const [periods, programs, people, rooms] = await Promise.all([
    periodsFor(me),
    fetchAll(() => { let x: any = db.from("programs").select("id,code,name,floor,department_id"); if (me.role === "head") x = x.eq("department_id", me.department_id); return x.order("id"); }),
    fetchAll(() => { let x: any = db.from("profiles").select("id,full_name,email,department_id,department:departments(code)").eq("role", "proctor"); if (me.role === "head") x = x.eq("department_id", me.department_id); return x.order("id"); }),
    fetchAll(() => db.from("rooms").select("id,name,floor,capacity,department_id").order("id")),
  ]);
  const qs = new Set(q.split(" "));
  let period: any = null, person: any = null, program: any = null, room: any = null, year: number | null = null, secName: string | null = null;
  const pExact = periods.find((p: any) => norm(p.name).length > 2 && q.includes(norm(p.name)));
  period = pExact || null;
  let personScore = 0;
  for (const p of people) {
    const n = norm(p.full_name).split(" ").filter((w) => w.length > 2 && qs.has(w)).length;
    if (n > personScore) { person = p; personScore = n; } else if (n && n === personScore) person = null;
  }
  if (personScore < 2 && !/\b(proctor|teacher|faculty|sir|maam|professor|mr|mrs|ms)\b/.test(q)) person = null;
  for (const p of [...programs].sort((a, b) => b.code.length - a.code.length)) {
    const re = new RegExp(`(^|[^a-z0-9-])${p.code.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\-/g, "[- ]?")}(?![a-z-])`);
    const m = re.exec(q); if (!m) continue;
    program = p; const rest = q.slice(m.index + m[0].length);
    const sm = rest.match(/^ ?(\d) ?([a-z])\b/); const ym = rest.match(/^ ?(\d)\b/) || q.match(/\b(?:year|yr|y) ?(\d)\b/) || q.match(/\b(\d)(?:st|nd|rd|th) year\b/);
    if (sm) { year = +sm[1]; secName = sm[2]; } else if (ym) year = +ym[1];
    break;
  }
  const visibleRooms = me.role === "head" ? rooms.filter((r) => !r.department_id || r.department_id === me.department_id) : rooms;
  if (/\broom\b/.test(q)) room = visibleRooms.find((r) => qs.has(norm(r.name))) || null;
  const scopedPeriodId = period?.id;
  const periodScope = scopedPeriodId ? ` in ${period.name}` : "";

  if (/\bemergenc(?:y|ies)\b/.test(q)) {
    const rows = await schedulesFor(me, scopedPeriodId);
    const bs = blocks(rows.filter((r) => r.status === "scheduled" && r.emergency));
    link(me, links, "View emergencies", "/#emergencies");
    return bs.length ? `${plural(bs.length, "block")} flagged as an emergency:\n${bullets(bs.map((b) => `${blockLine(b)}${b.note ? `\n  Note: ${b.note}` : ""}`))}` : "No proctor emergencies are flagged right now.";
  }
  if (/\b(unplaced|unscheduled|not placed|could not place)\b/.test(q)) {
    const rows = (await schedulesFor(me, scopedPeriodId)).filter((r) => r.status === "unscheduled");
    link(me, links, "View unplaced sections", scopedPeriodId ? `/periods?period=${scopedPeriodId}&filter=unplaced` : "/periods?filter=unplaced");
    if (!rows.length) return `Everything was placed${periodScope}.`;
    const groups = new Map<string, any>();
    for (const r of rows) { const k = r.section_id; const x = groups.get(k) || { name: `${r.program?.code} ${r.section?.year_level}${r.section?.name}`, count: 0, reason: r.reason }; x.count++; groups.set(k, x); }
    return `${plural(rows.length, "exam hour")} in ${plural(groups.size, "section")} could not be placed${periodScope}:\n${bullets([...groups.values()].map((x) => `${x.name}: ${plural(x.count, "hour")} · ${x.reason || "no reason saved"}`))}`;
  }
  if (!/\b(account requests?|pending accounts?|sign ?ups?|registrations?)\b/.test(q) && /\b(pending|without|missing|unassigned|tba|waiting|no proctor|no room|to be announced)\b/.test(q)) {
    const rows = (await schedulesFor(me, scopedPeriodId)).filter((r) => r.status === "scheduled" && r.exam_date >= today && (!r.proctor_id || !r.room_id));
    const bs = blocks(rows); link(me, links, "View pending blocks", scopedPeriodId ? `/periods?period=${scopedPeriodId}&filter=pending` : "/periods?filter=pending");
    return bs.length ? `${plural(bs.length, "upcoming block")}${periodScope} still need something (${bs.filter((b) => !b.proctor).length} without a proctor, ${bs.filter((b) => !b.room).length} without a room):\n${bullets(bs.map((b) => blockLine(b)))}` : `Nothing is pending${periodScope}. Every upcoming block has a proctor and a room.`;
  }
  if (/\b(available|availability|free|vacant|who is free)\b/.test(q) && /\b(proctor|proctors|teacher|teachers|faculty|who)\b/.test(q)) {
    const d = date || today, ids = new Set(people.filter((p) => (p as any).status !== "pending").map((p) => p.id));
    const active = await fetchAll(() => { let x: any = db.from("profiles").select("id,full_name,department_id,department:departments(code)").eq("role", "proctor").eq("status", "active"); if (me.role === "head") x = x.eq("department_id", me.department_id); return x.order("id"); });
    const activeIds = new Set(active.map((p) => p.id));
    const av = (await fetchAll(() => db.from("availability").select("*").eq("date", d).order("id"))).filter((a) => activeIds.has(a.proctor_id));
    const booked = new Set((await fetchAll(() => db.from("schedules").select("proctor_id,start_time").eq("exam_date", d).eq("status", "scheduled").not("proctor_id", "is", null).order("id"))).filter((x) => activeIds.has(x.proctor_id)).map((x) => `${x.proctor_id}|${hhmm(x.start_time)}`));
    const by = groupAvail(av), list = active.filter((p) => by.has(p.id)).map((p) => ({ p, free: SLOTS_ALL.filter((t) => isFree(by.get(p.id), d, t) && !booked.has(`${p.id}|${t}`)) })).filter((x) => hours.length ? hours.some((h) => x.free.includes(h)) : x.free.length > 0);
    link(me, links, "View available proctors", "/#available");
    if (!list.length) return `No proctors with entered availability are free${hours.length ? ` at ${ranges(hours)}` : ""} on ${dateLabel(d)}.`;
    return `${plural(list.length, "proctor")} available on ${dateLabel(d)}${hours.length ? ` at ${ranges(hours)}` : ""}:\n${bullets(list.map(({ p, free }) => `${p.full_name} (${p.department?.code || "Unassigned"}): ${ranges(free)}`))}`;
  }
  if (person) {
    const [ex, av] = await Promise.all([
      fetchAll(() => db.from("schedules").select(SEL).eq("proctor_id", person.id).eq("status", "scheduled").gte("exam_date", date || today).order("exam_date").order("start_time").order("id")),
      fetchAll(() => db.from("availability").select("date,start_time,end_time").eq("proctor_id", person.id).gte("date", date || today).order("date").order("id")),
    ]);
    const scoped = me.role === "head" ? ex.filter((r) => r.program?.department_id === me.department_id) : ex;
    link(me, links, "Open Proctors", "/config?tab=Proctors");
    if (date) {
      const bs = blocks(scoped.filter((r) => r.exam_date === date));
      return `${person.full_name} on ${dateLabel(date)}:\n${bs.length ? bullets(bs.map((b) => blockLine(b, false))) : "No exams assigned."}`;
    }
    const bs = blocks(scoped);
    return `${person.full_name} (${person.department?.code || "Unassigned"}):\n- Upcoming exam hours: ${scoped.length}\n- Upcoming availability days: ${new Set(av.map((a) => a.date)).size}${bs.length ? `\nNext blocks:\n${bullets(bs.slice(0, 5).map((b) => blockLine(b, false)))}` : ""}`;
  }
  if (room && !(/\b(free|available|vacant|empty|unused)\b/.test(q))) {
    const rows = (await fetchAll(() => db.from("schedules").select(SEL).eq("room_id", room.id).eq("status", "scheduled").gte("exam_date", date || today).order("exam_date").order("start_time").order("id")));
    const scoped = me.role === "head" ? rows.filter((r) => r.program?.department_id === me.department_id) : rows;
    link(me, links, "Open Rooms", "/config?tab=Rooms");
    const bs = blocks(scoped.filter((r) => !date || r.exam_date === date));
    return `Room ${room.name}: ${floorLabel(room.floor)}, capacity ${room.capacity}.\n${bs.length ? `${date ? "Booked:" : "Upcoming use:"}\n${bullets(bs.map((b) => blockLine(b)))}` : date ? `Free all day on ${dateLabel(date)}.` : "No upcoming exams use this room."}`;
  }
  if (program && /\b(subject|subjects|curriculum|course|courses)\b/.test(q)) {
    let x: any = db.from("subjects").select("year_level,semester,code,title").eq("program_id", program.id).order("year_level").order("semester").order("code");
    if (year) x = x.eq("year_level", year);
    const { data, error } = await x; if (error) throw error; link(me, links, "Open Subjects", "/config?tab=Subjects");
    return data?.length ? `${program.code}${year ? ` year ${year}` : ""} subjects:\n${bullets(data.map((s: any) => `${s.code} ${s.title} · year ${s.year_level}, semester ${s.semester}`), 25)}` : `No subjects are saved for ${program.code}${year ? ` year ${year}` : ""}.`;
  }
  if (program && year && /\b(schedule|exam|section|exams)\b/.test(q)) {
    const rows = (await schedulesFor(me, scopedPeriodId)).filter((r) => r.program?.code === program.code && r.section?.year_level === year && (!secName || String(r.section?.name).toLowerCase() === secName));
    const bs = blocks(rows.filter((r) => r.status === "scheduled" && (!date || r.exam_date === date)));
    link(me, links, "Open Exam periods", scopedPeriodId ? `/periods?period=${scopedPeriodId}` : "/periods");
    return bs.length ? `${program.code} ${year}${secName || ""} schedule:\n${bullets(bs.map((b) => blockLine(b)))}` : `No schedule found for ${program.code} ${year}${secName || ""}${periodScope}.`;
  }
  if (/\b(account requests?|pending accounts?|sign ?ups?|registrations?)\b/.test(q)) {
    let x: any = db.from("profiles").select("full_name,email,department:departments(code)").eq("role", "proctor").eq("status", "pending");
    if (me.role === "head") x = x.eq("department_id", me.department_id);
    const { data, error } = await x.order("created_at"); if (error) throw error; link(me, links, "Open Account requests", "/config?tab=Account%20requests");
    return data?.length ? `${plural(data.length, "pending account request")}:\n${bullets(data.map((p: any) => `${p.full_name} (${p.email}) · ${p.department?.code || "Unassigned"}`))}` : "There are no pending account requests.";
  }
  if (/\b(free|available|vacant|empty|unused)\b/.test(q) && /\b(room|rooms)\b/.test(q)) {
    const d = date || today;
    const visible = me.role === "head" ? rooms.filter((r) => !r.department_id || r.department_id === me.department_id) : rooms;
    const usedRows = await fetchAll(() => db.from("schedules").select("room_id,start_time").eq("exam_date", d).eq("status", "scheduled").not("room_id", "is", null).order("id"));
    const used = new Map<string, Set<string>>();
    usedRows.forEach((r) => (used.get(r.room_id) || used.set(r.room_id, new Set()).get(r.room_id)!).add(hhmm(r.start_time)));
    const want = hours.length ? hours : SLOTS_ALL;
    const free = visible.filter((r) => want.every((h) => !used.get(r.id)?.has(h)));
    link(me, links, "Open Rooms", "/config?tab=Rooms");
    return free.length ? `${plural(free.length, "room")} free on ${dateLabel(d)}${hours.length ? ` at ${ranges(hours)}` : " (all day)"}:\n${bullets(free.map((r) => `${r.name} · ${floorLabel(r.floor)} · capacity ${r.capacity}`))}` : `No room is free on ${dateLabel(d)}${hours.length ? ` at ${ranges(hours)}` : " (all day)"}.`;
  }
  if (/\b(available|active|pending|count|how many|number of|total|overview|stats|statistics|status|periods?|placement rate|busiest|workload)\b/.test(q)) {
    const mine = (d: any) => me.role === "admin" || d === me.department_id;
    if (/\b(proctor|proctors|rooms|sections|programs|students|accounts|departments|overview|count|how many|total)\b/.test(q) && !/\bperiod status\b/.test(q)) {
      const [profiles, secs, progs] = await Promise.all([
        fetchAll(() => db.from("profiles").select("id,role,status,department_id").order("id")),
        fetchAll(() => db.from("sections").select("id,student_count,program:programs(department_id)").order("id")),
        fetchAll(() => db.from("programs").select("id,department_id").order("id")),
      ]);
      const n = { proctors: profiles.filter((p) => p.role === "proctor" && p.status === "active" && mine(p.department_id)).length,
        pending: profiles.filter((p) => p.role === "proctor" && p.status === "pending" && mine(p.department_id)).length,
        rooms: rooms.filter((r) => me.role === "admin" || !r.department_id || r.department_id === me.department_id).length,
        sections: secs.filter((s) => mine(s.program?.department_id)).length,
        students: secs.filter((s) => mine(s.program?.department_id)).reduce((sum, s) => sum + (s.student_count || 0), 0),
        programs: progs.filter((p) => mine(p.department_id)).length };
      const out: string[] = [];
      if (/\bproctor|proctors\b/.test(q)) out.push(`${plural(n.proctors, "active proctor")}${n.pending ? ` and ${plural(n.pending, "pending request")}` : ""}.`);
      if (/\broom|rooms\b/.test(q)) out.push(`${plural(n.rooms, "room")}.`);
      if (/\bsection|sections\b/.test(q)) out.push(`${plural(n.sections, "section")}.`);
      if (/\bstudents\b/.test(q)) out.push(`${plural(n.students, "student")} in total.`);
      if (/\bprogram|programs\b/.test(q)) out.push(`${plural(n.programs, "program")}.`);
      if (/\baccount|accounts\b/.test(q)) out.push(`${plural(n.pending, "pending account request")}.`);
      if (out.length) { link(me, links, "Open Configuration", "/config"); return out.join("\n"); }
    }
    if (/\bperiod|periods|status|approval\b/.test(q)) {
      const ps = period ? [period] : periods;
      const rows = await schedulesFor(me);
      link(me, links, "Open Exam periods", "/periods");
      return ps.length ? ps.map((p: any) => {
        const rs = rows.filter((r) => r.period_id === p.id), placed = rs.filter((r) => r.status === "scheduled").length;
        return `${p.name} (${p.start_date} to ${p.end_date}) · ${p.status === "draft" ? "Draft" : p.status === "generated" ? "Pending approval" : p.status} · ${placed} placed, ${rs.filter((r) => r.status === "unscheduled").length} unplaced · accept cutoff ${cutoffHours(p)}h before start`;
      }).join("\n") : "There are no active exam periods.";
    }
    const rs = await schedulesFor(me, scopedPeriodId);
    if (!rs.length) return `There is no generated schedule${periodScope} yet.`;
    const placed = rs.filter((r) => r.status === "scheduled");
    link(me, links, "Open Reports", "/reports");
    return `Schedule summary${periodScope}:\n- Placed: ${placed.length} of ${rs.length} exam hours (${Math.round(placed.length * 100 / rs.length)}%)\n- Unplaced: ${rs.length - placed.length}\n- Without proctor: ${placed.filter((r) => !r.proctor_id).length} · without room: ${placed.filter((r) => !r.room_id).length}\n- Sections: ${new Set(placed.map((r) => r.section_id)).size}`;
  }
  if (date && /\b(schedule|exam|exams|blocks|happening)\b/.test(q)) {
    const rows = (await schedulesFor(me, undefined, date)).filter((r) => r.status === "scheduled");
    const bs = blocks(rows); link(me, links, "Open Exam periods", "/periods");
    return bs.length ? `${dateLabel(date)}: ${plural(rows.length, "exam hour")} in ${plural(new Set(rows.map((r) => r.section_id)).size, "section")}.\n${bullets(bs.map((b) => blockLine(b)), 20)}` : `No exams are scheduled on ${dateLabel(date)}.`;
  }
  return guide(me, q, links, { periods, period, date });
}

function guide(me: Me, q: string, links: Link[], ctx?: any): string {
  const mgr = MANAGERS.includes(me.role);
  if (/\b(cutoff|cut off|hours before|deadline to accept|how late.*accept)\b/.test(q)) {
    if (me.role === "proctor") { link(me, links, "Assignment requests", "/requests"); return "Each exam period has its own cutoff, set by an admin or department head. Open assignments close at that many hours before the exam starts; a zero-hour cutoff means they close when the exam starts."; }
    link(me, links, "Open Exam periods", "/periods");
    const ps = ctx?.periods || [];
    return `Each period has its own proctor acceptance cutoff, from 0 to 168 hours before the exam. Set it in Exam periods using the “Proctors can accept until” selector. Zero means until the exam starts.${ps.length ? `\nCurrent settings:\n${bullets(ps.map((p: any) => `${p.name}: ${cutoffHours(p)} hour(s)`), 8)}` : ""}`;
  }
  if (/\b(generate|regenerate|create|build|make)\b/.test(q) && /\b(schedule|period|timetable)\b/.test(q)) { if (!mgr) return "Ask an admin or department head to generate a schedule."; link(me, links, "Open Exam periods", "/periods"); return "Open Exam periods, create a period if needed, select it, then choose Generate schedule and confirm. Resolve any unplaced exams afterward. Regenerating replaces the schedule and removes approval."; }
  if (/\b(approve|approval|revoke)\b/.test(q)) { if (me.role !== "admin") return "Only an admin can approve a generated schedule. Department heads can review the schedule and manage their department."; link(me, links, "Open Exam periods", "/periods"); return "In Exam periods, select a generated period and choose Approve schedule. You can revoke approval to return it to pending approval."; }
  if (/\b(availability)\b/.test(q)) { link(me, links, me.role === "proctor" ? "My availability" : "Available proctors", me.role === "proctor" ? "/availability" : "/#available"); return me.role === "proctor" ? "Open My availability, choose an upcoming period, select days and hours, then press Add. Availability locks when the period starts." : "Proctors enter availability before their period starts. The scheduler only assigns proctors whose availability covers each exam hour."; }
  if (/\b(emergency|flag|replacement)\b/.test(q)) { link(me, links, "Open My schedule", "/my-schedule"); return me.role === "proctor" ? "In My schedule, choose Flag emergency beside the affected day, describe the issue and send it. Admins and your department head are notified." : "Proctors flag emergencies from My schedule. Admins and the department head are notified and can use Find replacement on the dashboard."; }
  if (/\b(room|rooms)\b/.test(q) && mgr) { link(me, links, "Open Rooms", "/config?tab=Rooms"); return "Manage rooms in Configuration > Rooms. Add a name, floor and capacity, or use Import for an .xlsx/.csv with Room and Capacity columns."; }
  if (/\b(subject|curriculum|evaluation sheet)\b/.test(q) && mgr) { link(me, links, "Open Subjects", "/config?tab=Subjects"); return "Manage subjects in Configuration > Subjects. Use Add curriculum to import evaluation-sheet PDFs, review the extracted subjects, and apply them to the selected program."; }
  if (/\b(section|student count)\b/.test(q) && mgr) { link(me, links, "Open Sections", "/config?tab=Sections"); return "Manage sections in Configuration > Sections. Student count determines which rooms are large enough for each exam."; }
  if (/\b(export|download|pdf|png|csv)\b/.test(q) && mgr) { link(me, links, "Open Exam periods", "/periods"); return "In Exam periods, use the download control for a year level or export a department/all programs. Reports and History also have export options."; }
  if (/\b(trash|restore|deleted|backup|history)\b/.test(q) && mgr) { link(me, links, "Open History", "/history"); return "History contains Activity and Trash. Supported deleted records can be restored within 30 days. Admins can download a JSON backup from History."; }
  if (/\b(email|password|theme|profile|photo|settings)\b/.test(q)) return "Change your email or profile by clicking your name chip at the top right. Password and theme options are in Settings in the sidebar.";
  if (/\b(scheduler|algorithm|rules|how does.*work)\b/.test(q)) return `Each subject is a one-hour exam in the morning or afternoon slots. The scheduler avoids room, proctor and section clashes, respects room capacity and proctor availability, and limits a section to ${MAX_PER_DAY} exams per day. Unplaced exams include a reason.`;
  const topics: [string, string, string][] = [
    ["generate a schedule", "generate schedule period timetable", "Generate a schedule"],
    ["approve a schedule", "approve approval generated schedule period", "Approve a schedule"],
    ["change an exam block", "edit modify reschedule exam block room proctor", "Edit an exam block"],
    ["fix unplaced exams", "resolve unplaced unscheduled placement", "Fix unplaced exams"],
    ["export schedules", "export download pdf png csv reports", "Export and download"],
    ["import rooms or subjects", "import rooms curriculum subjects spreadsheet pdf", "Import data"],
    ["restore deleted data", "trash restore recover deleted history", "Trash and restore"],
    ["change settings", "settings password email theme profile", "Settings"],
    ["manage account requests", "account requests pending signups approve", "Account requests"],
  ];
  const stop = new Set("the a an is are do does did how what which who when where why to of in on at for and or my me you can could should would be it this that with about any there have has".split(" "));
  const stem = (w: string) => w.length > 4 ? w.replace(/(ing|ed|es|s)$/, "") : w;
  const queryWords = q.split(" ").filter((w) => w.length > 2 && !stop.has(w)).map(stem);
  let best: [string, string, string] | null = null, score = 0;
  for (const topic of topics) {
    const words = new Set(norm(`${topic[1]} ${topic[2]}`).split(" ").map(stem));
    const n = queryWords.filter((w) => words.has(w)).length;
    if (n > score) { best = topic; score = n; }
  }
  if (best && score >= 2) return `Maybe you mean “${best[0]}”? Try asking “How do I ${best[0]}?” for step-by-step instructions.`;
  return `I could not match that to a supported Accord question. Try:\n${bullets(me.role === "proctor" ? ["What is my next exam?", "Which open assignments can I accept?", "How do I add availability?", "How do I flag an emergency?"] : ["How many proctors are available today?", "Which sections are pending a proctor or room?", "Any proctor emergencies?", "How do I generate a schedule?"])}\nType “help” for examples.`;
}

const TOOLS = [{ functionDeclarations: [
  {
    name: "lookup_accord_data",
    description: "Answers common Accord questions (next exam, open assignments, pending blocks, emergencies, unplaced exams, free rooms or proctors) or the how-to guide. Pass one short, self-contained question.",
    parameters: { type: "OBJECT", properties: { question: { type: "STRING", description: "A short plain-English question" } }, required: ["question"] },
  },
  {
    name: "read_records",
    description: "Reads records from one Accord table, already limited to what the current user may see. Use it for any list, count, status or detail not covered by lookup_accord_data. Use group_by for counts (e.g. table=profiles group_by=status).",
    parameters: { type: "OBJECT", properties: {
      table: { type: "STRING", enum: Object.keys(READ_SPECS) },
      search: { type: "STRING", description: "Optional words that must all appear in the record" },
      field: { type: "STRING", description: "Optional column to filter, e.g. status, role, department.code, program.code, exam_date" },
      value: { type: "STRING", description: "Value for field" },
      group_by: { type: "STRING", description: "Optional column to count by" },
      limit: { type: "INTEGER", description: "Max rows to list (default 15, max 30)" },
    }, required: ["table"] },
  },
] }];

function systemPrompt(me: Me) {
  const examples = me.role === "proctor"
    ? ["What is my next exam?", "Which open assignments can I accept?", "What is my availability?", "How do I flag an emergency?", "How many hours before an exam can I accept?"]
    : ["How many proctors are available on 2026-11-24?", "Which sections are pending a proctor or room?", "Any proctor emergencies?", "Which exams could not be placed?", "What is the schedule of BSIS 3A?", "Which rooms are free tomorrow at 9am?", "Pending account requests", "How do I generate a schedule?"];
  return `You are the assistant inside Accord, the exam scheduling system of La Concepcion College.
You are talking to ${me.full_name}, a ${me.role === "head" ? "department head" : me.role}. Today is ${manilaToday()} (Philippine time).
Rules:
- For any question about Accord data or how to use Accord, call a tool first. Never answer from memory and never invent names, dates, rooms or numbers.
- Use lookup_accord_data for common questions and how-to. Use read_records for any other list, count, status or detail (tables: departments, programs, profiles, subjects, sections, rooms, availability, exam_periods, schedules, bulletins, notifications, audit_log, trash). The tools already limit results to what this user may see. If a tool says access is denied, tell the user you do not have access to that data. Never try to get around it.
- Give lookup_accord_data one short, self-contained question in plain English, with explicit dates (YYYY-MM-DD) and codes like "BSIS 3A". Examples:
${examples.map((e) => `  ${e}`).join("\n")}
- If the lookup says it could not match the question, retry once with simpler wording from the examples, then tell the user honestly.
- Answer only from lookup results. Be short and friendly. Plain text only: no markdown, no asterisks, no tables.
- Keep the structure of the lookup result. Start with one short line ending in a colon, then one "- " line per item. Put extra details of an item on the next lines, each indented with two spaces. Never merge items into a paragraph. Show at most 8 items, then say how many more there are.
- If the question is unrelated to Accord, say you can only help with Accord.
- Reply in the user's language (English or Filipino).`;
}

async function askGemini(me: Me, chat: { role: string; content: string }[], links: Link[]): Promise<string | null> {
  const contents: any[] = chat.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  for (let step = 0; step < 4; step++) {
    const data = await generate({ systemInstruction: { parts: [{ text: systemPrompt(me) }] }, contents, tools: TOOLS });
    const content = data?.candidates?.[0]?.content;
    const parts: any[] = content?.parts || [];
    const calls = parts.filter((p) => p.functionCall);
    if (!calls.length) return parts.filter((p) => !p.thought).map((p) => p.text || "").join("").trim() || null;
    contents.push(content); // keep the model's turn as-is (it may carry thought signatures)
    const replies: any[] = [];
    for (const c of calls) {
      const args = c.functionCall.args || {};
      let result: string;
      try {
        result = c.functionCall.name === "read_records"
          ? await readData(me, args)
          : await answer(me, String(args.question || "").slice(0, 300), links);
      } catch { result = "That lookup failed."; }
      replies.push({ functionResponse: { name: c.functionCall.name, response: { result } } });
    }
    contents.push({ role: "user", parts: replies });
  }
  return null;
}

function cleanChat(list: any) {
  const out = (Array.isArray(list) ? list.slice(-10) : [])
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({ role: m.role as string, content: String(m.content || "").slice(0, m.role === "user" ? 500 : 1500).trim() }))
    .filter((m) => m.content);
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const me = await authenticate(req, res);
  if (!me) return;
  if (me.role === "head" && !me.department_id) return res.json({ reply: "Your account has no department yet. Ask an admin to assign one.", links: [] });
  const chat = cleanChat((req.body || {}).messages);
  const users = chat.filter((m) => m.role === "user").map((m) => m.content);
  if (!users.length) return res.status(400).json({ error: "Ask a question first." });
  const links: Link[] = [];
  try {
    if (geminiEnabled()) {
      try {
        const reply = await askGemini(me, chat, links);
        if (reply) return res.json({ reply, links });
      } catch (e: any) { console.error("gemini:", e?.message); }
      links.length = 0; // Gemini failed: fall back to the built-in keyword answers
    }
    const last = users[users.length - 1];
    const prior = users.length > 1 && norm(last).split(" ").length <= 5 ? users[users.length - 2] : undefined;
    return res.json({ reply: await answer(me, last, links, prior), links });
  } catch (e: any) {
    console.error("assistant:", e?.message);
    return res.status(500).json({ error: "Sorry, I could not look that up right now. Please try again." });
  }
}
