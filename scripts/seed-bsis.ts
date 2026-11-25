import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const PASSWORD = process.env.BSIS_PROCTOR_PASSWORD;
const PROFS: [string, string][] = [['Crespo','crespo'],['Columbres','columbres'],['P. Cusack','cusack'],['Dalaodao','dalaodao'],['De Vera','devera'],['M. Esperanza','esperanza'],['Fernandez','fernandez'],['Gabudao','gabudao'],['Gelotin','gelotin'],['Mercado','mercado'],['G. Pillado','pillado'],['Plata','plata'],['Sandoval','sandoval'],['L. Santiago','santiago']];
const ok = (r: { error: any }, w: string) => { if (r.error) throw new Error(`${w}: ${r.error.message}`); };
async function main() {
  if (!PASSWORD) throw new Error('Set BSIS_PROCTOR_PASSWORD before running this seed script');
  const { data: dep } = await db.from('departments').select('id').eq('code', 'BSIS').single();
  if (!dep) throw new Error('BSIS department not found');
  const { data: demo } = await db.from('profiles').select('id').eq('role', 'proctor').eq('department_id', dep.id).like('email', '%@exam.test');
  for (const p of demo || []) {
    ok(await db.from('schedules').update({ proctor_id: null }).eq('proctor_id', p.id), 'unassign');
    ok(await db.from('availability').delete().eq('proctor_id', p.id), 'availability');
    ok(await db.from('proctor_subjects').delete().eq('proctor_id', p.id), 'subjects');
    ok(await db.from('notifications').delete().eq('user_id', p.id), 'notifications');
    ok(await db.from('chat_messages').delete().or(`sender_id.eq.${p.id},recipient_id.eq.${p.id}`), 'chat');
    ok(await db.from('profiles').delete().eq('id', p.id), 'profile');
    const r = await db.auth.admin.deleteUser(p.id); if (r.error) throw new Error(r.error.message);
  }
  const existing = new Map<string, string>();
  (await db.auth.admin.listUsers({ page: 1, perPage: 1000 })).data?.users.forEach((u: any) => existing.set(u.email, u.id));
  for (const [name, key] of PROFS) {
    const email = `${key}@gmail.com`;
    let id = existing.get(email);
    if (!id) {
      const r = await db.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
      if (r.error) throw new Error(`${email}: ${r.error.message}`);
      id = r.data.user.id;
    } else ok(await db.auth.admin.updateUserById(id, { password: PASSWORD }) as any, 'password');
    ok(await db.from('profiles').upsert({ id, full_name: name, email, role: 'proctor', status: 'active', department_id: dep.id, skip_otp: true }), 'profile');
  }
  console.log(`Removed ${demo?.length || 0} demo, added ${PROFS.length} BSIS professors`);
}
main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
