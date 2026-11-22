import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db } from "./_lib.js";
import { checkOtp } from "./_otp.js";
import { passwordProblem } from "./_password.js";
import { notify } from "./_notify.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    const { data } = await db.from("departments").select("id,code,name").order("code");
    return res.json(data || []);
  }
  if (req.method !== "POST") return res.status(405).end();

  const b: any = req.body || {};
  const full_name = String(b.full_name || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  const password = String(b.password || "");
  const department_id = b.department_id ? String(b.department_id) : null;
  const role = b.role === "head" ? "head" : "proctor";

  if (!full_name || !/^\S+@\S+\.\S+$/.test(email))
    return res.status(400).json({ error: "Enter your name and a valid email" });
  const pwBad = passwordProblem(password);
  if (pwBad) return res.status(400).json({ error: pwBad });
  if (department_id) {
    const { data: d } = await db.from("departments").select("id").eq("id", department_id).single();
    if (!d) return res.status(400).json({ error: "Unknown program" });
  }
  if (role === "head" && !department_id)
    return res.status(400).json({ error: "Choose the department you lead" });
  try { await checkOtp(email, "signup", String(b.code || "")); }
  catch (e: any) { return res.status(400).json({ error: e.message }); }

  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user)
    return res.status(400).json({ error: error?.message || "Could not create the account" });
  const { error: e2 } = await db.from("profiles").insert({
    id: data.user.id, full_name, email, role, department_id, status: "pending",
  });
  if (e2) {
    await db.auth.admin.deleteUser(data.user.id);
    return res.status(400).json({ error: e2.message });
  }
  await db.from("audit_log").insert({
    user_id: data.user.id, user_name: full_name, action: "create", entity: "profiles",
    details: { full_name, role, self_signup: true, status: "pending" },
  });

  // Tell every admin and the heads of the selected department.
  const { data: mgrs } = await db.from("profiles").select("id,role,department_id")
    .in("role", ["admin", "head"]).eq("status", "active");
  const to = (mgrs || []).filter((p: any) =>
    p.role === "admin" || (role === "proctor" && department_id && p.department_id === department_id));
  if (to.length)
    await notify(to.map((p: any) => ({
      user_id: p.id, kind: "approval", title: "New account request",
      body: `${full_name} (${email}) wants to join as ${role === "head" ? "a department head" : "a proctor"}. Review it in Configuration > Account requests.`,
    })));
  return res.status(201).json({ ok: true, pending: true });
}