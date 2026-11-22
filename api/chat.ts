import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db, authenticate, fetchAll } from "./_lib.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERSON = "id,full_name,role,avatar_url,department:departments(code)";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const me = await authenticate(req, res);
  if (!me) return;
  try {
    if (req.method === "GET") {
      const action = String(req.query.action || "conversations");

      if (action === "unread") {
        const { count, error } = await db.from("chat_messages").select("id", { count: "exact", head: true })
          .eq("recipient_id", me.id).is("read_at", null);
        if (error) throw error;
        return res.json({ count: count || 0 });
      }

      if (action === "people") {
        const rows = await fetchAll(() => db.from("profiles").select(PERSON)
          .eq("status", "active").neq("id", me.id).order("full_name").order("id"));
        return res.json(rows);
      }

      if (action === "conversations") {
        const { data, error } = await db.from("chat_messages")
          .select("id,sender_id,recipient_id,body,created_at,read_at")
          .or(`sender_id.eq.${me.id},recipient_id.eq.${me.id}`)
          .order("created_at", { ascending: false }).limit(1000);
        if (error) throw error;
        const by = new Map<string, any>();
        for (const m of data || []) {
          const other = m.sender_id === me.id ? m.recipient_id : m.sender_id;
          const c = by.get(other) || { id: other, last: m, unread: 0 };
          if (m.recipient_id === me.id && !m.read_at) c.unread++;
          by.set(other, c);
        }
        const ids = [...by.keys()];
        const { data: people } = ids.length
          ? await db.from("profiles").select(PERSON).in("id", ids)
          : { data: [] as any[] };
        const pm = new Map((people || []).map((p: any) => [p.id, p]));
        return res.json([...by.values()].filter((c) => pm.has(c.id)).map((c) => ({
          user: pm.get(c.id),
          last: { body: c.last.body, created_at: c.last.created_at, mine: c.last.sender_id === me.id },
          unread: c.unread,
        })));
      }

      if (action === "messages") {
        const other = String(req.query.with || "");
        if (!UUID.test(other)) return res.status(400).json({ error: "Pick someone to chat with" });
        const { data, error } = await db.from("chat_messages").select("id,sender_id,body,created_at,read_at")
          .or(`and(sender_id.eq.${me.id},recipient_id.eq.${other}),and(sender_id.eq.${other},recipient_id.eq.${me.id})`)
          .order("created_at", { ascending: false }).limit(200);
        if (error) throw error;
        await db.from("chat_messages").update({ read_at: new Date().toISOString() })
          .eq("sender_id", other).eq("recipient_id", me.id).is("read_at", null);
        return res.json((data || []).reverse().map((m: any) => ({
          id: m.id, mine: m.sender_id === me.id, body: m.body, created_at: m.created_at, read: !!m.read_at,
        })));
      }
      return res.status(400).json({ error: "Unknown action" });
    }

    if (req.method === "POST") {
      const b: any = req.body || {};
      const to = String(b.to || "");
      const body = String(b.body || "").trim();
      if (!UUID.test(to) || to === me.id) return res.status(400).json({ error: "Pick someone to message" });
      if (!body) return res.status(400).json({ error: "Type a message first" });
      if (body.length > 1000) return res.status(400).json({ error: "Messages can be up to 1000 characters" });
      const { data: p } = await db.from("profiles").select("id,status").eq("id", to).maybeSingle();
      if (!p || p.status !== "active") return res.status(404).json({ error: "That user is not available" });
      const { count } = await db.from("chat_messages").select("id", { count: "exact", head: true })
        .eq("sender_id", me.id).gte("created_at", new Date(Date.now() - 60000).toISOString());
      if ((count || 0) >= 30) return res.status(429).json({ error: "You are sending messages too fast. Wait a moment." });
      const { data, error } = await db.from("chat_messages").insert({ sender_id: me.id, recipient_id: to, body })
        .select("id,body,created_at").single();
      if (error) throw error;
      return res.status(201).json({ id: data.id, mine: true, body: data.body, created_at: data.created_at, read: false });
    }
    return res.status(405).end();
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Server error" });
  }
}
