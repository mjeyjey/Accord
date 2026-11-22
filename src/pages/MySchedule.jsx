import { useEffect, useState } from "react";
import { api, floorLabel, t5 } from "../lib/api";
import { Badge, TableSkeleton, useLock, useUi } from "../components/ui";
import { groupBy, groupByPeriod, periodTitle, todayIso } from "../lib/periods";
import { useHashScroll } from "../lib/useHashScroll";
import CountUp from "../components/CountUp";
import PeriodTabs from "../components/PeriodTabs";
const fmt = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
function SectionCard({ days, history, onFlag, disabled }) {
  const f = days[0][0];
  const sameRoom =
    new Set(days.map((g) => g[0].room?.name || "")).size === 1 && !!f.room;
  const emerg = days.some((g) => g[0].emergency);
  return (
    <div className={`yearcard ${emerg ? "issue hot" : ""}`}>
      <div className="yc-head">
        <div>
          <small>{f.section?.student_count} students</small>
          <h4>
            {f.program?.code} {f.section?.year_level}
            {f.section?.name}
          </h4>
        </div>
        <Badge>
          {days.length} day{days.length === 1 ? "" : "s"}
        </Badge>
      </div>
      {sameRoom && (
        <div className="yc-meta">
          Room {f.room.name} · {floorLabel(f.room.floor)} (all days)
        </div>
      )}
      <ul className="daylist">
        {days.map((g) => {
          const a = g[0],
            z = g[g.length - 1];
          return (
            <li key={a.id}>
              <div className="dl-top">
                <strong>{fmt(a.exam_date)}</strong>
                <time>
                  {t5(a.start_time)}-{t5(z.end_time)}
                </time>
                {!sameRoom && a.room && (
                  <span className="muted">
                    Room {a.room.name}, {floorLabel(a.room.floor)}
                  </span>
                )}
              </div>
              <div className="chips" style={{ marginBottom: 0 }}>
                {g.map((r) => (
                  <span className="dchip" key={r.id}>
                    {r.subject?.code}
                  </span>
                ))}
              </div>
              {!history &&
                (a.emergency ? (
                  <Badge tone="red">Flagged, waiting for a replacement</Badge>
                ) : (
                  <button
                    className="ghost red sm"
                    disabled={disabled}
                    aria-busy={disabled}
                    onClick={() => onFlag(a)}
                  >
                    Flag emergency
                  </button>
                ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
export default function MySchedule() {
  const ui = useUi();
  const [locked, guard] = useLock();
  const [rows, setRows] = useState(null);
  const [tab, setTab] = useState("up");
  const [pf, setPf] = useState("");
  const load = () =>
    api
      .list("schedules")
      .then(setRows)
      .catch((e) => {
        ui.toast.error(e.message);
        setRows([]);
      });
  useEffect(() => {
    load();
  }, []);
  useHashScroll(rows !== null);
  const today = todayIso();
  // One block per section, day and room: all back-to-back subjects of that day.
  const blocks = {};
  (rows || [])
    .filter((r) => r.status === "scheduled" && r.exam_date)
    .forEach((r) => {
      (blocks[`${r.exam_date}|${r.section_id}|${r.room_id}`] ||= []).push(r);
    });
  const all = Object.values(blocks).sort((a, b) =>
    (a[0].exam_date + a[0].start_time).localeCompare(
      b[0].exam_date + b[0].start_time,
    ),
  );
  const shown = all.filter((g) =>
    tab === "up" ? g[0].exam_date >= today : g[0].exam_date < today,
  );
  const groups = groupByPeriod(
    shown,
    [],
    (g) => g[0].exam_date,
    (g) => g[0].period,
  );
  const pfv = groups.some((g) => g.key === pf) ? pf : "";
  const upcoming = all.filter((g) => g[0].exam_date >= today);
  const next = upcoming[0];
  const daysAway = next
    ? Math.round(
        (new Date(next[0].exam_date + "T00:00:00").getTime() -
          new Date(today + "T00:00:00").getTime()) /
          864e5,
      )
    : 0;
  const flag = guard(async (r) => {
    const note = await ui.prompt({
      title: "Flag an emergency",
      message:
        "The admin and your department head will see this and find a replacement for you.",
      label: "What is the emergency?",
      placeholder: "Example: I am sick and cannot proctor.",
      confirmLabel: "Send",
      required: true,
    });
    if (note === null) return;
    try {
      await api.action("emergency", { schedule_id: r.id, note });
      ui.toast.success("Emergency sent. A replacement will be arranged.");
      load();
    } catch (e) {
      ui.toast.error(e.message);
    }
  });
  return (
    <>
      <div className="tabs">
        <button
          className={tab === "up" ? "on" : ""}
          onClick={() => setTab("up")}
        >
          Upcoming
        </button>
        <button
          className={tab === "past" ? "on" : ""}
          onClick={() => setTab("past")}
        >
          History
        </button>
      </div>
      {rows !== null &&
        tab === "up" &&
        next &&
        (() => {
          const f = next[0],
            z = next[next.length - 1];
          return (
            <section className="phero">
              <div>
                <small>Next exam</small>
                <h3>
                  {f.program?.code} {f.section?.year_level}
                  {f.section?.name}
                </h3>
                <p>
                  {fmt(f.exam_date)} · {t5(f.start_time)}-{t5(z.end_time)}
                  {f.room ? ` · Room ${f.room.name}` : ""}
                </p>
                <span className="countpill">
                  {daysAway === 0
                    ? "Today"
                    : daysAway === 1
                      ? "Tomorrow"
                      : `In ${daysAway} days`}
                </span>
              </div>
              <div className="pstats">
                <div>
                  <b>
                    <CountUp
                      value={new Set(upcoming.map((g) => g[0].section_id)).size}
                    />
                  </b>
                  <span>Sections</span>
                </div>
                <div>
                  <b>
                    <CountUp
                      value={new Set(upcoming.map((g) => g[0].exam_date)).size}
                    />
                  </b>
                  <span>Exam days</span>
                </div>
                <div>
                  <b>
                    <CountUp
                      value={upcoming.reduce((s, g) => s + g.length, 0)}
                    />
                  </b>
                  <span>Exam hours</span>
                </div>
              </div>
            </section>
          );
        })()}
      {rows === null ? (
        <section className="card">
          <TableSkeleton rows={5} cols={4} />
        </section>
      ) : (
        <>
          <PeriodTabs groups={groups} value={pfv} onChange={setPf} />
          {groups
            .filter((g) => !pfv || g.key === pfv)
            .map((g) => {
              const secs = groupBy(g.rows, (d) => d[0].section_id);
              return (
                <details className="prog" key={g.key} open>
                  <summary>
                    <span className="pname">{periodTitle(g.period)}</span>
                    <span className="muted">
                      {secs.length} section{secs.length === 1 ? "" : "s"}
                    </span>
                    <span className="chev" />
                  </summary>
                  <div className="yeargrid">
                    {secs.map((days) => (
                      <SectionCard
                        key={days[0][0].id}
                        days={days}
                        history={tab === "past"}
                        disabled={locked}
                        onFlag={flag}
                      />
                    ))}
                  </div>
                </details>
              );
            })}
          {!groups.length && (
            <section className="card">
              <p className="muted" style={{ margin: 0 }}>
                {tab === "up"
                  ? "No upcoming exams assigned to you yet."
                  : "No past exams yet."}
              </p>
            </section>
          )}
        </>
      )}
    </>
  );
}
