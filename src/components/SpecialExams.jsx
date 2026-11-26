import { useEffect, useState } from "react";
import { api, floorLabel, SLOT_TIMES, t5 } from "../lib/api";
import { Field, Modal, useLock, useUi } from "./ui";

const BLANK = { schedule_id: "", student_name: "", student_no: "", reason: "", exam_date: "", start_time: "", room_id: "", proctor_id: "" };
const lab = (r) => `${r.program?.code} ${r.section?.year_level}${r.section?.name} · ${r.subject?.code}`;

export default function SpecialExams({ periodId, rows, onClose }) {
  const ui = useUi();
  const [locked, guard] = useLock();
  const [list, setList] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [procs, setProcs] = useState([]);
  const [f, setF] = useState(BLANK);
  const [err, setErr] = useState("");
  const load = () => api.action("special_list", { period_id: periodId }).then(setList)
    .catch((e) => { ui.toast.error(e.message); setList([]); });
  useEffect(() => {
    load();
    api.list("rooms").then(setRooms).catch(() => {});
    api.list("profiles").then((p) => setProcs(p.filter((x) => x.role === "proctor" && x.status !== "pending"))).catch(() => {});
  }, []);
  const set = (k, v) => setF({ ...f, [k]: v });
  const add = guard(async (e) => {
    e.preventDefault(); setErr("");
    if (!f.schedule_id || !f.student_name.trim() || !f.exam_date || !f.start_time)
      return setErr("Choose the subject, then enter the student name, date and start hour");
    try { await api.action("special_add", { ...f, period_id: periodId }); ui.toast.success("Special exam added"); setF(BLANK); load(); }
    catch (x) { setErr(x.message); }
  });
  const del = guard(async (r) => {
    if (!(await ui.confirm({ title: "Remove this special exam?", confirmLabel: "Remove", danger: true }))) return;
    try { await api.action("special_delete", { id: r.id }); load(); } catch (x) { ui.toast.error(x.message); }
  });
  const sorted = [...rows].sort((a, b) => lab(a).localeCompare(lab(b), undefined, { numeric: true }));
  return (
    <Modal wide title="Special exams (irregular students)" onClose={onClose} footer={<button onClick={onClose}>Close</button>}>
      <p className="muted" style={{ marginTop: 0 }}>For students with conflicting schedules. Pick the subject, then set a separate date, hour, room (on the department's floors) and proctor.</p>
      {err && <div className="alert error">{err}</div>}
      <form onSubmit={add} noValidate>
        <div className="fields">
          <Field label="Section · subject *"><select value={f.schedule_id} onChange={(e) => set("schedule_id", e.target.value)}>
            <option value="">Select</option>{sorted.map((r) => <option key={r.id} value={r.id}>{lab(r)}</option>)}</select></Field>
          <Field label="Student name *"><input value={f.student_name} onChange={(e) => set("student_name", e.target.value)} /></Field>
          <Field label="Student no."><input value={f.student_no} onChange={(e) => set("student_no", e.target.value)} /></Field>
          <Field label="Reason"><input placeholder="Conflict with…" value={f.reason} onChange={(e) => set("reason", e.target.value)} /></Field>
          <Field label="Date *"><input type="date" value={f.exam_date} onChange={(e) => set("exam_date", e.target.value)} /></Field>
          <Field label="Start hour *"><select value={f.start_time} onChange={(e) => set("start_time", e.target.value)}>
            <option value="">Select</option>{SLOT_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
          <Field label="Room"><select value={f.room_id} onChange={(e) => set("room_id", e.target.value)}>
            <option value="">To be announced</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name} · {floorLabel(r.floor)}</option>)}</select></Field>
          <Field label="Proctor"><select value={f.proctor_id} onChange={(e) => set("proctor_id", e.target.value)}>
            <option value="">To be announced</option>{procs.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
        </div>
        <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
          <button type="submit" disabled={locked} aria-busy={locked}>Add special exam</button>
        </div>
      </form>
      <h4 className="sechead">Scheduled special exams</h4>
      <div className="scroll"><table>
        <thead><tr><th>Student</th><th>Subject</th><th>Date</th><th>Time</th><th>Room</th><th>Proctor</th><th /></tr></thead>
        <tbody>
          {(list || []).map((r) => (
            <tr key={r.id}>
              <td>{r.student_name}{r.student_no ? ` (${r.student_no})` : ""}</td>
              <td>{r.section_label} · {r.subject_code}</td><td>{r.exam_date}</td>
              <td>{t5(r.start_time)}-{t5(r.end_time)}</td>
              <td>{r.room?.name || "TBA"}</td><td>{r.proctor?.full_name || "TBA"}</td>
              <td className="actions"><button className="ghost red sm" disabled={locked} onClick={() => del(r)}>Remove</button></td>
            </tr>
          ))}
          {list && !list.length && <tr><td colSpan={7} className="empty">None yet.</td></tr>}
        </tbody>
      </table></div>
    </Modal>
  );
}