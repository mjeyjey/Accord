import { useState } from "react";
export default function SubjectPicker({ subjects, value, onChange }) {
  const [q, setQ] = useState("");
  const n = q.trim().toLowerCase();
  const list = subjects.filter((s) => !n || `${s.code} ${s.title}`.toLowerCase().includes(n));
  const toggle = (c) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c]);
  return (
    <div>
      <input className="searchbox" placeholder="Search subject code or title" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="checks" style={{ gridTemplateColumns: "1fr" }}>
        {list.map((s) => (
          <label key={s.code}>
            <input type="checkbox" checked={value.includes(s.code)} onChange={() => toggle(s.code)} />
            {s.code} · {s.title}
          </label>
        ))}
        {!list.length && <span className="muted">No subject found.</span>}
      </div>
      <small className="muted">{value.length} selected</small>
    </div>
  );
}
