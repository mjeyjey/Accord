import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Modal, useLock, useUi } from "./ui";
import ProctorPicker from "./ProctorPicker";
export default function ReplaceModal({ scheduleId, onClose, onDone }) {
  const ui = useUi();
  const [locked, guard] = useLock();
  const [data, setData] = useState(null);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api
      .action("candidates", { schedule_id: scheduleId })
      .then((d) => {
        setData(d);
        setPick(d.candidates[0]?.id || (d.self?.free ? d.self.id : ""));
      })
      .catch((e) => {
        ui.toast.error(e.message);
        onClose();
      });
  }, [scheduleId]);
  const confirm = guard(async () => {
    setBusy(true);
    try {
      await api.action("reassign", {
        schedule_id: scheduleId,
        proctor_id: pick,
      });
      ui.toast.success("Proctor assigned");
      onDone();
      onClose();
    } catch (e) {
      ui.toast.error(e.message);
    }
    setBusy(false);
  });
  return (
    <Modal
      title="Choose a proctor"
      onClose={onClose}
      footer={
        <>
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            disabled={!pick || busy || locked}
            aria-busy={locked}
            onClick={confirm}
          >
            {busy ? "Assigning…" : "Assign"}
          </button>
        </>
      }
    >
      {!data && <p className="muted">Checking availability…</p>}
      {data && (data.candidates.length > 0 || data.self?.free) && (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            {data.fallback
              ? "No proctor with entered availability covers these hours, so proctors who have not entered availability are shown."
              : "These proctors entered availability that covers every hour of this block and have no clash."}{" "}
            The proctor you choose will be notified.
          </p>
          <ProctorPicker
            candidates={data.candidates}
            selected={pick}
            onSelect={setPick}
            self={data.self}
          />
        </>
      )}
      {data && !data.candidates.length && !data.self?.free && (
        <div className="alert error">No proctor is free for those hours.</div>
      )}
    </Modal>
  );
}
