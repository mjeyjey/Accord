import { useEffect, useState } from "react";
import { api, floorLabel, t5 } from "../lib/api";
import { Badge, Modal, TableSkeleton, useUi } from "./ui";
const fmt = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
export default function ProctorSchedule({ proctor, onClose }) {
  const ui = useUi();
  const [data, setData] = useState(null);
  useEffect(() => {
    api
      .action("proctor_schedule", { proctor_id: proctor.id })
      .then((d) => setData(d))
      .catch((e) => {
        ui.toast.error(e.message);
        onClose();
      });
  }, [proctor.id]);
  const groups = {};
  (data?.schedule || []).forEach((r) => {
    (groups[`${r.exam_date}|${r.section_id}|${r.room?.name}`] ||= []).push(r);
  });
  const list = Object.values(groups);
  const days = {};
  (data?.availability || []).forEach((a) => {
    (days[a.date] ||= []).push(`${t5(a.start_time)}-${t5(a.end_time)}`);
  });
  const dates = Object.keys(days).sort();
  return (
    <Modal
      wide
      title={`Schedule: ${proctor.full_name}`}
      onClose={onClose}
      footer={<button onClick={onClose}>Close</button>}
    >
      {data === null ? (
        <TableSkeleton rows={4} cols={5} />
      ) : (
        <>
          <div className="chips">
            <Badge tone="gray">View only</Badge>
          </div>
          <h4 className="sechead">Time availability</h4>
          {!dates.length ? (
            <p className="muted">
              This proctor has not submitted time availability yet.
            </p>
          ) : (
            <div className="scroll" style={{ maxHeight: 200 }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Available hours</th>
                  </tr>
                </thead>
                <tbody>
                  {dates.map((d) => (
                    <tr key={d}>
                      <td>{fmt(d)}</td>
                      <td>{days[d].join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <h4 className="sechead">Assigned exams</h4>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Section</th>
                  <th>Subjects</th>
                  <th>Room</th>
                  <th>Period</th>
                </tr>
              </thead>
              <tbody>
                {list.map((g) => {
                  const f = g[0],
                    last = g[g.length - 1];
                  return (
                    <tr key={f.id} className={f.emergency ? "danger" : ""}>
                      <td>{fmt(f.exam_date)}</td>
                      <td>
                        {t5(f.start_time)}-{t5(last.end_time)}
                      </td>
                      <td>
                        {f.program?.code} {f.section?.year_level}
                        {f.section?.name}
                      </td>
                      <td>{g.map((r) => r.subject?.code).join(", ")}</td>
                      <td>
                        {f.room?.name}
                        {f.room ? `, ${floorLabel(f.room.floor)}` : ""}
                      </td>
                      <td>
                        {f.period?.name}{" "}
                        {f.emergency && <Badge tone="red">Emergency</Badge>}
                      </td>
                    </tr>
                  );
                })}
                {!list.length && (
                  <tr>
                    <td colSpan={6} className="empty">
                      No exams assigned to this proctor.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Modal>
  );
}
