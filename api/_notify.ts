import { db } from "./_lib.js";
import { emailLayout, sendBcc } from "./_otp.js";

export interface Note { user_id: string; kind: string; title: string; body?: string | null; mail?: string }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

// Saves in-app notifications, then emails the same message. Identical messages go out as BCC batches.
export async function notify(notes: Note[]) {
  if (!notes.length) return;
  for (let i = 0; i < notes.length; i += 500) {
    const { error } = await db.from("notifications").insert(notes.slice(i, i + 500).map(({ mail, ...n }) => n));
    if (error) console.error("notify insert:", error.message);
  }
  try {
    const ids = [...new Set(notes.map((n) => n.user_id))];
    const emails = new Map<string, string>();
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await db.from("profiles").select("id,email").eq("status", "active").in("id", ids.slice(i, i + 200));
      (data || []).forEach((p: any) => p.email && emails.set(p.id, p.email));
    }
    const groups = new Map<string, { n: Note; to: string[] }>();
    for (const n of notes) {
      const to = emails.get(n.user_id);
      if (!to) continue;
      const k = `${n.title}\u0000${n.mail ?? n.body ?? ""}`;
      const g = groups.get(k) || { n, to: [] };
      g.to.push(to);
      groups.set(k, g);
    }
    const base = (process.env.APP_URL || "").replace(/\/$/, "");
    for (const { n, to } of groups.values()) {
      const text = n.mail ?? n.body ?? "";
      const html = emailLayout({
        preheader: n.title, heading: n.title,
        intro: esc(text).replace(/\n/g, "<br>"),
        note: base ? `Open <a href="${base}">Accord</a> to see the details.` : "You can see the details in Accord.",
      });
      for (let i = 0; i < to.length; i += 40)
        await sendBcc(to.slice(i, i + 40), n.title, `${n.title}\n\n${text}\n\nLa Concepcion College`, html)
          .catch((e: any) => console.error("notify mail:", e?.message));
    }
  } catch (e: any) { console.error("notify mail:", e?.message); }
}