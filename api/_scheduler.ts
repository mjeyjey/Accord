// Scheduling engine. Edit SLOTS to change exam hours (each slot = 1 hour).
export const SLOTS: Record<"AM" | "PM", string[]> = {
  AM: ["08:00", "09:00", "10:00", "11:00"],
  PM: ["13:00", "14:00", "15:00", "16:00"],
};
export const FLOORS = ["Ground", "1st", "2nd", "3rd", "4th", "5th"];
export const MAX_PER_DAY = 4; // max exams one section can have in a single day (AM + PM combined)
// true = a section never leaves its own exam days (days_per_year). Hours that don't fit are reported as unplaced.
export const STRICT_DAYS = true;

export const hhmm = (t: string) => String(t).slice(0, 5);
export const endOf = (t: string) =>
  `${String(Number(hhmm(t).slice(0, 2)) + 1).padStart(2, "0")}:00`;

// Every date in the range, Sundays included.
export function examDates(start: string, end: string): string[] {
  const out: string[] = [];
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

export function groupAvail(list: any[]) {
  const m = new Map<string, any[]>();
  for (const a of list) {
    if (!m.has(a.proctor_id)) m.set(a.proctor_id, []);
    m.get(a.proctor_id)!.push(a);
  }
  return m;
}

// A proctor with NO availability rows is NOT available.
// Only the windows they entered count.
export const isFree = (list: any[] | undefined, date: string, t: string) =>
  !!list &&
  list.some(
    (a) =>
      a.date === date &&
      hhmm(a.start_time) <= hhmm(t) &&
      hhmm(a.end_time) >= endOf(t),
  );

function shuffle<T>(a: T[]): T[] {
  const x = [...a];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

// Each section takes its subjects in BATCHES: back-to-back hours in one room with ONE proctor.
// A section's subjects are split across its exam days; the proctor changes from day to day.
export function buildSchedule(inp: any) {
  const {
    dates,
    programs,
    sections,
    subjects,
    rooms,
    proctors,
    availability,
    busy,
    ignoreCapacity = false,
    spill = false,
  } = inp;
  const K = Math.max(1, Math.min(inp.daysPerYear || 1, dates.length));

  const roomUsed = new Set<string>();
  const procUsed = new Set<string>();
  const secUsed = new Set<string>();
  const avail = groupAvail(availability);
  const load = new Map<string, number>();
  const secProctors = new Map<string, Set<string>>();
  const secDays = new Map<string, Set<string>>();
  const secDayRoom = new Map<string, string>(); // section|date -> the room its students stay in that day
  const secRoom = new Map<string, string>(); // section -> the room it used first (preferred on later days)
  const secDayCount = new Map<string, number>(); // section|date -> exams already placed that day
  const procDaySec = new Map<string, string>(); // proctor|date -> the ONE section that proctor stays with that day
  const secDayProc = new Map<string, string>(); // section|date -> proctor already covering it that day
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
        const days = secDays.get(b.section_id) || new Set<string>();
        days.add(b.exam_date);
        secDays.set(b.section_id, days);
      }
      if (b.room_id) {
        secDayRoom.set(dayKey, b.room_id);
        if (!secRoom.has(b.section_id)) secRoom.set(b.section_id, b.room_id);
      }
    }
  }
  const deptIds: string[] = [
    ...new Set<string>(programs.map((p: any) => p.department_id)),
  ].sort();
  const progById = new Map<string, any>(programs.map((p: any) => [p.id, p]));
  // Rooms each department already uses, so the next room is placed beside them.
  const deptRooms = new Map<string, { id: string; floor: string; n: number }[]>();
  const roomNum = (r: any) => parseInt(String(r.name).replace(/\D/g, ""), 10) || 0;
  const maxCap = ignoreCapacity ? Infinity : Math.max(0, ...rooms.map((r: any) => r.capacity));
  const floorIdx = (f: string) => FLOORS.indexOf(f);
  const free = (set: Set<string>, id: string, d: string, slots: string[]) =>
    slots.every((t) => !set.has(`${id}|${d}|${t}`));

  const rows: any[] = [];
  let unscheduled = 0;
  const fail = (sec: any, sub: any, reason: string) => {
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
  const leftovers: any[] = [];

  function tryPlace(
    sec: any,
    prog: any,
    subs: any[],
    base: string[],
    home: "AM" | "PM",
    allowTba: boolean,
  ): boolean {
    const n = subs.length;
    const used = secDays.get(sec.id) || new Set<string>();
    const days = [
      ...base.filter((d) => !used.has(d)),
      ...base.filter((d) => used.has(d)),
    ];
    for (const blk of [home, home === "AM" ? "PM" : "AM"] as ("AM" | "PM")[]) {
      for (const d of days) {
        if ((secDayCount.get(`${sec.id}|${d}`) || 0) + n > MAX_PER_DAY)
          continue;
        for (let off = 0; off + n <= SLOTS[blk].length; off++) {
          const slots = SLOTS[blk].slice(off, off + n);
          if (!free(secUsed, sec.id, d, slots)) continue;

          const dayRoom = secDayRoom.get(`${sec.id}|${d}`);
          const prev = secRoom.get(sec.id);
          const dept = prog.department_id;
          const homeFloor = floorIdx(prog.floor);
          const usedRooms = deptRooms.get(dept) || [];
          // Distance to the nearest room this department already uses (floor first, then room number).
          const gap = (r: any) =>
            usedRooms.length
              ? Math.min(...usedRooms.map((u) => Math.abs(floorIdx(u.floor) - floorIdx(r.floor)) * 1000 + Math.abs(u.n - roomNum(r))))
              : 0;
          const room = rooms
            .filter((r: any) => (!dayRoom || r.id === dayRoom) && (ignoreCapacity || r.capacity >= sec.student_count) && free(roomUsed, r.id, d, slots))
            .sort((a: any, b: any) =>
              // 1) the program's own floor, then the nearest floors
              Math.abs(floorIdx(a.floor) - homeFloor) - Math.abs(floorIdx(b.floor) - homeFloor) ||
              // 2) keep the section in the room it already uses
              Number(b.id === prev) - Number(a.id === prev) ||
              Number(b.department_id === dept) - Number(a.department_id === dept) ||
              gap(a) - gap(b) ||
              a.capacity - b.capacity,
            )[0];
          if (!room) continue;

          const dayPro = secDayProc.get(`${sec.id}|${d}`);
          const allSlots = [...SLOTS.AM, ...SLOTS.PM];
          // How many of the day's hours this proctor is free for (8 = whole day).
          const dayCover = (p: any) =>
            allSlots.filter((t) => isFree(avail.get(p.id), d, t) && !procUsed.has(`${p.id}|${d}|${t}`)).length;
          let cands = proctors.filter((p: any) => {
            const bound = procDaySec.get(`${p.id}|${d}`);
            return (!bound || bound === sec.id) &&
              free(procUsed, p.id, d, slots) &&
              slots.every((t) => isFree(avail.get(p.id), d, t));
          });
          if (dayPro) {
            // This section already has a proctor today: keep the same person for the day.
            const same = cands.filter((p: any) => p.id === dayPro);
            if (same.length) cands = same;
            else if (!allowTba) continue;
            else cands = [];
          }
          if (!cands.length && !allowTba) continue;
          if (!usedRooms.some((u) => u.id === room.id))
            deptRooms.set(dept, [...usedRooms, { id: room.id, floor: room.floor, n: roomNum(room) }]);
          const had = secProctors.get(sec.id) || new Set<string>();
          const pr: any = cands.length
            ? shuffle<any>(cands).sort(
                (a: any, b: any) =>
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
          secDayCount.set(
            `${sec.id}|${d}`,
            (secDayCount.get(`${sec.id}|${d}`) || 0) + n,
          );
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
          return true;
        }
      }
    }
    return false;
  }

  function place(
    sec: any,
    prog: any,
    subs: any[],
    base: string[],
    home: "AM" | "PM",
  ) {
    if (tryPlace(sec, prog, subs, base, home, false)) return;
    if (subs.length > 1) {
      const h = Math.ceil(subs.length / 2);
      place(sec, prog, subs.slice(0, h), base, home);
      place(sec, prog, subs.slice(h), base, home);
    } else leftovers.push({ sec, prog, subs, base, home });
  }

  const batches: any[] = [];
  for (const sec of sections) {
    const prog = progById.get(sec.program_id);
    const subs = subjects.filter(
      (s: any) =>
        s.program_id === sec.program_id && s.year_level === sec.year_level,
    );
    if (!subs.length) continue;
    if (sec.student_count > maxCap) {
      subs.forEach((s: any) =>
        fail(sec, s, `No room can hold ${sec.student_count} students`),
      );
      continue;
    }

    // Same division = same exam days (divisions are staggered across the date range).
    const nDays = Math.min(
      dates.length,
      Math.max(K, Math.ceil(subs.length / MAX_PER_DAY)),
    );
    const off = (deptIds.indexOf(prog.department_id) * K) % dates.length;
    const pref: string[] = Array.from(
      { length: nDays },
      (_, j) => dates[(off + j) % dates.length],
    );
    const rest = dates.filter((d: string) => !pref.includes(d));
    const per = Math.floor(subs.length / nDays);
    const extra = subs.length % nDays;
    let at = 0;
    for (let j = 0; j < nDays; j++) {
      const n = per + (j < extra ? 1 : 0);
      if (!n) continue;
      batches.push({
        sec,
        prog,
        subs: subs.slice(at, at + n),
        base: [pref[j], ...pref.filter((d) => d !== pref[j]), ...(spill || !STRICT_DAYS ? rest : [])],
        home: sec.year_level <= 2 ? "AM" : "PM",
      });
      at += n;
    }
  }
  // Largest batches first (hardest to fit), random order otherwise.
  for (const b of shuffle(batches).sort(
    (a, b) => b.subs.length - a.subs.length,
  ))
    place(b.sec, b.prog, b.subs, b.base, b.home);

  // Not enough proctors: keep the room and time, proctor = to be announced.
  for (const l of leftovers)
    if (!tryPlace(l.sec, l.prog, l.subs, l.base, l.home, true))
      fail(l.sec, l.subs[0], `No free room or hour left on its ${l.base.length} exam day(s)`);

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
