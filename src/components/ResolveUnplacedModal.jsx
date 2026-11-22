import { useEffect, useState } from "react";
import { api, floorLabel } from "../lib/api";
import { Badge, Modal, useLock, useUi } from "./ui";
export default function ResolveUnplacedModal({ schedule, onClose, onDone }) {
  const ui = useUi();
  const [locked, guard] = useLock();
  const [rooms, setRooms] = useState(null);
  const [room, setRoom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .list("rooms")
      .then((r) => {
        const sorted = [...r].sort(
          (a, b) =>
            b.capacity - a.capacity ||
            a.name.localeCompare(b.name, undefined, { numeric: true }),
        );
        setRooms(sorted);
        setRoom(sorted[0]?.id || "");
      })
      .catch((e) => {
        setError(e.message);
        setRooms([]);
      });
  }, []);
  const resolve = guard(async () => {
    const selected = rooms?.find((r) => r.id === room);
    if (!selected) return;
    if (selected.capacity < schedule.section?.student_count) {
      const yes = await ui.confirm({
        title: "Room is too small",
        message: `Room ${selected.name} holds ${selected.capacity} but the section has ${schedule.section.student_count} students. Use anyway?`,
        confirmLabel: "Use anyway",
        danger: true,
      });
      if (!yes) return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api.action("resolve_unplaced", {
        schedule_id: schedule.id,
        room_id: room,
      });
      ui.toast.success(`${result.placed} exam(s) placed in ${selected.name}`);
      onDone();
      onClose();
    } catch (e) {
      setError(e.message);
    }
    setBusy(false);
  });
  return (
    <Modal
      title="Resolve unplaced exams"
      onClose={onClose}
      footer={
        <>
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            disabled={busy || locked || !room || !rooms?.length}
            aria-busy={locked}
            onClick={resolve}
          >
            {busy ? "Placing…" : "Place in selected room"}
          </button>
        </>
      }
    >
      <p className="muted" style={{ marginTop: 0 }}>
        Choose a room for the remaining unplaced subjects. Largest rooms appear
        first. Any assigned room will be used even if it is below the section
        size.
      </p>
      {error && <div className="alert error">{error}</div>}
      {rooms === null ? (
        <p className="muted">Loading rooms…</p>
      ) : !rooms.length ? (
        <p className="muted">No rooms are available. Add a room first.</p>
      ) : (
        <div className="plist room-options">
          {rooms.map((r) => {
            const fits = r.capacity >= (schedule.section?.student_count || 0);
            return (
              <label
                key={r.id}
                className={`pick ${room === r.id ? "on" : ""} ${fits ? "" : "over"}`}
              >
                <input
                  type="radio"
                  name="resolve-room"
                  checked={room === r.id}
                  onChange={() => setRoom(r.id)}
                />
                <span>
                  {r.name}{" "}
                  {room === r.id && <Badge tone="green">Selected</Badge>}
                </span>
                <span className="muted">
                  {floorLabel(r.floor)} · capacity {r.capacity}
                </span>
                {!fits && <Badge tone="amber">Too small</Badge>}
              </label>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
