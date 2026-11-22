import nodemailer from "nodemailer";
import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { readFileSync } from "fs";
import { join } from "path";
import { db } from "./_lib.js";

const hash = (email: string, purpose: string, code: string) =>
  createHmac("sha256", process.env.OTP_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(`${email}|${purpose}|${code}`).digest("hex");

const mailer = () => nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
});

// Logo is embedded in the email itself, so it shows even without a deployed URL.
let LOGO: Buffer | null = null;
try { LOGO = readFileSync(join(process.cwd(), "public", "logo.png")); } catch { /* falls back to APP_URL */ }
const attachments = () => (LOGO ? [{ filename: "logo.png", content: LOGO, cid: "accord-logo" }] : []);

export const sendMail = (to: string, subject: string, text: string, html?: string) =>
  mailer().sendMail({ from: `"Accord" <${process.env.GMAIL_USER}>`, to, subject, text, html, attachments: attachments() });

export const sendBcc = (bcc: string[], subject: string, text: string, html?: string) =>
  mailer().sendMail({ from: `"Accord" <${process.env.GMAIL_USER}>`, to: process.env.GMAIL_USER, bcc, subject, text, html, attachments: attachments() });

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export function emailLayout(o: { preheader: string; heading: string; intro: string; code?: string; note?: string; to?: string }) {
  const base = (process.env.APP_URL || "").replace(/\/$/, "");
  const src = LOGO ? "cid:accord-logo" : base ? `${base}/logo.png` : "";
  const logo = src ? `<td style="padding-right:12px"><img src="${src}" width="44" height="44" alt="" style="display:block;border:0"></td>` : "";
  const code = o.code
    ? `<tr><td align="center" style="padding:6px 0 22px"><div style="display:inline-block;padding:16px 26px 16px 36px;background:#F4F8FE;border:1.5px solid #D5E0F0;border-radius:14px;font:700 34px/1 'Courier New',monospace;letter-spacing:10px;color:#0A1B3F">${esc(o.code)}</div></td></tr>` : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#EEF3FA">
<span style="display:none;opacity:0;height:0;overflow:hidden">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF3FA;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:22px;overflow:hidden;font-family:Poppins,'Helvetica Neue',Helvetica,Arial,sans-serif;box-shadow:0 12px 30px rgba(10,27,63,.12)">
  <tr><td bgcolor="#0A1B3F" style="background:linear-gradient(120deg,#0A1B3F 0%,#11306E 55%,#1A52A3 100%);padding:26px 30px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>${logo}
      <td><div style="font:700 26px/1 'EB Garamond',Garamond,Georgia,serif;color:#ffffff">Accord</div>
      <div style="font-size:10.5px;letter-spacing:1px;color:#BFD7F7;margin-top:4px">LA CONCEPCION COLLEGE</div></td></tr></table>
  </td></tr>
  <tr><td style="padding:30px 30px 8px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td style="font:600 24px/1.25 'EB Garamond',Garamond,Georgia,serif;color:#11306E;padding-bottom:10px">${esc(o.heading)}</td></tr>
      <tr><td style="font-size:14px;line-height:1.6;color:#0E2142;padding-bottom:18px">${o.intro}</td></tr>
      ${code}
      ${o.note ? `<tr><td style="font-size:12.5px;line-height:1.6;color:#5B6F8C;padding-bottom:6px">${o.note}</td></tr>` : ""}
    </table>
  </td></tr>
  <tr><td style="padding:18px 30px 26px"><div style="border-top:1px solid #D5E0F0;padding-top:16px;font-size:11.5px;line-height:1.6;color:#5B6F8C">
    ${o.to ? `Sent to ${esc(o.to)}.<br>` : ""}This is an automated message from Accord, the exam scheduler of La Concepcion College. Please do not reply.</div></td></tr>
</table></td></tr></table></body></html>`;
}

const COPY: Record<string, { heading: string; intro: (e: string) => string; subject: string }> = {
  login: { heading: "Verify it’s you", subject: "Verify it’s you", intro: (e) => `Use this code to finish signing in as <b>${esc(e)}</b>.` },
  signup: { heading: "Confirm your email", subject: "Confirm your email", intro: (e) => `Use this code to finish creating your Accord account for <b>${esc(e)}</b>.` },
  password: { heading: "Confirm your password change", subject: "Confirm your password change", intro: (e) => `Use this code to confirm the password change for <b>${esc(e)}</b>.` },
  email: { heading: "Confirm your new email", subject: "Confirm your new email", intro: (e) => `Use this code to confirm <b>${esc(e)}</b> as your new Accord email.` },
  reset: { heading: "Reset your password", subject: "Reset your password", intro: (e) => `Use this code to reset the password for <b>${esc(e)}</b>.` },
};

export async function sendOtp(rawEmail: string, purpose: string) {
  const email = rawEmail.trim().toLowerCase();
  const { data: last } = await db.from("otp_codes").select("created_at")
    .eq("email", email).eq("purpose", purpose).order("created_at", { ascending: false }).limit(1);
  if (last?.[0] && Date.now() - new Date(last[0].created_at).getTime() < 45000)
    throw new Error("Please wait a moment before asking for another code");
  const code = String(randomInt(100000, 1000000));
  await db.from("otp_codes").delete().eq("email", email).eq("purpose", purpose);
  const { error } = await db.from("otp_codes").insert({
    email, purpose, code_hash: hash(email, purpose, code),
    expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
  });
  if (error) throw error;
  const c = COPY[purpose] || COPY.login;
  await sendMail(email, `${c.subject}: ${code}`,
    `${c.heading}\n\nYour Accord verification code is ${code}.\nIt expires in 10 minutes. If you did not request it, ignore this email.\n\nLa Concepcion College`,
    emailLayout({
      preheader: `Your Accord code is ${code}`, heading: c.heading, intro: c.intro(email), code,
      note: "This code expires in <b>10 minutes</b>. If you did not request it, you can safely ignore this email. Never share this code with anyone.",
      to: email,
    }));
}

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

export async function checkOtp(rawEmail: string, purpose: string, code: string) {
  const email = rawEmail.trim().toLowerCase();
  const { data: row } = await db.from("otp_codes").select("*").eq("email", email).eq("purpose", purpose).maybeSingle();
  if (!row || new Date(row.expires_at).getTime() < Date.now()) throw new Error("That code has expired. Request a new one.");
  if (row.attempts >= 5) throw new Error("Too many wrong attempts. Request a new code.");
  if (!same(row.code_hash, hash(email, purpose, code.trim()))) {
    await db.from("otp_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    throw new Error("Incorrect code");
  }
  await db.from("otp_codes").delete().eq("id", row.id);
}
