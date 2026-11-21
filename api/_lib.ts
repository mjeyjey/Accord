import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';

// Service-role client: server only. Bypasses RLS, so every route must check roles itself.
export const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export type Role = 'admin' | 'head' | 'proctor';
export interface Me { id: string; full_name: string; role: Role; department_id: string | null; email?: string | null; avatar_url?: string | null; status?: string }

export async function userFromToken(req: VercelRequest) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const { data } = await db.auth.getUser(token);
  if (!data.user) return null;
  let sid = '';
  try { sid = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).session_id || ''; } catch { /* ignore */ }
  return { id: data.user.id, email: data.user.email || '', sid };
}

export const TRUST_DAYS = 14;
export const SESSION_HOURS = 24;
export const sessionExpiry = () => new Date(Date.now() + SESSION_HOURS * 3600000).toISOString();
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// Trusted-device tokens are stored in HttpOnly cookies so JavaScript cannot read them.
export const readCookie = (req: VercelRequest, name: string) => {
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
};
export const setCookie = (req: VercelRequest, res: VercelResponse, name: string, value: string, maxAgeSec: number) => {
  const secure = String(req.headers['x-forwarded-proto'] || '').includes('https');
  res.setHeader('Set-Cookie',
    `${name}=${encodeURIComponent(value)}; Path=/api; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`);
};

// Cache only fully verified sessions, keyed by a hash of the access token.
const AUTH_TTL = 30_000;
const authCache = new Map<string, { me: Me; exp: number }>();
export const clearAuthCache = (userId?: string) => {
  if (!userId) return authCache.clear();
  for (const [k, v] of authCache) if (v.me.id === userId) authCache.delete(k);
};

async function trustedDevice(req: VercelRequest, userId: string, sid: string) {
  if (!sid) return false;
  const raw = readCookie(req, `td_${userId}`);
  if (!raw) return false;
  const { data } = await db.from('trusted_devices').select('id')
    .eq('user_id', userId).eq('token_hash', sha256(raw)).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (!data) return false;
  await db.from('trusted_devices').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);
  await db.from('otp_sessions').upsert({ session_id: sid, user_id: userId, expires_at: sessionExpiry() });
  return true;
}

export async function authenticate(req: VercelRequest, res: VercelResponse): Promise<Me | null> {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = token ? sha256(token) : '';
  const hit = key ? authCache.get(key) : undefined;
  if (hit && hit.exp > Date.now()) return hit.me;
  if (hit) authCache.delete(key);

  const u = await userFromToken(req);
  if (!u) { res.status(401).json({ error: 'Not signed in' }); return null; }
  const { data: me } = await db.from('profiles').select('*').eq('id', u.id).single();
  if (!me) { res.status(403).json({ error: 'Your account has no profile yet. Ask an admin.' }); return null; }
  if (me.status && me.status !== 'active') {
    res.status(403).json({ code: 'pending', error: 'Your account is waiting for approval by an admin or department head.' }); return null;
  }
  const { data: ok } = await db.from('otp_sessions').select('session_id')
    .eq('session_id', u.sid || '-').gt('expires_at', new Date().toISOString()).maybeSingle();
  if (!ok && !(await trustedDevice(req, u.id, u.sid))) {
    res.status(401).json({ code: 'otp', error: 'Verification code required' }); return null;
  }
  if (key) {
    if (authCache.size > 500) authCache.clear();
    authCache.set(key, { me: me as Me, exp: Date.now() + AUTH_TTL });
  }
  return me as Me;
}

export const log = (me: Me, action: string, entity: string, details: unknown = {}) =>
  db.from('audit_log').insert({ user_id: me.id, user_name: me.full_name, action, entity, details });

// Supabase returns max 1000 rows per request, so page through.
export async function fetchAll(build: () => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const TRASH_CHILDREN: Record<string, { table: string; fk: string }[]> = {
  departments: [{ table: 'programs', fk: 'department_id' }],
  programs: [{ table: 'subjects', fk: 'program_id' }, { table: 'sections', fk: 'program_id' }, { table: 'schedules', fk: 'program_id' }],
  subjects: [{ table: 'schedules', fk: 'subject_id' }],
  sections: [{ table: 'schedules', fk: 'section_id' }],
  exam_periods: [{ table: 'schedules', fk: 'period_id' }],
};
const RESTORE_ORDER = ['departments', 'programs', 'exam_periods', 'rooms', 'subjects', 'sections', 'schedules'];

export async function toTrash(me: Me, table: string, row: any) {
  const rows: Record<string, Record<string, any>> = {};
  const visit = async (entity: string, current: any) => {
    if (!current?.id) return;
    const bucket = (rows[entity] ||= {});
    if (bucket[current.id]) return;
    bucket[current.id] = current;
    for (const rel of TRASH_CHILDREN[entity] || []) {
      const children = await fetchAll(() => db.from(rel.table).select('*').eq(rel.fk, current.id).order('id'));
      for (const child of children) await visit(rel.table, child);
    }
  };
  await visit(table, row);
  const label = row.name || row.code || row.title || row.full_name || row.id;
  const { error } = await db.from('trash').insert({
    entity: table, label: String(label), payload: { rows }, deleted_by: me.id, deleted_by_name: me.full_name,
  });
  if (error) throw error;
}

export async function restore(item: any) {
  const source = item?.payload?.rows || {};
  const seen = new Set<string>();
  for (const table of RESTORE_ORDER) {
    const records = Object.values(source[table] || {}).filter((row: any) => {
      const key = `${table}:${row.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }) as any[];
    for (let i = 0; i < records.length; i += 200) {
      const { error } = await db.from(table).upsert(records.slice(i, i + 200), { onConflict: 'id' });
      if (error) throw error;
    }
  }
}

// Philippine date (UTC+8), so the day does not flip at the wrong hour.
export const manilaToday = () => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);

let lastSweep = 0;
// Moves every exam period whose END date has passed to status "ended" and tells the admin and the heads involved.
export async function closeEndedPeriods() {
  if (Date.now() - lastSweep < 60000) return;
  lastSweep = Date.now();
  const { data: due } = await db.from('exam_periods').select('id').lt('end_date', manilaToday()).neq('status', 'ended');
  if (!due?.length) return;
  const { data: ended } = await db.from('exam_periods').update({ status: 'ended' })
    .in('id', due.map((p: any) => p.id)).neq('status', 'ended').select('id,name,start_date,end_date,program_ids');
  if (!ended?.length) return;
  const [managers, progs] = await Promise.all([
    fetchAll(() => db.from('profiles').select('id,role,department_id').in('role', ['admin', 'head']).eq('status', 'active').order('id')),
    fetchAll(() => db.from('programs').select('id,department_id').order('id')),
  ]);
  const deptOf = new Map(progs.map((p: any) => [p.id, p.department_id]));
  const rows: any[] = [];
  for (const p of ended as any[]) {
    const depts = new Set((p.program_ids || []).map((id: string) => deptOf.get(id)));
    for (const m of managers)
      if (m.role === 'admin' || depts.has(m.department_id))
        rows.push({ user_id: m.id, kind: 'period_ended', title: 'Exam period ended',
          body: `"${p.name}" (${p.start_date} to ${p.end_date}) has ended and was moved to History.` });
  }
  if (rows.length) { const { notify } = await import('./_notify'); await notify(rows); }
}

// Open (TBA) batches can be accepted until N hours before the first exam starts (Manila time).
// N is set per exam period (exam_periods.accept_cutoff_hours, default 1).
export const OPEN_CUTOFF_HOURS = 1;
export const cutoffHours = (p?: any) => {
  const n = Number(p?.accept_cutoff_hours);
  return Number.isFinite(n) && n >= 0 ? n : OPEN_CUTOFF_HOURS;
};
export const acceptClosed = (date: string, time: string, hours = OPEN_CUTOFF_HOURS) =>
  Date.now() >= Date.parse(`${date}T${String(time).slice(0, 5)}:00+08:00`) - hours * 3600000;
