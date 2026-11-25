import { useState } from "react";
const rank = (s: any, n: string) => {
  const c = s.code.toLowerCase(), t = s.title.toLowerCase();
  if (c.startsWith(n)) return 0;
  if (c.includes(n)) return 1;
  if (t.split(/\s+/).some((w: string) => w.startsWith(n))) return 2;
  return t.includes(n) ? 3 : 9;
};
export default function SubjectPicker({ subjects, value, onChange }: { subjects: any[]; value: string[]; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const n = q.trim().toLowerCase();
  const list = n
    ? subjects.filter((s) => !value.includes(s.code)).map((s) => [rank(s, n), s] as [number, any]).filter(([r]) => r < 9)
        .sort((a, b) => a[0] - b[0] || a[1].code.localeCompare(b[1].code)).slice(0, 8).map((x) => x[1])
    : [];
  const add = (c: string) => { onChange([...value, c]); setQ(""); };
  return <div>
    <input className="searchbox" placeholder="Type a code or title, e.g. IT" value={q} onChange={(e) => setQ(e.target.value)} />
    {n && <div className="checks" style={{ gridTemplateColumns: "1fr", maxHeight: 240 }}>
      {list.map((s) => <button type="button" key={s.code} className="ghost sm" style={{ justifyContent: "flex-start", textAlign: "left" }} onClick={() => add(s.code)}>{s.code} · {s.title}</button>)}
      {!list.length && <span className="muted">No subject found.</span>}
    </div>}
    <div className="chips" style={{ marginTop: 10 }}>
      {value.map((c) => <span className="winchip" key={c}>{c}<button type="button" aria-label="Remove" onClick={() => onChange(value.filter((x) => x !== c))}>×</button></span>)}
    </div>
    <small className="muted">{value.length} selected</small>
  </div>;
}
