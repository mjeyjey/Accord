import { supabase } from './supabase';

export interface Me { id: string; full_name: string; role: 'admin' | 'head' | 'proctor'; department_id: string | null; department?: { code: string; name: string } | null; email?: string | null; avatar_url?: string | null; tour_seen_at?: string | null; status?: string }

const cache = new Map<string, { t: number; p: Promise<any> }>();
const TTL = 20000, NO_CACHE = ['notifications', 'bulletins', 'trash'];
supabase.auth.onAuthStateChange(() => cache.clear());
function cachedList(table: string) {
  const path = `db?table=${table}`;
  if (NO_CACHE.includes(table)) return call<any[]>(path);
  const hit = cache.get(path);
  if (hit && Date.now() - hit.t < TTL) return hit.p;
  const p = call<any[]>(path).catch((e) => { cache.delete(path); throw e; });
  cache.set(path, { t: Date.now(), p });
  return p;
}

async function call<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  if (method !== 'GET') cache.clear();
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`/api/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error: any = new Error(json.error || res.statusText);
    error.code = json.code;
    throw error;
  }
  if (method !== 'GET') cache.clear();
  return json as T;
}

export const api = {
  get: <T = any>(path: string) => call<T>(path),
  post: <T = any>(path: string, body: unknown) => call<T>(path, 'POST', body),
  list: (table: string) => cachedList(table),
  create: (table: string, row: any) => call(`db?table=${table}`, 'POST', row),
  update: (table: string, id: string, row: any) => call(`db?table=${table}&id=${id}`, 'PATCH', row),
  remove: (table: string, id: string) => call(`db?table=${table}&id=${id}`, 'DELETE'),
  patchMe: (row: any) => call<any>('db?table=me', 'PATCH', row),
  restore: (id: string) => call(`db?table=trash&id=${id}`, 'POST'),
  emptyTrash: () => call('db?table=trash', 'DELETE'),
  otp: (body: any) => call('otp', 'POST', body),
  assistant: (messages: { role: string; content: string }[]) =>
    call<{ reply: string; links: { label: string; to: string }[] }>('assistant', 'POST', { messages }),
  action: (action: 'generate' | 'reassign' | 'emergency' | 'candidates' | 'requests' | 'accept' | 'import_curriculum' | 'import_rooms' | 'proctor_schedule' | 'room_options' | 'set_room' | 'swap_room' | 'resolve_unplaced' | 'user_profile' | 'review_period' | 'reschedule' | 'backup' | 'subject_catalog' | 'proctor_subjects' | 'set_proctor_subjects', body: any) => call(`schedule?action=${action}`, 'POST', body),
};

export const FLOORS = ['Ground', '1st', '2nd', '3rd', '4th', '5th'];
export const floorLabel = (f: string) => (f === 'Ground' ? 'Ground Floor' : `${f} Floor`);
export const SLOT_TIMES = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];
export const t5 = (t?: string | null) => (t ? String(t).slice(0, 5) : '');
