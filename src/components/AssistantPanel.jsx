import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import Icon from "./icons";
const SUGGEST = {
  manager: [
    "How many proctors are available today?",
    "Which sections are still pending a proctor or room?",
    "Any proctor emergencies?",
    "How do I generate a schedule?",
    "Which exams could not be placed?",
    "Pending account requests",
  ],
  proctor: [
    "What is my next exam?",
    "Which open assignments can I accept?",
    "How do I add my availability?",
    "How do I flag an emergency?",
    "How many hours before the exam can I accept?",
  ],
};
const MAX_CHATS = 30;
const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const loadChats = (key) => {
  try {
    const l = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(l) ? l : [];
  } catch {
    return [];
  }
};
const ago = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} day(s) ago`;
};
// Turns the assistant's plain text into headings, a card per list item, and small detail lines.
function Rich({ text }) {
  const out = [];
  let items = [];
  const flush = () => {
    if (!items.length) return;
    out.push(
      <ul key={out.length}>
        {items.map((it, i) => (
          <li key={i} className={it.sub.length ? "has-sub" : ""}>
            <span>{it.head}</span>
            {it.sub.map((s, j) => (
              <small key={j}>{s}</small>
            ))}
          </li>
        ))}
      </ul>,
    );
    items = [];
  };
  for (const raw of text.split("\n")) {
    if (!raw.trim()) {
      flush();
      continue;
    }
    if (/^[-•*] /.test(raw)) items.push({ head: raw.slice(2).trim(), sub: [] });
    else if (/^\s+\S/.test(raw) && items.length)
      items[items.length - 1].sub.push(raw.trim());
    else {
      flush();
      const t = raw.trim();
      out.push(
        t.endsWith(":") ? (
          <h5 key={out.length}>{t}</h5>
        ) : (
          <p key={out.length}>{t}</p>
        ),
      );
    }
  }
  flush();
  return <>{out}</>;
}
export default function AssistantPanel({ open, role, userId, onClose, onGo }) {
  const KEY = `accord-chats-${userId}`;
  const [chats, setChats] = useState(() => loadChats(KEY));
  const [activeId, setActiveId] = useState(null);
  const [view, setView] = useState("chat");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const msgs = chats.find((c) => c.id === activeId)?.msgs || [];
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(chats));
    } catch {
      /* storage full or blocked */
    }
  }, [chats]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs.length, busy, activeId, view]);
  const save = (id, list) =>
    setChats((l) => {
      const old = l.find((c) => c.id === id);
      const title =
        old?.title ||
        list.find((m) => m.role === "user")?.content.slice(0, 50) ||
        "New chat";
      return [
        { id, title, updated: Date.now(), msgs: list },
        ...l.filter((c) => c.id !== id),
      ].slice(0, MAX_CHATS);
    });
  const send = async (q = text) => {
    q = q.trim();
    if (!q || busy) return;
    const id = activeId || uid();
    if (!activeId) setActiveId(id);
    const next = [...msgs, { role: "user", content: q }];
    save(id, next);
    setText("");
    setBusy(true);
    try {
      const r = await api.assistant(
        next.map(({ role: msgRole, content }) => ({ role: msgRole, content })),
      );
      save(id, [
        ...next,
        { role: "assistant", content: r.reply, links: r.links },
      ]);
    } catch (e) {
      save(id, [
        ...next,
        {
          role: "assistant",
          content: e.message || "Something went wrong.",
          error: true,
        },
      ]);
    }
    setBusy(false);
  };
  const submit = (e) => {
    e.preventDefault();
    send();
  };
  const newChat = () => {
    setActiveId(null);
    setView("chat");
    setText("");
  };
  const remove = (id) => {
    setChats((l) => l.filter((c) => c.id !== id));
    if (id === activeId) setActiveId(null);
  };
  return (
    <div className={`notifpanel ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="np-head">
        <h3>{view === "history" ? "Previous conversations" : "Assistant"}</h3>
        {view === "history" ? (
          <button className="ghost sm" onClick={() => setView("chat")}>
            Back
          </button>
        ) : (
          <>
            <button className="ghost sm" onClick={() => setView("history")}>
              History{chats.length ? ` (${chats.length})` : ""}
            </button>
            <button
              className="ghost sm"
              disabled={!msgs.length}
              onClick={newChat}
            >
              New chat
            </button>
          </>
        )}
        <button
          type="button"
          className="x"
          onClick={onClose}
          aria-label="Close assistant"
        >
          ×
        </button>
      </div>
      {view === "history" ? (
        <div className="np-list">
          <button className="sm" onClick={newChat}>
            + Start a new chat
          </button>
          {!chats.length && (
            <p className="muted" style={{ padding: 8 }}>
              No previous conversations yet.
            </p>
          )}
          {chats.map((c) => (
            <div
              key={c.id}
              style={{ display: "flex", gap: 6, alignItems: "stretch" }}
            >
              <button
                className="nitem"
                style={{ flex: 1 }}
                onClick={() => {
                  setActiveId(c.id);
                  setView("chat");
                }}
              >
                <span className="ntext">
                  <b>{c.title}</b>
                  <small>
                    {ago(c.updated)} ·{" "}
                    {c.msgs.filter((m) => m.role === "user").length} question(s)
                  </small>
                </span>
              </button>
              <button
                className="ghost red sm"
                onClick={() => remove(c.id)}
                aria-label="Delete conversation"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="np-list chat">
            {!msgs.length && (
              <div className="sugg">
                {/* <p className="muted" style={{ margin: "4px 2px" }}>
                  Ask about your data or how to use Accord.
                </p> */}
                {SUGGEST[role === "proctor" ? "proctor" : "manager"].map(
                  (s) => (
                    <button
                      key={s}
                      className="ghost sm"
                      onClick={() => send(s)}
                    >
                      {s}
                    </button>
                  ),
                )}
              </div>
            )}
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`msg ${m.role === "user" ? "user" : "bot"} ${m.error ? "err" : ""}`}
              >
                {m.role === "user" || m.error ? (
                  m.content
                ) : (
                  <Rich text={m.content} />
                )}
                {!!m.links?.length && (
                  <div className="msglinks">
                    {m.links.map((l) => (
                      <button
                        key={l.to}
                        className="ghost sm"
                        onClick={() => onGo(l.to)}
                      >
                        {l.label} ›
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="msg bot muted">Thinking…</div>}
            <div ref={end} />
          </div>
          <form className="chatform" onSubmit={submit}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask something…"
              maxLength={500}
            />
            <button
              type="submit"
              className="iconbtn"
              disabled={busy || !text.trim()}
              aria-label="Send"
            >
              <Icon name="send" size={16} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
