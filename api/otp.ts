import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { db, authenticate, userFromToken, clearAuthCache, setCookie, readCookie, sha256, sessionExpiry, SESSION_HOURS, TRUST_DAYS, log } from "./_lib.js";
import { sendOtp, checkOtp } from "./_otp.js";
import { passwordProblem } from "./_password.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const b: any = req.body || {};
  try {
    // Create account (no session yet).
    if (b.action === "send_public") {
      const email = String(b.email || "").trim().toLowerCase();
      if (b.purpose !== "signup" || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address" });
      const { data: exists } = await db.from("profiles").select("id").eq("email", email).maybeSingle();
      if (exists) return res.status(400).json({ error: "That email already has an account or a pending request" });
      await sendOtp(email, "signup");
      return res.json({ ok: true });
    }

    // Forgot password (no session yet). Always return the same response so this
    // endpoint cannot be used to discover whether an email has an account.
    if (b.action === "send_reset") {
      const email = String(b.email || "").trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address" });
      const { data: rows } = await db.from("profiles").select("id,status").ilike("email", email).limit(1);
      if (rows?.[0] && rows[0].status === "active") {
        try { await sendOtp(email, "reset"); } catch { /* Keep the response indistinguishable for unknown accounts. */ }
      }
      return res.json({ ok: true });
    }
    if (b.action === "reset_password") {
      const email = String(b.email || "").trim().toLowerCase();
      const password = String(b.password || "");
      const pwBad = passwordProblem(password);
      if (pwBad) return res.status(400).json({ error: pwBad });
      await checkOtp(email, "reset", String(b.code || ""));
      const { data: rows } = await db.from("profiles").select("id,status").ilike("email", email).limit(1);
      const p = rows?.[0];
      if (!p || p.status !== "active") return res.status(400).json({ error: "Could not reset the password for this account" });
      const { error } = await db.auth.admin.updateUserById(p.id, { password });
      if (error) throw error;
      await db.from("trusted_devices").delete().eq("user_id", p.id);
      await db.from("otp_sessions").delete().eq("user_id", p.id);
      clearAuthCache(p.id);
      return res.json({ ok: true });
    }

    // Login (session exists but is not verified yet).
    if (b.action === "send" && b.purpose === "login") {
      const u = await userFromToken(req);
      if (!u) return res.status(401).json({ error: "Not signed in" });
      await sendOtp(u.email, "login");
      return res.json({ ok: true });
    }
    if (b.action === "verify_login") {
      const u = await userFromToken(req);
      if (!u || !u.sid) return res.status(401).json({ error: "Not signed in" });
      await checkOtp(u.email, "login", String(b.code || ""));
      const remember = !!(b.remember ?? b.trust);
      const { error } = await db.from("otp_sessions").upsert({
        session_id: u.sid, user_id: u.id,
        expires_at: sessionExpiry(remember ? TRUST_DAYS * 24 : SESSION_HOURS),
      });
      if (error) throw error;
      if (remember) {
        const token = randomBytes(32).toString("base64url");
        await db.from("trusted_devices").delete().eq("user_id", u.id).lt("expires_at", new Date().toISOString());
        const { error: e2 } = await db.from("trusted_devices").insert({
          user_id: u.id, token_hash: sha256(token),
          user_agent: String(req.headers["user-agent"] || "").slice(0, 200),
          expires_at: new Date(Date.now() + TRUST_DAYS * 86400000).toISOString(),
        });
        if (e2) throw e2;
        setCookie(req, res, `td_${u.id}`, token, TRUST_DAYS * 86400);
      }
      return res.json({ ok: true, remembered: remember });
    }

    // Logout ends this login session while keeping the device trusted.
    if (b.action === "logout") {
      const u = await userFromToken(req);
      if (u) {
        await db.from("otp_sessions").delete().eq("session_id", u.sid);
        clearAuthCache(u.id);
      }
      return res.json({ ok: true });
    }

    // Change password (fully signed in).
    const me = await authenticate(req, res);
    if (!me) return;
    const email = (me.email || "").toLowerCase();
    if (!email) return res.status(400).json({ error: "Your account has no email on file. Ask an admin." });

    if (b.action === "send" && b.purpose === "password") {
      const anon = createClient(process.env.SUPABASE_URL!, (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)!,
        { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await anon.auth.signInWithPassword({ email, password: String(b.current || "") });
      if (error) throw new Error("Your current password is incorrect");
      await sendOtp(email, "password");
      return res.json({ ok: true });
    }
    if (b.action === "change_password") {
      const password = String(b.password || "");
      const pwBad = passwordProblem(password);
      if (pwBad) throw new Error(pwBad);
      await checkOtp(email, "password", String(b.code || ""));
      const { error } = await db.auth.admin.updateUserById(me.id, { password });
      if (error) throw error;
      // A password change revokes every trusted device and every other login session.
      const cur = await userFromToken(req);
      await db.from("trusted_devices").delete().eq("user_id", me.id);
      await db.from("otp_sessions").delete().eq("user_id", me.id).neq("session_id", cur?.sid || "-");
      clearAuthCache(me.id);
      return res.json({ ok: true });
    }
    if (b.action === "send" && b.purpose === "email") {
      const next = String(b.email || "").trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(next)) throw new Error("Enter a valid email address");
      if (next === email) throw new Error("That is already your email");
      const anon = createClient(process.env.SUPABASE_URL!, (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY)!,
        { auth: { persistSession: false, autoRefreshToken: false } });
      const { error } = await anon.auth.signInWithPassword({ email, password: String(b.current || "") });
      if (error) throw new Error("Your current password is incorrect");
      const { data: taken } = await db.from("profiles").select("id").ilike("email", next).limit(1);
      if (taken?.length) throw new Error("That email is already used by another account");
      await sendOtp(next, "email");
      return res.json({ ok: true });
    }
    if (b.action === "change_email") {
      const next = String(b.email || "").trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(next)) throw new Error("Enter a valid email address");
      const { data: taken } = await db.from("profiles").select("id").ilike("email", next).neq("id", me.id).limit(1);
      if (taken?.length) throw new Error("That email is already used by another account");
      await checkOtp(next, "email", String(b.code || ""));
      const { error } = await db.auth.admin.updateUserById(me.id, { email: next, email_confirm: true });
      if (error) throw error;
      const { error: e2 } = await db.from("profiles").update({ email: next }).eq("id", me.id);
      if (e2) throw e2;
      await db.from("trusted_devices").delete().eq("user_id", me.id);
      clearAuthCache(me.id);
      await log(me, "update", "profiles", { id: me.id, profile: "email" });
      return res.json({ ok: true, email: next });
    }
    return res.status(400).json({ error: "Unknown action" });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Server error" });
  }
}
