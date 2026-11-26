import { useEffect, useState } from "react";
import { api, t5 } from "../lib/api";
import { AreaChart, BarChart, Donut } from "../components/Charts";
import { Help, Skeleton, useUi } from "../components/ui";
import Icon from "../components/icons";
import ExportMenu from "../components/ExportMenu";
import { exportTable } from "../lib/exportTable";
import { exportReport } from "../lib/exportReport";
import { SEM, todayIso } from "../lib/periods";
import CountUp from "../components/CountUp";
const TBA = "To be announced";
const Card = ({ title, icon, info, insight, children }) => (
  <section className="card rpt">
    <div className="rpt-head">
      <span className="rico">
        <Icon name={icon} size={18} />
      </span>
      <h3>{title}</h3>
      <Help align="right" text={info} />
    </div>
    <div className="rpt-body">{children}</div>
    {insight && <p className="insight">{insight}</p>}
  </section>
);
const top = (d) => [...d].sort((a, b) => b[1] - a[1])[0];
const line = (t, what) =>
  t ? `${what}: ${t[0]} (${t[1]} exam hour${t[1] === 1 ? "" : "s"}).` : "";
const CSV = [
  { label: "Date", get: (x) => x.exam_date },
  { label: "Start", get: (x) => t5(x.start_time) },
  { label: "End", get: (x) => t5(x.end_time) },
  { label: "Program", get: (x) => x.program?.code },
  { label: "Year", get: (x) => x.section?.year_level },
  { label: "Section", get: (x) => x.section?.name },
  { label: "Subject code", get: (x) => x.subject?.code },
  { label: "Subject", get: (x) => x.subject?.title },
  { label: "Room", get: (x) => x.room?.name },
  { label: "Floor", get: (x) => x.room?.floor },
  { label: "Proctor", get: (x) => x.proctor?.full_name || TBA },
];
export default function Reports() {
  const ui = useUi();
  const [periods, setPeriods] = useState([]);
  const [deps, setDeps] = useState([]);
  const [all, setAll] = useState(null);
  const [sel, setSel] = useState("");
  useEffect(() => {
    Promise.all([
      api.list("exam_periods"),
      api.list("schedules"),
      api.list("departments"),
    ])
      .then(([p, rows, d]) => {
        const current = p
          .filter((x) => x.status !== "ended" && x.end_date >= todayIso())
          .sort((a, b) => a.start_date.localeCompare(b.start_date));
        setPeriods(current);
        setDeps(d);
        if (current[0]) setSel(current[0].id);
        setAll(rows);
      })
      .catch((e) => {
        ui.toast.error(e.message);
        setAll([]);
      });
  }, []);
  const rows = (all || []).filter((x) => x.period_id === sel);
  const ok = rows.filter((x) => x.status === "scheduled");
  const bad = rows.filter((x) => x.status === "unscheduled");
  const secCount = (list) => new Set(list.map((x) => x.section_id)).size;
  const count = (key) => {
    const m = {};
    ok.forEach((x) => {
      const k = key(x) || "-";
      m[k] = (m[k] || 0) + 1;
    });
    return Object.entries(m).sort();
  };
  const perDay = count((x) => x.exam_date);
  const perProctor = count((x) => x.proctor?.full_name || TBA).filter(
    ([k]) => k !== TBA,
  );
  const perRoom = count((x) => x.room?.name);
  const perProgram = count((x) => x.program?.code);
  const tba = ok.filter((x) => !x.proctor_id).length;
  const rate = rows.length ? Math.round((ok.length / rows.length) * 100) : 0;
  const doExport = async (format) => {
    const p = periods.find((x) => x.id === sel);
    const name = p?.name || "Exam period";
    const file = `Accord_Report_${name}`.replace(/[^\w-]+/g, "_");
    const sorted = [...ok].sort((a, b) =>
      (a.exam_date + t5(a.start_time)).localeCompare(
        b.exam_date + t5(b.start_time),
      ),
    );
    const depCode = new Map(deps.map((d) => [d.id, d.code]));
    const dcode = (x) => depCode.get(x.program?.department_id) || "";
    const sortedByDept = [...sorted].sort(
      (a, b) =>
        dcode(a).localeCompare(dcode(b)) ||
        (a.exam_date + t5(a.start_time)).localeCompare(
          b.exam_date + t5(b.start_time),
        ),
    );
    const depGroups = [...deps]
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((dp) => {
        const r = sorted.filter((x) => x.program?.department_id === dp.id);
        const b = bad.filter((x) => x.program?.department_id === dp.id);
        const pg = {};
        r.forEach((x) => {
          const k = x.program?.code || "-";
          pg[k] = (pg[k] || 0) + 1;
        });
        return {
          code: dp.code,
          name: dp.name,
          scheduled: r.length,
          sections: secCount(r),
          unscheduled: b.length,
          tba: r.filter((x) => !x.proctor_id).length,
          perProgram: Object.entries(pg),
          rows: r,
          bad: b,
        };
      })
      .filter((g) => g.rows.length || g.bad.length);
    try {
      if (format === "csv") {
        await exportTable({
          title: `Exam report: ${name}`,
          filename: file,
          format: "csv",
          rows: sortedByDept,
          columns: [{ label: "Department", get: dcode }, ...CSV].map((c) => ({
            ...c,
            weight: 1,
            get: (x) => String(c.get(x) ?? ""),
          })),
        });
      } else {
        await exportReport(
          {
            period: name,
            semester: SEM[p?.semester || 1] || "",
            range: p ? `${p.start_date} to ${p.end_date}` : "",
            kpis: [
              ["Scheduled sections", String(secCount(ok))],
              ["Unscheduled sections", String(secCount(bad))],
              ["Rooms used", String(perRoom.length)],
              ["Proctors used", String(perProctor.length)],
            ],
            rate,
            scheduled: ok.length,
            unscheduled: bad.length,
            tba,
            perDay,
            perProctor,
            perRoom,
            perProgram,
            insights: {
              day: line(top(perDay), "Busiest day"),
              proctor: line(top(perProctor), "Most assigned"),
              room: line(top(perRoom), "Most used room"),
              program: line(top(perProgram), "Largest program"),
            },
            rows: sorted,
            bad,
            depts: depGroups,
          },
          format,
          file,
        );
      }
      ui.toast.success("Export ready");
    } catch (e) {
      ui.toast.error(e.message);
    }
  };
  const tiles = [
    ["Scheduled sections", secCount(ok), "check", ""],
    ["Unscheduled sections", secCount(bad), "alert", bad.length ? "warn" : ""],
    ["Rooms used", perRoom.length, "door", ""],
    ["Proctors used", perProctor.length, "users", ""],
  ];
  if (all === null)
    return (
      <>
        <div className="grid">
          {[1, 2, 3, 4].map((i) => (
            <div className="tile" key={i}>
              <Skeleton h={36} w={36} />
              <div style={{ flex: 1 }}>
                <Skeleton h={22} w={50} />
                <div style={{ height: 6 }} />
                <Skeleton h={12} w="70%" />
              </div>
            </div>
          ))}
        </div>
        <div className="charts">
          {[1, 2, 3].map((i) => (
            <section className="card" key={i}>
              <Skeleton h={18} w="40%" />
              <div style={{ height: 14 }} />
              <Skeleton h={140} />
            </section>
          ))}
        </div>
      </>
    );
  return (
    <>
      <div className="bar" data-tour="rep-bar">
        <span style={{ flex: 1 }} />
        <select
          name="period"
          value={sel}
          onChange={(e) => setSel(e.target.value)}
        >
          {!periods.length && <option value="">No current exam period</option>}
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <ExportMenu onExport={doExport} disabled={!ok.length} />
      </div>

      <div className="grid" data-tour="rep-tiles">
        {tiles.map(([k, v, icon, tone], i) => (
          <div className={`tile ${tone} ${i === 0 ? "fill" : ""}`} key={k}>
            <span className="ico">
              <Icon name={icon} />
            </span>
            <div>
              <b>
                <CountUp value={v} />
              </b>
              <span>{k}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="two">
        <Card
          title="Placement rate"
          icon="check"
          info="How many of the exam entries in this period were given a room, date and time. Anything not placed is listed at the bottom with the reason."
          insight={
            `${ok.length} of ${rows.length} exam hours were placed (${rate}%).` +
            (tba
              ? ` ${tba} of them still have no proctor (to be announced).`
              : "")
          }
        >
          <Donut
            center={`${rate}%`}
            parts={[
              ["Scheduled", ok.length],
              ["Unscheduled", bad.length],
            ]}
          />
        </Card>
        <Card
          title="Exams per day"
          icon="calendar"
          info="Exam hours placed on each date. Use it to spot overloaded days and to see whether the load is spread evenly across the exam week."
          insight={line(top(perDay), "Busiest day")}
        >
          <AreaChart data={perDay} />
        </Card>
      </div>
      <div className="stack">
        <Card
          title="Proctor workload (top 12)"
          icon="users"
          info="Exam hours assigned to each proctor. A very uneven chart means a few proctors carry most of the work. Hours with no proctor yet are not counted here."
          insight={line(top(perProctor), "Most assigned")}
        >
          <BarChart data={perProctor} />
        </Card>
        <Card
          title="Room usage (top 12)"
          icon="door"
          info="How many exam hours each room hosts. Rooms at the top are used the most; rooms missing from the list were not used in this period."
          insight={line(top(perRoom), "Most used room")}
        >
          <BarChart data={perRoom} />
        </Card>
        <Card
          title="Exams per program"
          icon="layers"
          info="Scheduled exam hours for each program. Bigger bars mean programs with more subjects or more sections."
          insight={line(top(perProgram), "Largest program")}
        >
          <BarChart data={perProgram} limit={20} />
        </Card>
      </div>

      <Card
        title={`Unscheduled (${bad.length})`}
        icon="alert"
        info="Exam entries the generator could not place, and why. Typical fixes: add rooms big enough for the section, add proctors with availability, or widen the exam dates."
        insight={bad.length ? `${bad.length} exam hour(s) need attention.` : ""}
      >
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Program</th>
                <th>Section</th>
                <th>Subject</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {bad.map((x) => (
                <tr key={x.id} className="warn">
                  <td>{x.program?.code}</td>
                  <td>
                    Y{x.section?.year_level} {x.section?.name}
                  </td>
                  <td>{x.subject?.code}</td>
                  <td>{x.reason}</td>
                </tr>
              ))}
              {!bad.length && (
                <tr>
                  <td colSpan={4} className="muted">
                    Everything was placed.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
