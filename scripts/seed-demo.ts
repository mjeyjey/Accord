/// <reference types="node" />

// Seeds: subjects (from the evaluation sheets), sections, rooms, 25 demo proctors + availability for Nov 17-20, 2026.
// Run:  npx tsx scripts/seed-demo.ts      (safe to run again)
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { CURRICULUM, parse } from './curriculum';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const FLOORS = ['Ground', '1st', '2nd', '3rd', '4th', '5th'];
const DEPTS = ['EDUC', 'CAD', 'BSPSYCH', 'BSIS', 'BSBA', 'BSCRIM', 'BSHM', 'BSCE', 'BSA', 'BSAIS'];
const DEPT_FLOOR: Record<string, string> = { EDUC: '1st', CAD: '1st', BSPSYCH: '2nd', BSIS: '3rd', BSBA: '2nd', BSCRIM: '3rd', BSHM: '4th', BSCE: '4th', BSA: '5th', BSAIS: '5th' };
const PASSWORD = 'Proctor@123';
const DATES = ['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];

const chunk = <T,>(a: T[], n = 400) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const ok = (r: { error: any }, what: string) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); };

async function main() {
  const { data: deps } = await db.from('departments').select('id,code');
  const { data: progs } = await db.from('programs').select('id,code,floor,department_id');
  if (!progs?.length) throw new Error('No programs found. Run supabase/schema.sql first.');
  const depCode = new Map(deps!.map((d: any) => [d.id, d.code]));
  const depId = new Map(deps!.map((d: any) => [d.code, d.id]));
  const prog = new Map(progs.map((p: any) => [p.code, p]));

  // 1. Subjects
  const subj = new Map<string, any>();
  for (const [code, terms] of Object.entries(CURRICULUM)) {
    const p = prog.get(code);
    if (!p) { console.warn('Program not found, skipped:', code); continue; }
    for (const [key, list] of Object.entries(terms)) {
      const [y, s] = key.split('.').map(Number);
      for (const e of list) {
        const { code: c, title } = parse(e);
        subj.set(`${p.id}|${y}|${s}|${c}`, { program_id: p.id, year_level: y, semester: s, code: c, title });
      }
    }
  }
  for (const part of chunk([...subj.values()])) ok(await db.from('subjects').upsert(part, { onConflict: 'program_id,year_level,semester,code' }), 'subjects');
  console.log(`Subjects: ${subj.size}`);

  // 2. Spread programs over floors (only programs still on the default Ground floor)
  for (const p of progs) {
    const f = DEPT_FLOOR[depCode.get(p.department_id) as string];
    if (p.floor === 'Ground' && f) ok(await db.from('programs').update({ floor: f }).eq('id', p.id), 'floors');
  }

  // 3. Rooms: 6 per floor
  const CAP = [55, 50, 45, 60, 40, 35];
  const rooms = FLOORS.flatMap((f, fi) => CAP.map((cap, i) => ({ name: fi === 0 ? `B0${i + 1}` : `${fi}0${i + 1}`, floor: f, capacity: cap })));
  ok(await db.from('rooms').upsert(rooms, { onConflict: 'name' }), 'rooms');
  console.log(`Rooms: ${rooms.length}`);

  // 4. Sections A-D for every program and year level (22-48 students each)
  let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const sections = progs.flatMap((p: any) =>
    [1, 2, 3, 4].flatMap((y) =>
      ['A', 'B', 'C', 'D'].map((name) => ({ program_id: p.id, year_level: y, name, student_count: 22 + Math.floor(rnd() * 27) }))));
  for (const part of chunk(sections)) ok(await db.from('sections').upsert(part, { onConflict: 'program_id,year_level,name' }), 'sections');
  console.log(`Sections: ${sections.length}`);

  // 5. Proctors: exactly 25, all with different names
  const F = ['Maria', 'Jose', 'Ana', 'Juan', 'Carla', 'Miguel', 'Liza', 'Ramon', 'Grace', 'Paolo', 'Rhea', 'Carlo', 'Joy', 'Mark', 'Bea', 'Noel', 'Tina', 'Rico', 'Elena', 'Dennis'];
  const L = ['Santos', 'Reyes', 'Cruz', 'Bautista', 'Garcia', 'Mendoza', 'Torres', 'Villanueva', 'Ramos', 'Aquino', 'Castillo', 'Flores', 'Domingo', 'Navarro', 'Salvador', 'Pascual', 'Dela Cruz', 'Soriano', 'Mercado', 'Valdez'];
  const COUNT = 25;
  const names: string[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; names.length < COUNT; i++) {
    const n = `${F[i % 20]} ${L[(i * 7 + 3 + Math.floor(i / 20)) % 20]}`;
    if (!usedNames.has(n)) { usedNames.add(n); names.push(n); }
  }

  // Remove demo proctors beyond the first 25, with their data. Only demo accounts are deleted.
  const keep = new Set(Array.from({ length: COUNT }, (_, i) => `proctor${String(i + 1).padStart(2, '0')}@exam.test`));
  const { data: demo } = await db.from('profiles').select('id,email').eq('role', 'proctor').like('email', '%@exam.test');
  for (const p of (demo || []).filter((x: any) => !keep.has(x.email))) {
    ok(await db.from('schedules').update({ proctor_id: null }).eq('proctor_id', p.id), 'unassign');
    ok(await db.from('availability').delete().eq('proctor_id', p.id), 'availability');
    ok(await db.from('notifications').delete().eq('user_id', p.id), 'notifications');
    ok(await db.from('profiles').delete().eq('id', p.id), 'profile');
    const r = await db.auth.admin.deleteUser(p.id);
    if (r.error) throw new Error(`deleteUser ${p.email}: ${r.error.message}`);
  }
  console.log(`Removed demo proctors: ${(demo || []).filter((x: any) => !keep.has(x.email)).length}`);

  const existing = new Map<string, string>();
  const list = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  list.data?.users.forEach((u: any) => existing.set(u.email!, u.id));

  // 35% (9 of 25) are half-day only: 3 morning, 3 afternoon, 3 middle (10:00-14:00).
  const HALF = new Set([0, 3, 6, 9, 12, 15, 18, 21, 24]);
  const HALF_WINDOWS: [string, string][][] = [[['08:00', '12:00']], [['12:00', '19:00']], [['10:00', '14:00']]];
  const FULL: [string, string][] = [['08:00', '19:00']];

  const ids: string[] = [];
  const avail: any[] = [];
  for (let i = 0; i < COUNT; i++) {
    const email = `proctor${String(i + 1).padStart(2, '0')}@exam.test`;
    let id = existing.get(email);
    if (!id) {
      const r = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
      if (r.error) throw new Error(`createUser ${email}: ${r.error.message}`);
      id = r.data.user.id;
    }
    ids.push(id);
    ok(await db.from('profiles').upsert({ id, full_name: names[i], email, role: 'proctor', status: 'active', department_id: depId.get(DEPTS[i % 10]) }), 'profile');
    const windows = HALF.has(i) ? HALF_WINDOWS[(i / 3) % 3] : FULL;
    DATES.forEach((date) => windows.forEach(([s, e]) => avail.push({ proctor_id: id, date, start_time: s, end_time: e })));
  }
  ok(await db.from('availability').delete().in('proctor_id', ids), 'clear availability');
  for (const part of chunk(avail)) ok(await db.from('availability').insert(part), 'availability');
  console.log(`Proctors: ${ids.length}, half-day: ${HALF.size}, availability rows: ${avail.length}`);
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
