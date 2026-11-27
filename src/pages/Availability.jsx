import { useEffect, useMemo, useState } from "react";
import { Badge, useLock, useUi } from "../components/ui";
import Icon from "../components/icons";
import CountUp from "../components/CountUp";
import { api, t5 } from "../lib/api";
import { groupByPeriod, periodTitle, todayIso } from "../lib/periods";
const fmt = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
const mins = (t) => {
  const [h, m] = t5(t).split(":").map(Number);
  return h * 60 + m;
};
const range = (a, b) => {
  const out = [];
  for (
    const d = new Date(a + "T00:00:00Z");
    d <= new Date(b + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1)
  )
    out.push(d.toISOString().slice(0, 10));
  return out;
};
const PRESETS = [
  { id: "am", label: "Morning", sub: "8:00 AM – 12:00 PM", w: [["08:00", "12:00"]] },
  { id: "pm", label: "Afternoon", sub: "12:00 PM – 7:00 PM", w: [["12:00", "19:00"]] },
  { id: "day", label: "Whole day", sub: "8:00 AM – 7:00 PM", w: [["08:00", "19:00"]] },
  { id: "custom", label: "Custom", sub: "Pick your own hours", w: [] },
];
export default function Availability() {
  const ui = useUi();
  const [locked, guard] = useLock();
  const [periods, setPeriods] = useState(null);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState("current");
  const [pid, setPid] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [preset, setPreset] = useState("day");
  const [from, setFrom] = useState("08:00");
  const [until, setUntil] = useState("12:00");
  const [busy, setBusy] = useState(false);
  const loadRows = () =>
    api
      .list("availability")
      .then(setRows)
      .catch(() => {});
  useEffect(() => {
    api
      .list("exam_periods")
      .then(setPeriods)
      .catch(() => setPeriods([]));
    loadRows();
  }, []);
  const today = todayIso();
  const open = useMemo(
    () =>
      (periods || [])
        .filter((p) => p.start_date > today)
        .sort((a, b) => a.start_date.localeCompare(b.start_date)),
    [periods, today],
  );
  useEffect(() => {
    if (open.length && !open.find((p) => p.id === pid)) {
      setPid(open[0].id);
      setPicked(new Set());
    }
  }, [open]);
  const groups = useMemo(
    () =>
      groupByPeriod(
        rows.filter((r) => r.date < today),
        periods || [],
        (r) => r.date,
      ),
    [rows, periods, today],
  );
  if (periods === null) return null;
  const period = open.find((p) => p.id === pid);
  const days = period ? range(period.start_date, period.end_date) : [];
  const mine = period
    ? rows.filter(
        (r) => r.date >= period.start_date && r.date <= period.end_date,
      )
    : [];
  const covered = new Set(mine.map((r) => r.date));
  const hours = mine.reduce(
    (s, r) => s + (mins(r.end_time) - mins(r.start_time)) / 60,
    0,
  );
  const left = period
    ? Math.round(
        (new Date(period.start_date + "T00:00:00").getTime() -
          new Date(today + "T00:00:00").getTime()) /
          864e5,
      )
    : 0;
  const byDate = {};
  [...mine]
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
    .forEach((r) => {
      (byDate[r.date] ||= []).push(r);
    });
  const toggle = (d) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(d) ? n.delete(d) : n.add(d);
      return n;
    });
  const add = guard(async () => {
    const wins =
      preset === "custom"
        ? [[from, until]]
        : PRESETS.find((p) => p.id === preset).w;
    if (!picked.size) return ui.toast.error("Pick at least one day");
    if (preset === "custom" && until <= from)
      return ui.toast.error("The end time must be after the start time");
    const jobs = [];
    [...picked].sort().forEach((date) =>
      wins.forEach(([s, e]) => {
        if (
          !rows.some(
            (r) =>
              r.date === date && t5(r.start_time) === s && t5(r.end_time) === e,
          )
        )
          jobs.push({ date, start_time: s, end_time: e });
      }),
    );
    if (!jobs.length) return ui.toast.info("You already added those hours");
    setBusy(true);
    let ok = 0,
      msg = "";
    for (let i = 0; i < jobs.length; i += 5) {
      const res = await Promise.allSettled(
        jobs.slice(i, i + 5).map((j) => api.create("availability", j)),
      );
      res.forEach((r) => {
        if (r.status === "fulfilled") ok++;
        else msg = r.reason.message;
      });
    }
    setBusy(false);
    if (msg) ui.toast.error(`${ok} added. ${msg}`);
    else ui.toast.success(`${ok} time window${ok === 1 ? "" : "s"} added`);
    setPicked(new Set());
    loadRows();
  });
  const remove = guard(async (id) => {
    try {
      await api.remove("availability", id);
      loadRows();
    } catch (e) {
      ui.toast.error(e.message);
    }
  });
  const current = () => {
    if (!open.length)
      return (
        <section className="card tipcard">
          <span className="tipico">
            <Icon name="clock" />
          </span>
          <p>
            No exam period is open for availability right now. You can add
            availability only before a period starts. You can still accept open
            assignments from <b>Assignment requests</b>.
          </p>
        </section>
      );
    return (
      <>
        {open.length > 1 && (
          <div className="tabs">
            {open.map((p) => (
              <button
                key={p.id}
                className={p.id === pid ? "on" : ""}
                onClick={() => {
                  setPid(p.id);
                  setPicked(new Set());
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
        {period && (
          <section className="phero">
            <div>
              <small>Open for availability</small>
              <h3>{period.name}</h3>
              <p>
                {fmt(period.start_date)} to {fmt(period.end_date)}
              </p>
              <span className="countpill">
                {left === 1 ? "Locks tomorrow" : `Locks in ${left} days`}
              </span>
              <div className="progbar">
                <i
                  style={{
                    width: `${days.length ? (covered.size / days.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
            <div className="pstats">
              <div>
                <b>
                  <CountUp value={covered.size} />/{days.length}
                </b>
                <span>Days covered</span>
              </div>
              <div>
                <b>
                  <CountUp value={hours} />
                </b>
                <span>Hours offered</span>
              </div>
            </div>
          </section>
        )}

        <section className="card">
          <div className="card-head">
            <h3>1 · Pick your days</h3>
            <div className="row">
              <button
                className="ghost sm"
                onClick={() => setPicked(new Set(days))}
              >
                All days
              </button>
              <button className="ghost sm" onClick={() => setPicked(new Set())}>
                Clear
              </button>
            </div>
          </div>
          <div className="daychips">
            {days.map((d) => {
              const dt = new Date(d + "T00:00:00");
              return (
                <button
                  key={d}
                  type="button"
                  className={`dchipbtn ${picked.has(d) ? "on" : ""} ${covered.has(d) ? "done" : ""}`}
                  onClick={() => toggle(d)}
                >
                  <small>
                    {dt.toLocaleDateString("en-PH", { weekday: "short" })}
                  </small>
                  <b>{dt.getDate()}</b>
                  <small>
                    {dt.toLocaleDateString("en-PH", { month: "short" })}
                  </small>
                  {covered.has(d) && <i className="tick">✓</i>}
                </button>
              );
            })}
          </div>

          <div className="card-head" style={{ marginTop: 22 }}>
            <h3>2 · Choose your hours</h3>
          </div>
          <div className="presets">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`preset ${preset === p.id ? "on" : ""}`}
                onClick={() => setPreset(p.id)}
              >
                <b>{p.label}</b>
                <span>{p.sub}</span>
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="fields" style={{ marginTop: 12, maxWidth: 420 }}>
              <label>
                <span>From</span>
                <input
                  type="time"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label>
                <span>Until</span>
                <input
                  type="time"
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </label>
            </div>
          )}
          <div className="row" style={{ marginTop: 18 }}>
            <button
              disabled={busy || locked || !picked.size}
              aria-busy={locked}
              onClick={add}
            >
              {busy
                ? "Saving…"
                : picked.size
                  ? `Add to ${picked.size} day${picked.size === 1 ? "" : "s"}`
                  : "Add availability"}
            </button>
            <span className="muted">
              If you add nothing, you won’t be scheduled automatically, but you
              can still accept open assignments until the cutoff before they
              start.
            </span>
          </div>
        </section>

        <section className="card">
          <div className="card-head">
            <h3>Your availability</h3>
            <Badge>
              {covered.size} day{covered.size === 1 ? "" : "s"}
            </Badge>
          </div>
          {!covered.size ? (
            <p className="muted" style={{ margin: 0 }}>
              Nothing added yet. Pick days above to get started.
            </p>
          ) : (
            <div className="availgrid">
              {Object.keys(byDate)
                .sort()
                .map((d) => (
                  <div className="availday" key={d}>
                    <strong>{fmt(d)}</strong>
                    <div className="chips" style={{ marginBottom: 0 }}>
                      {byDate[d].map((r) => (
                        <span className="winchip" key={r.id}>
                          {t5(r.start_time)}-{t5(r.end_time)}
                          <button
                            type="button"
                            aria-label="Remove"
                            disabled={locked}
                            aria-busy={locked}
                            onClick={() => remove(r.id)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
      </>
    );
  };
  const history = () => (
    <>
      {groups.map((g) => {
        const dd = {};
        [...g.rows]
          .sort((a, b) =>
            String(a.start_time).localeCompare(String(b.start_time)),
          )
          .forEach((r) => {
            (dd[r.date] ||= []).push(`${t5(r.start_time)}-${t5(r.end_time)}`);
          });
        const dates = Object.keys(dd).sort();
        return (
          <section className="card" key={g.key}>
            <div className="card-head">
              <h3>{periodTitle(g.period)}</h3>
              <Badge>
                {dates.length} day{dates.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="scroll">
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
                      <td>{dd[d].join(", ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      {!groups.length && (
        <section className="card">
          <p className="muted" style={{ margin: 0 }}>
            Nothing here yet. Availability moves here once its date has passed.
          </p>
        </section>
      )}
    </>
  );
  return (
    <>
      <div className="tabs">
        <button className={tab === "current" ? "on" : ""} onClick={() => setTab("current")}>
          <Icon name="calendar" size={16} /><span>Upcoming</span>
        </button>
        <button className={tab === "history" ? "on" : ""} onClick={() => setTab("history")}>
          <Icon name="archive" size={16} /><span>History</span>
        </button>
      </div>
      {tab === "current" ? current() : history()}
    </>
  );
}
