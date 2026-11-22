import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Badge, TableSkeleton, useLock, useUi } from "../components/ui";
import { groupBy, groupByPeriod, periodTitle } from "../lib/periods";
import Icon from "../components/icons";
const fmt = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
const closesIn = (iso) => {
  const m = Math.max(
    0,
    Math.round((new Date(iso).getTime() - Date.now()) / 60000),
  );
  return m >= 1440
    ? `in ${Math.floor(m / 1440)}d`
    : m >= 60
      ? `in ${Math.floor(m / 60)}h ${m % 60}m`
      : `in ${m}m`;
};
export default function Requests() {
  const ui = useUi();
  const [locked, guard] = useLock();
  const [rows, setRows] = useState(null);
  const [periods, setPeriods] = useState([]);
  const [busy, setBusy] = useState("");
  const [pf, setPf] = useState("");
  const load = () => {
    api
      .action("requests", {})
      .then((r) => setRows(r))
      .catch((e) => {
        ui.toast.error(e.message);
        setRows([]);
      });
    api
      .list("exam_periods")
      .then((p) =>
        setPeriods(
          p.filter((x) => x.status !== "ended" && x.status !== "draft"),
        ),
      )
      .catch(() => {});
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  const take = guard(async (list, title, message) => {
    const ok = await ui.confirm({ title, message, confirmLabel: "Accept" });
    if (!ok) return;
    const key = list.map((x) => x.id).join();
    setBusy(key);
    try {
      const r = await api.action("accept", {
        schedule_ids: list.map((x) => x.id),
      });
      ui.toast.success(
        r.skipped
          ? `${r.accepted} accepted, ${r.skipped} skipped.`
          : "Accepted. It is now in My schedule.",
      );
    } catch (e) {
      ui.toast.error(e.message);
    }
    setBusy("");
    load();
  });
  const pfv = periods.some((p) => p.id === pf) ? pf : "";
  const selected = periods.find((p) => p.id === pfv);
  const shown = (rows || []).filter((r) => !pfv || r.period_id === pfv);
  const groups = groupByPeriod(
    shown,
    [],
    (r) => r.exam_date,
    (r) => r.period,
  );
  const openCount = (id) =>
    (rows || []).filter((r) => r.period_id === id && r.can_accept).length;
  const hoursOf = (p) => p?.accept_cutoff_hours ?? 1;
  return (
    <>
      <section className="tipcard">
        <span className="tipico">
          <Icon name="flag" />
        </span>
        <p>
          Sections still without a proctor, from every ongoing exam period. Each
          period has its own limit for how many hours before an exam you can
          still accept. You stay with one section (one room) per day, so take
          all days of a section to keep the same room.
        </p>
      </section>
      {rows !== null && periods.length > 0 && (
        <div className="tabs">
          <button className={!pfv ? "on" : ""} onClick={() => setPf("")}>
            All periods
          </button>
          {periods.map((p) => (
            <button
              key={p.id}
              className={pfv === p.id ? "on" : ""}
              onClick={() => setPf(p.id)}
            >
              {p.name} · {openCount(p.id)}
            </button>
          ))}
        </div>
      )}
      {selected && (
        <p className="muted" style={{ margin: "-6px 4px 14px" }}>
          {selected.name}: you can accept until{" "}
          {hoursOf(selected) === 0
            ? "the exam starts"
            : `${hoursOf(selected)} hour${hoursOf(selected) === 1 ? "" : "s"} before it starts`}
          .
        </p>
      )}
      {rows === null ? (
        <section className="card">
          <TableSkeleton rows={5} cols={4} />
        </section>
      ) : (
        <>
          {groups.map((g) => (
            <details className="prog" key={g.key} open>
              <summary>
                <span className="pname">{periodTitle(g.period)}</span>
                <span className="chev" />
              </summary>
              <div className="yeargrid">
                {groupBy(g.rows, (r) => r.section_id).map((days) => {
                  const f = days[0];
                  const ok = days.filter((d) => d.can_accept);
                  return (
                    <div className="yearcard" key={f.section_id + g.key}>
                      <div className="yc-head">
                        <div>
                          <small>
                            {days.length} open day{days.length === 1 ? "" : "s"}
                          </small>
                          <h4>{f.section}</h4>
                        </div>
                      </div>
                      <ul className="daylist">
                        {days.map((r) => (
                          <li key={r.id}>
                            <div className="dl-top">
                              <strong>{fmt(r.exam_date)}</strong>
                              <time>
                                {r.start}-{r.end}
                              </time>
                              <span className="muted">Room {r.room}</span>
                              <span className="muted">
                                · closes {closesIn(r.closes_at)}
                              </span>
                            </div>
                            <div className="muted">{r.subjects}</div>
                            {r.can_accept ? (
                              <button
                                className="sm"
                                disabled={!!busy || locked}
                                aria-busy={locked}
                                onClick={() =>
                                  take(
                                    [r],
                                    "Take this day?",
                                    `You will proctor ${r.section} on ${fmt(r.exam_date)}, ${r.start}-${r.end}, room ${r.room}.`,
                                  )
                                }
                              >
                                Accept this day
                              </button>
                            ) : (
                              <Badge tone="amber">{r.reason}</Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                      {ok.length > 1 && (
                        <button
                          disabled={!!busy || locked}
                          aria-busy={locked}
                          onClick={() =>
                            take(
                              ok,
                              "Take all available days?",
                              `You will proctor ${f.section} on ${ok.length} days. You keep the same section and room for the whole exam period.`,
                            )
                          }
                        >
                          {busy
                            ? "Saving…"
                            : `Take all ${ok.length} available days`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
          {!groups.length && (
            <section className="card">
              <p className="muted" style={{ margin: 0 }}>
                {selected
                  ? `No open assignments in ${selected.name} right now. Every section has a proctor, or the accept time has passed.`
                  : "No open assignments. Every section has a proctor."}
              </p>
            </section>
          )}
        </>
      )}
    </>
  );
}
