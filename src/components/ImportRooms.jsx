import { useRef, useState } from "react";
import { api, FLOORS, floorLabel } from "../lib/api";
import { Modal, useLock, useUi } from "./ui";
const floorOf = (raw, name) => {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (s) {
    if (s.startsWith("g") || s.startsWith("b")) return "Ground";
    const n = parseInt(s, 10);
    if (n >= 1 && n <= 5) return FLOORS[n];
  }
  const c = name.trim().charAt(0);
  return /[1-5]/.test(c) ? FLOORS[Number(c)] : "Ground";
};
export default function ImportRooms({ onClose, onDone }) {
  const ui = useUi();
  const input = useRef(null);
  const [rows, setRows] = useState(null);
  const [skipped, setSkipped] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, guard] = useLock();
  const read = async (f) => {
    if (!f) return;
    setErr("");
    setRows(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
        defval: "",
      });
      const out = new Map();
      let skip = 0;
      for (const row of data) {
        const k = {};
        Object.keys(row).forEach((h) => {
          k[h.trim().toLowerCase()] = row[h];
        });
        const name = String(
          k["room"] ?? k["room name"] ?? k["name"] ?? "",
        ).trim();
        const capacity = Math.floor(Number(k["capacity"] ?? k["cap"] ?? 0));
        if (!name || !(capacity > 0)) {
          skip++;
          continue;
        }
        out.set(name, { name, capacity, floor: floorOf(k["floor"], name) });
      }
      if (!out.size)
        throw new Error(
          'No rooms found. The first sheet needs the columns "Room" and "Capacity".',
        );
      setRows([...out.values()]);
      setSkipped(skip);
    } catch (e) {
      setErr(e.message || "Could not read that file");
    }
  };
  const apply = guard(async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api.action("import_rooms", { rooms: rows });
      ui.toast.success(
        `Rooms imported: ${r.added} added, ${r.updated} updated`,
      );
      onDone();
      onClose();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  });
  return (
    <Modal
      wide
      title="Import rooms"
      onClose={onClose}
      footer={
        <>
          <button className="ghost" onClick={onClose}>
            Cancel
          </button>
          {rows && (
            <button
              disabled={busy || locked}
              aria-busy={locked}
              onClick={apply}
            >
              {busy ? "Saving…" : `Add ${rows.length} rooms`}
            </button>
          )}
        </>
      }
    >
      {err && <div className="alert error">{err}</div>}
      <p className="muted">
        Upload an .xlsx or .csv with the columns <b>Room</b> and <b>Capacity</b>
        . An optional <b>Floor</b> column is used if present; otherwise the
        floor is guessed from the room number (101 = 1st floor, B01 = Ground).
        Existing rooms with the same name are updated. Imported rooms are set to
        Unassigned.
      </p>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => read(e.target.files?.[0])}
      />
      {rows && (
        <>
          {skipped > 0 && (
            <p className="hint">
              {skipped} row(s) were skipped (missing room or capacity).
            </p>
          )}
          <div className="scroll" style={{ marginTop: 10, maxHeight: "40vh" }}>
            <table>
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Floor</th>
                  <th>Capacity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{floorLabel(r.floor)}</td>
                    <td>{r.capacity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
