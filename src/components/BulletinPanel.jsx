import { useState } from "react";
import { api } from "../lib/api";
import { Badge, Field, useLock, useUi } from "./ui";
const ROLE = {
  admin: { label: "Admin", tone: "blue" },
  head: { label: "Dept Head", tone: "green" },
};
const when = (iso) =>
  new Date(iso).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
export default function BulletinPanel({
  open,
  items,
  since,
  canPost,
  onClose,
  onOpen,
  onChanged,
}) {
  const ui = useUi();
  const [locked, guard] = useLock();
  const [deps, setDeps] = useState([]);
  const [form, setForm] = useState(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const start = () => {
    setForm({ title: "", body: "", department_id: "" });
    setErr("");
    if (!deps.length)
      api
        .list("departments")
        .then(setDeps)
        .catch(() => {});
  };
  const post = guard(async (e) => {
    e.preventDefault();
    if (!form) return;
    if (!form.title.trim() || !form.body.trim())
      return setErr("Title and message are required");
    setBusy(true);
    setErr("");
    try {
      await api.create("bulletins", {
        title: form.title,
        body: form.body,
        department_id: form.department_id || null,
      });
      ui.toast.success("Announcement posted");
      setForm(null);
      onChanged();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  });
  const remove = guard(async (b) => {
    const yes = await ui.confirm({
      title: "Delete this announcement?",
      message: "It will be removed for everyone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!yes) return;
    try {
      await api.remove("bulletins", b.id);
      onChanged();
    } catch (e) {
      ui.toast.error(e.message);
    }
  });
  return (
    <div className={`notifpanel ${open ? "open" : ""}`} aria-hidden={!open}>
      <div className="np-head">
        <h3>Bulletin</h3>
        {canPost && !form && (
          <button className="sm" onClick={start}>
            + Add announcement
          </button>
        )}
        <button
          type="button"
          className="x"
          onClick={onClose}
          aria-label="Close bulletin"
        >
          ×
        </button>
      </div>
      <div className="np-list">
        {canPost && form && (
          <form onSubmit={post} noValidate className="inline-edit">
            {err && <div className="alert error">{err}</div>}
            <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
              <Field label="Title *">
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </Field>
              <Field label="Message *">
                <textarea
                  rows={3}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                />
              </Field>
              <Field label="Send to">
                <select
                  value={form.department_id}
                  onChange={(e) =>
                    setForm({ ...form, department_id: e.target.value })
                  }
                >
                  <option value="">Everyone</option>
                  {deps.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} - {d.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="sm"
                type="submit"
                disabled={busy || locked}
                aria-busy={locked}
              >
                {busy ? "Posting…" : "Post"}
              </button>
              <button
                className="ghost sm"
                type="button"
                onClick={() => setForm(null)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {items.map((b) => {
          const role = ROLE[b.author?.role];
          const isNew = new Date(b.created_at).getTime() > since;
          const clickable = b.kind === "availability";
          return (
            <div
              key={b.id}
              className={`nitem ${isNew ? "unread" : ""}`}
              role={clickable ? "button" : undefined}
              style={{ cursor: clickable ? "pointer" : "default" }}
              onClick={() => clickable && onOpen(b)}
            >
              <i className="ndot" />
              <span className="ntext" style={{ flex: 1 }}>
                <b>{b.title}</b>
                <span style={{ whiteSpace: "pre-wrap" }}>{b.body}</span>
                <span className="row" style={{ gap: 6, marginTop: 4 }}>
                  <Badge tone="gray">{b.department?.code || "Everyone"}</Badge>
                  {role && <Badge tone={role.tone}>{role.label}</Badge>}
                </span>
                <small>
                  Posted by {b.created_by_name || "Unknown"} ·{" "}
                  {when(b.created_at)}
                  {clickable ? " · tap to open" : ""}
                </small>
              </span>
              {canPost && (
                <button
                  className="ghost red sm"
                  disabled={locked}
                  aria-busy={locked}
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(b);
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          );
        })}
        {!items.length && (
          <p className="muted" style={{ padding: 16 }}>
            No announcements yet.
          </p>
        )}
      </div>
    </div>
  );
}
