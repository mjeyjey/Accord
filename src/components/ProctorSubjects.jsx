import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Modal, useUi } from "./ui";
import SubjectPicker from "./SubjectPicker";
export default function ProctorSubjects({ proctor, onClose }) {
  const ui = useUi();
  const [subjects, setSubjects] = useState([]);
  const [val, setVal] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([api.action("subject_catalog", {}), api.action("proctor_subjects", { proctor_id: proctor.id })])
      .then(([s, v]) => { setSubjects(s); setVal(v); })
      .catch((e) => { ui.toast.error(e.message); onClose(); });
  }, []);
  const save = async () => {
    setBusy(true);
    try { await api.action("set_proctor_subjects", { proctor_id: proctor.id, codes: val }); ui.toast.success("Subjects saved"); onClose(); }
    catch (e) { ui.toast.error(e.message); }
    setBusy(false);
  };
  return (
    <Modal title={`Subjects: ${proctor.full_name}`} onClose={onClose}
      footer={<><button className="ghost" onClick={onClose}>Cancel</button><button disabled={busy || !val} onClick={save}>{busy ? "Saving…" : "Save"}</button></>}>
      <p className="muted" style={{ marginTop: 0 }}>This proctor will never be assigned to a section that has these subjects.</p>
      {val ? <SubjectPicker subjects={subjects} value={val} onChange={setVal} /> : <p className="muted">Loading…</p>}
    </Modal>
  );
}
