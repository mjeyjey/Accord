import { useEffect, useState } from "react";
import { api, t5 } from "../lib/api";
import { useMe } from "../lib/me";
import { Badge, TableSkeleton, useLock, useUi } from "./ui";
import Pager, { slicePage } from "./Pager";
import { exportTable } from "../lib/exportTable";
import { SEM } from "../lib/periods";

const COLS = [
  { label: "Date", weight: 1.4, get: (x) => x.exam_date },
  {
    label: "Time",
    weight: 1.5,
    get: (x) => `${t5(x.start_time)}-${t5(x.end_time)}`,
  },
  {
    label: "Section",
    weight: 1.6,
    get: (x) => `${x.program?.code} ${x.section?.year_level}${x.section?.name}`,
  },
  {
    label: "Subject",
    weight: 4,
    get: (x) => `${x.subject?.code} - ${x.subject?.title}`,
  },
  { label: "Room", weight: 1.2, get: (x) => x.room?.name || "" },
  {
    label: "Proctor",
    weight: 2,
    get: (x) => x.proctor?.full_name || "To be announced",
  },
];

export default function EndedPeriods() {
  const ui = useUi();
  const me = useMe();
  const [locked, guard] = useLock();
  const [periods, setPeriods] = useState(null);
  const [sched, setSched] = useState([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);

  useEffect(() => {
    Promise.all([api.list("exam_periods"), api.list("programs")])
      .then(([p, progs]) => {
        const mine = new Set(
          progs
            .filter(
              (x) =>
                me.role === "admin" || x.department_id === me.department_id,
            )
            .map((x) => x.id),
        );
        setPeriods(
          p
            .filter(
              (x) =>
                x.status === "ended" &&
                (me.role === "admin" ||
                  (x.program_ids || []).some((id) => mine.has(id))),
            )
            .sort((a, b) => b.end_date.localeCompare(a.end_date)),
        );
      })
      .catch((e) => {
        ui.toast.error(e.message);
        setPeriods([]);
      });
    api
      .list("schedules")
      .then(setSched)
      .catch(() => {});
  }, []);

  const count = (id, status) =>
    sched.filter((s) => s.period_id === id && s.status === status).length;
  const shown = (periods || []).filter(
    (p) => !q || p.name.toLowerCase().includes(q.toLowerCase()),
  );

  const download = guard(async (p, format) => {
    const rows = sched
      .filter((s) => s.period_id === p.id && s.status === "scheduled")
      .sort((a, b) =>
        (a.exam_date + t5(a.start_time)).localeCompare(
          b.exam_date + t5(b.start_time),
        ),
      );
    try {
      await exportTable({
        title: p.name,
        subtitle: `${p.start_date} to ${p.end_date}`,
        filename: `Accord_${p.name}`.replace(/[^\w-]+/g, "_"),
        format,
        rows,
        columns: COLS,
      });
      ui.toast.success("Export ready");
    } catch (e) {
      ui.toast.error(e.message);
    }
  });

  return (
    <section className="card">
      <div className="bar">
        <h3>
          Previous exam periods{" "}
          {periods && <Badge tone="gray">{shown.length}</Badge>}
        </h3>
        <span style={{ flex: 1 }} />
        <input
          placeholder="Search period"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          style={{ width: 220 }}
        />
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Periods move here automatically after their last day. Download the
        schedule of any past period from here.
      </p>
      {periods === null ? (
        <TableSkeleton rows={4} cols={6} />
      ) : (
        <>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Semester</th>
                  <th>Dates</th>
                  <th>Programs</th>
                  <th>Exams placed</th>
                  <th>Not placed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {slicePage(shown, page, size).map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.name} <Badge tone="gray">Ended</Badge>
                    </td>
                    <td>{SEM[p.semester]}</td>
                    <td>
                      {p.start_date} to {p.end_date}
                    </td>
                    <td>{p.program_ids?.length || 0}</td>
                    <td>{count(p.id, "scheduled")}</td>
                    <td>{count(p.id, "unscheduled")}</td>
                    <td className="actions">
                      <button
                        className="ghost sm"
                        disabled={locked || !count(p.id, "scheduled")}
                        aria-busy={locked}
                        onClick={() => download(p, "csv")}
                      >
                        CSV
                      </button>
                      <button
                        className="ghost sm"
                        disabled={locked || !count(p.id, "scheduled")}
                        aria-busy={locked}
                        onClick={() => download(p, "pdf")}
                      >
                        PDF
                      </button>
                    </td>
                  </tr>
                ))}
                {!shown.length && (
                  <tr>
                    <td colSpan={7} className="empty">
                      No exam period has ended yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pager
            total={shown.length}
            page={page}
            size={size}
            onPage={setPage}
            onSize={setSize}
          />
        </>
      )}
    </section>
  );
}
