// Scheduling engine. Edit SLOTS to change exam hours (each slot = 1 hour start).
export const SLOTS = {
  AM: ["08:00", "09:00", "10:00", "11:00"],
  PM: ["12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
};
export const FLOORS = ["Ground", "1st", "2nd", "3rd", "4th", "5th"];
export const MAX_PER_DAY = 5; // max exams one section can have in a single day
// true = a section never leaves its own exam days (days_per_year). Hours that don't fit are reported as unplaced.
export const STRICT_DAYS = true;
// Order in which the year levels of ONE program are stacked through the day (morning first).
// [2,1,3,4] => Y2 8:00, Y1 right after, then Y3, then Y4 (same as the printed BSIS schedule).
export const YEAR_ORDER = [2, 1, 3, 4];

export const hhmm = (t) => String(t).slice(0, 5);
export const endOf = (t) =>
  `${String(Number(hhmm(t).slice(0, 2)) + 1).padStart(2, "0")}:00`;

// Every date in the range, Sundays included.
export function examDates(start, end) {
  const out = [];
  const last = new Date(end + "T00:00:00Z");
  for (
    const d = new Date(start + "T00:00:00Z");
    d <= last;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function groupAvail(list) {
  const m = new Map();
  for (const a of list) {
    if (!m.has(a.proctor_id)) m.set(a.proctor_id, []);
    m.get(a.proctor_id).push(a);
  }
  return m;
}

// A proctor with NO availability rows is NOT available. Only the windows they entered count.
export const isFree = (list, date, t) =>
  !!list &&
  list.some(
    (a) =>
      a.date === date &&
      hhmm(a.start_time) <= hhmm(t) &&
      hhmm(a.end_time) >= endOf(t),
  );

function shuffle(a) {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

// Per program + year level ("cohort"): the first section alphabetically (the "anchor") is placed first,
// every other section copies its dates and hours (own room, own proctor).
// A year level keeps the SAME start hour on all its days; years of a program are stacked through the day.
export function buildSchedule(inp) {
  const {
    dates,
    programs,
    sections,
    subjects,
    rooms,
    proctors,
    availability,
    busy,
    blocked = new Map(),
    ignoreCapacity = false,
    spill = false,
  } = inp;
  const K = Math.max(1, Math.min(inp.daysPerYear || 1, dates.length));
  const ALL = [...SLOTS.AM, ...SLOTS.PM]; // one continuous day, no lunch gap

  const roomUsed = new Set();
  const procUsed = new Set();
  const secUsed = new Set();
  const avail = groupAvail(availability);
  const load = new Map();
  const secProctors = new Map();
  const secDays = new Map();
  const secDayRoom = new Map(); // section|date -> room its students stay in that day
  const secRoom = new Map(); // section -> room it used first (kept on later days)
  const secDayCount = new Map(); // section|date -> exams already placed that day
  const procDaySec = new Map(); // proctor|date -> the ONE section that proctor stays with that day
  const secDayProc = new Map(); // section|date -> proctor already covering it that day
  for (const b of busy) {
    const k = `${b.exam_date}|${hhmm(b.start_time)}`;
    if (b.room_id) roomUsed.add(`${b.room_id}|${k}`);
    if (b.proctor_id) procUsed.add(`${b.proctor_id}|${k}`);
    if (b.proctor_id && b.section_id && b.exam_date) procDaySec.set(`${b.proctor_id}|${b.exam_date}`, b.section_id);
    if (b.section_id) {
      secUsed.add(`${b.section_id}|${k}`);
      const dayKey = `${b.section_id}|${b.exam_date}`;
      secDayCount.set(dayKey, (secDayCount.get(dayKey) || 0) + 1);
      if (b.exam_date) {
        const days = secDays.get(b.section_id) || new Set();
        days.add(b.exam_date);
        secDays.set(b.section_id, days);
      }
      if (b.room_id) {
        secDayRoom.set(dayKey, b.room_id);
        if (!secRoom.has(b.section_id)) secRoom.set(b.section_id, b.room_id);
      }
    }
  }
  const deptIds = [...new Set(programs.map((p) => p.department_id))].sort();
  const progById = new Map(programs.map((p) => [p.id, p]));
  const roomNum = (r) => parseInt(String(r.name).replace(/\D/g, ""), 10) || 0;
  const maxCap = ignoreCapacity ? Infinity : Math.max(0, ...rooms.map((r) => r.capacity));
  const floorIdx = (f) => FLOORS.indexOf(f);
  const free = (set, id, d, slots) =>
    slots.every((t) => !set.has(`${id}|${d}|${t}`));

  // Start hour (index in ALL) of every cohort: years are stacked one after another through the day.
  const startOf = new Map();
  for (const prog of programs) {
    const years = [...new Set(sections.filter((s) => s.program_id === prog.id).map((s) => s.year_level))]
      .filter((y) => subjects.some((x) => x.program_id === prog.id && x.year_level === y))
      .sort((a, b) => {
        const ia = YEAR_ORDER.indexOf(a), ib = YEAR_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a - b;
      });
    let cur = 0;
    for (const y of years) {
      const count = subjects.filter((x) => x.program_id === prog.id && x.year_level === y).length;
      const L = Math.ceil(count / K); // longest day of this year level
      startOf.set(`${prog.id}|${y}`, Math.max(0, Math.min(cur, ALL.length - L)));
      cur += L;
    }
  }

  const rows = [];
  let unscheduled = 0;
  const fail = (sec, sub, reason) => {
    rows.push({
      program_id: sec.program_id,
      section_id: sec.id,
      subject_id: sub.id,
      status: "unscheduled",
      reason,
    });
    unscheduled++;
  };

  // Hours that found a room but no proctor are collected here and placed as "to be announced".
  const leftovers = [];

  // start = preferred start index in ALL (the year's band). fixed = { date, off }: place exactly there (followers).
  // Returns { date, off } when placed, or false.
  function tryPlace(sec, prog, subs, base, start, allowTba, fixed) {
    const n = subs.length;
    if (n > ALL.length) return false;
    const used = secDays.get(sec.id) || new Set();
    const days = fixed ? [fixed.date] : base;
    // preferred start first, then the nearest other starts
    const starts = fixed
      ? [fixed.off]
      : Array.from({ length: ALL.length - n + 1 }, (_, i) => i).sort(
          (a, b) => Math.abs(a - start) - Math.abs(b - start) || a - b,
        );
    for (const d of days) {
      if ((secDayCount.get(`${sec.id}|${d}`) || 0) + n > MAX_PER_DAY) continue;
      for (const off of starts) {
        if (off + n > ALL.length) continue;
        const slots = ALL.slice(off, off + n);
        if (!free(secUsed, sec.id, d, slots)) continue;

        const dayRoom = secDayRoom.get(`${sec.id}|${d}`);
        const prev = secRoom.get(sec.id);
        const dept = prog.department_id;
        const homeFloor = floorIdx(prog.floor);
        const room = rooms
          .filter((r) => (!dayRoom || r.id === dayRoom) && (ignoreCapacity || r.capacity >= sec.student_count) && free(roomUsed, r.id, d, slots))
          .sort((a, b) =>
            // 1) the program's own floor, then the nearest floors
            Math.abs(floorIdx(a.floor) - homeFloor) - Math.abs(floorIdx(b.floor) - homeFloor) ||
            // 2) keep the section in the room it already uses
            Number(b.id === prev) - Number(a.id === prev) ||
            Number(b.department_id === dept) - Number(a.department_id === dept) ||
            // 3) lowest room number first, so sections get 307, 308, 309 ... in order
            roomNum(a) - roomNum(b) ||
            String(a.name).localeCompare(String(b.name)),
          )[0];
        if (!room) continue;

        const dayPro = secDayProc.get(`${sec.id}|${d}`);
        // How many of the day's hours this proctor is free for (11 = whole day).
        const dayCover = (p) =>
          ALL.filter((t) => isFree(avail.get(p.id), d, t) && !procUsed.has(`${p.id}|${d}|${t}`)).length;
        let cands = proctors.filter((p) => {
          const bound = procDaySec.get(`${p.id}|${d}`);
          return (!bound || bound === sec.id) &&
            !subs.some((x) => blocked.get(p.id)?.has(x.code)) &&
            free(procUsed, p.id, d, slots) &&
            slots.every((t) => isFree(avail.get(p.id), d, t));
        });
        if (dayPro) {
          // This section already has a proctor today: keep the same person for the whole day.
          const same = cands.filter((p) => p.id === dayPro);
          if (same.length) cands = same;
          else if (!allowTba) continue;
          else cands = [];
        }
        if (!cands.length && !allowTba) continue;
        const had = secProctors.get(sec.id) || new Set();
        const pr = cands.length
          ? shuffle(cands).sort(
              (a, b) =>
                dayCover(b) - dayCover(a) ||
                Number(had.has(b.id)) - Number(had.has(a.id)) ||
                Number(b.department_id === prog.department_id) - Number(a.department_id === prog.department_id) ||
                (load.get(a.id) || 0) - (load.get(b.id) || 0),
            )[0]
          : null; // null = proctor to be announced

        slots.forEach((t) => {
          roomUsed.add(`${room.id}|${d}|${t}`);
          if (pr) procUsed.add(`${pr.id}|${d}|${t}`);
          secUsed.add(`${sec.id}|${d}|${t}`);
        });
        if (pr) {
          load.set(pr.id, (load.get(pr.id) || 0) + 1);
          secProctors.set(sec.id, had.add(pr.id));
          procDaySec.set(`${pr.id}|${d}`, sec.id);
          secDayProc.set(`${sec.id}|${d}`, pr.id);
        }
        secDays.set(sec.id, used.add(d));
        secDayRoom.set(`${sec.id}|${d}`, room.id);
        secDayCount.set(`${sec.id}|${d}`, (secDayCount.get(`${sec.id}|${d}`) || 0) + n);
        if (!prev) secRoom.set(sec.id, room.id);
        subs.forEach((sub, i) =>
          rows.push({
            program_id: sec.program_id,
            section_id: sec.id,
            subject_id: sub.id,
            room_id: room.id,
            proctor_id: pr ? pr.id : null,
            exam_date: d,
            start_time: slots[i],
            end_time: endOf(slots[i]),
            status: "scheduled",
          }),
        );
        return { date: d, off };
      }
    }
    return false;
  }

  // plan = list of placed groups of the cohort's anchor section; followers copy it.
  function place(sec, prog, subs, base, start, plan) {
    const r = tryPlace(sec, prog, subs, base, start, false);
    if (r) { plan.push({ subs, ...r }); return; }
    if (subs.length > 1) {
      const h = Math.ceil(subs.length / 2);
      place(sec, prog, subs.slice(0, h), base, start, plan);
      place(sec, prog, subs.slice(h), base, start, plan);
    } else leftovers.push({ sec, prog, subs, base, start, plan });
  }

  // One cohort = one program + year level. The first section by name (A, B, C...) is the anchor.
  const batches = [];
  const cohorts = new Map();
  const byName = [...sections].sort(
    (a, b) =>
      String(a.program_id).localeCompare(String(b.program_id)) ||
      a.year_level - b.year_level ||
      String(a.name).localeCompare(String(b.name), undefined, { numeric: true }),
  );
  for (const sec of byName) {
    const prog = progById.get(sec.program_id);
    const subs = subjects.filter(
      (s) => s.program_id === sec.program_id && s.year_level === sec.year_level,
    );
    if (!subs.length) continue;
    if (sec.student_count > maxCap) {
      subs.forEach((s) =>
        fail(sec, s, `No room can hold ${sec.student_count} students`),
      );
      continue;
    }
    const ck = `${sec.program_id}|${sec.year_level}`;
    const isAnchor = !cohorts.has(ck);
    if (isAnchor) cohorts.set(ck, { plan: [], followers: [] });
    const cohort = cohorts.get(ck);
    if (!isAnchor) { cohort.followers.push({ sec, prog, subs }); continue; }

    const nDays = K; // never more than days_per_year
    const off = (deptIds.indexOf(prog.department_id) * K) % dates.length;
    const pref = Array.from(
      { length: nDays },
      (_, j) => dates[(off + j) % dates.length],
    );
    const rest = dates.filter((d) => !pref.includes(d));
    const per = Math.floor(subs.length / nDays);
    const extra = subs.length % nDays;
    const rot = sec.year_level % nDays; // alternates which day gets the extra subject (4/3 or 3/4)
    const start = startOf.get(ck) ?? 0; // SAME start hour on every day of this year level
    let at = 0;
    for (let j = 0; j < nDays; j++) {
      const n = per + ((j + rot) % nDays < extra ? 1 : 0);
      if (!n) continue;
      batches.push({
        sec,
        prog,
        subs: subs.slice(at, at + n),
        base: [pref[j], ...pref.filter((d) => d !== pref[j]), ...(spill || !STRICT_DAYS ? rest : [])],
        start,
        plan: cohort.plan,
      });
      at += n;
    }
  }
  // Largest batches first (hardest to fit), random order otherwise.
  for (const b of shuffle(batches).sort((a, b) => b.subs.length - a.subs.length))
    place(b.sec, b.prog, b.subs, b.base, b.start, b.plan);

  // Not enough proctors: keep the room and time, proctor = to be announced.
  for (const l of leftovers) {
    const r = tryPlace(l.sec, l.prog, l.subs, l.base, l.start, true);
    if (r) l.plan.push({ subs: l.subs, ...r });
    else fail(l.sec, l.subs[0], `No free room or hour left on its ${l.base.length} exam day(s)`);
  }

  // Other sections of the same program + year: same dates, same hours, own room and proctor.
  for (const c of cohorts.values()) {
    for (const f of c.followers) {
      const covered = new Set();
      for (const g of c.plan) {
        g.subs.forEach((s) => covered.add(s.id));
        const ok =
          tryPlace(f.sec, f.prog, g.subs, [], 0, false, g) ||
          tryPlace(f.sec, f.prog, g.subs, [], 0, true, g);
        if (!ok) g.subs.forEach((s) => fail(f.sec, s, "No free room at the shared exam time of its year level"));
      }
      f.subs
        .filter((s) => !covered.has(s.id))
        .forEach((s) => fail(f.sec, s, "Could not be placed on the shared exam days of its year level"));
    }
  }

  const tba = rows.filter(
    (r) => r.status === "scheduled" && !r.proctor_id,
  ).length;

  return {
    rows,
    stats: {
      total: rows.length,
      scheduled: rows.length - unscheduled,
      unscheduled,
      batches: batches.length,
      tba,
    },
  };
}
