import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, t5 } from "../lib/api";
import { Avatar, Badge, Help, Modal, Skeleton, TableSkeleton } from "../components/ui";
import MRow from "../components/MRow";
import { useMobile } from "../lib/useMobile";
import { useMe } from "../lib/me";
import { AreaChart, BarChart, Donut } from "../components/Charts";
import Icon from "../components/icons";
import ReplaceModal from "../components/ReplaceModal";
import { useHashScroll } from "../lib/useHashScroll";
import ProfileView from "../components/ProfileView";
import CountUp from "../components/CountUp";
const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const mins = (t) => {
  const [h, m] = t5(t).split(":").map(Number);
  return h * 60 + m;
};
const short = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
export default function Overview() {
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [month, setMonth] = useState(0);
  const [day, setDay] = useState("");
  const [rep, setRep] = useState("");
  const [pq, setPq] = useState(""); // available proctors search
  const [cq, setCq] = useState(""); // calendar search
  const [view, setView] = useState("");
  const me = useMe();
  const [pf, setPf] = useState("available");
  const mobile = useMobile();
  const [det, setDet] = useState(null);
  const load = async () => {
    try {
      const [sch, rooms, availability, profiles, periods] = await Promise.all([
        api.list("schedules"), api.list("rooms"), api.list("availability"),
        api.list("profiles").catch(() => []), api.list("exam_periods"),
      ]);
      const t = iso(new Date());
      const live = new Set(periods.filter((p) => p.status !== "ended" && p.end_date >= t).map((p) => p.id));
      setD({ schedules: sch.filter((s) => live.has(s.period_id)), rooms, availability, profiles });
    } catch (e) {
      setErr(e.message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  useHashScroll(!!d);
  if (err) return <div className="alert error">{err}</div>;
  if (!d)
    return (
      <>
        <div className="grid">
          {[1, 2, 3, 4].map((i) => (
            <div className="tile" key={i}>
              <Skeleton h={46} w={46} />
              <div style={{ flex: 1 }}>
                <Skeleton h={22} w={50} />
                <div style={{ height: 6 }} />
                <Skeleton h={12} w="70%" />
              </div>
            </div>
          ))}
        </div>
        <div className="two">
          <section className="card">
            <Skeleton h={200} />
          </section>
          <section className="card">
            <Skeleton h={200} />
          </section>
        </div>
        <section className="card">
          <TableSkeleton rows={4} cols={5} />
        </section>
      </>
    );
  const sch = d.schedules;
  const ok = sch.filter((s) => s.status === "scheduled");
  const scheduledHours = ok.length;
  const scheduled = new Set(ok.map((s) => s.section_id)).size;
  const unsched = sch.filter((s) => s.status === "unscheduled").length;
  const rate = sch.length ? Math.round((scheduledHours / sch.length) * 100) : 0;
  const seen = new Set();
  const flagged = sch
    .filter((s) => s.emergency)
    .filter((s) => {
      const k = `${s.section_id}|${s.exam_date}|${s.proctor_id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  // Only dates that have not passed yet. Past availability stays in the proctor's History tab.
  const todayIso = iso(new Date());
  const av = new Map();
  for (const a of d.availability.filter((x) => x.date >= todayIso)) {
    const m = av.get(a.proctor_id) || {
      id: a.proctor_id,
      name: a.proctor?.full_name || "-",
      avatar: a.proctor?.avatar_url,
      dept: a.proctor?.department?.code || "-",
      days: new Set(),
      hours: 0,
      first: a.date,
      last: a.date,
    };
    m.days.add(a.date);
    m.hours += (mins(a.end_time) - mins(a.start_time)) / 60;
    if (a.date < m.first) m.first = a.date;
    if (a.date > m.last) m.last = a.date;
    av.set(a.proctor_id, m);
  }
  const myProctors = d.profiles.filter(
    (p) =>
      p.role === "proctor" &&
      p.status !== "pending" &&
      (me.role === "admin" || p.department_id === me.department_id),
  );
  const assignedIds = new Set(
    myProctors.filter((p) => p.assigned_hours > 0).map((p) => p.id),
  );
  for (const p of myProctors)
    if (assignedIds.has(p.id) && !av.has(p.id))
      av.set(p.id, {
        id: p.id,
        name: p.full_name,
        avatar: p.avatar_url,
        dept: p.department?.code || "-",
        days: new Set(),
        hours: 0,
        first: "",
        last: "",
      });
  const available = [...av.values()]
    .map((p) => ({ ...p, assigned: assignedIds.has(p.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const availCount = available.filter((p) => !p.assigned).length;
  const byDate = {};
  const byProg = {};
  ok.forEach((s) => {
    if (s.exam_date) byDate[s.exam_date] = (byDate[s.exam_date] || 0) + 1;
    const p = s.program?.code || "-";
    byProg[p] = (byProg[p] || 0) + 1;
  });
  const needle = cq.trim().toLowerCase();
  const okF = !needle
    ? ok
    : ok.filter((s) =>
        `${s.program?.code} ${s.section?.year_level}${s.section?.name} ${s.subject?.code} ${s.subject?.title} ${s.room?.name} ${s.proctor?.full_name} ${s.exam_date}`
          .toLowerCase()
          .includes(needle),
      );
  const calByDate = {};
  okF.forEach((s) => {
    if (s.exam_date) calByDate[s.exam_date] = (calByDate[s.exam_date] || 0) + 1;
  });
  const hits =
    needle && !day
      ? [...okF]
          .sort((a, b) =>
            (a.exam_date + a.start_time).localeCompare(
              b.exam_date + b.start_time,
            ),
          )
          .slice(0, 30)
      : [];
  const availShown = available.filter(
    (p) =>
      (pf === "all" || (pf === "assigned") === p.assigned) &&
      (!pq || `${p.name} ${p.dept}`.toLowerCase().includes(pq.toLowerCase())),
  );
  const goto = (id) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  const tiles = [
    ["Scheduled sections", scheduled, "check", "", () => nav("/periods")],
    ["Available proctors", availCount, "users", "", () => goto("available")],
    ["Rooms", d.rooms.length, "door", "", () => nav("/config?tab=Rooms")],
    [
      "Emergency flags",
      flagged.length,
      "flag",
      flagged.length ? "bad" : "good",
      () => goto("emergencies"),
    ],
  ];
  const dayRows = day
    ? okF
        .filter((s) => s.exam_date === day)
        .sort((a, b) => t5(a.start_time).localeCompare(t5(b.start_time)))
    : [];
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + month);
  const first = new Date(base.getFullYear(), base.getMonth(), 1);
  const nDays = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  const cells = [
    ...Array(first.getDay()).fill(null),
    ...Array.from({ length: nDays }, (_, i) => i + 1),
  ];
  return (
    <div className="dash">
      <div className="grid" data-tour="dash-tiles">
        {tiles.map(([k, v, icon, tone, go], i) => (
          <div
            className={`tile click ${tone} ${i === 0 ? "fill" : ""}`}
            key={k}
            role="button"
            tabIndex={0}
            onClick={go}
            onKeyDown={(e) => e.key === "Enter" && go()}
          >
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
        <section className="card epd">
          <div className="card-head">
            <h3>Exams per day</h3>
            <Help
              align="right"
              text="How many exam hours (one subject = one hour) are placed on each date, across all exam periods. A higher point means a busier day."
            />
          </div>
          <AreaChart data={Object.entries(byDate).sort()} />
        </section>
        <section className="card cal" data-tour="dash-cal">
          <div className="bar card-head" style={{ marginBottom: 6 }}>
            <h3 style={{ margin: 0, flex: 1 }}>
              {first.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
              })}
            </h3>
            <button
              className="ghost nav"
              onClick={() => setMonth(month - 1)}
              aria-label="Previous month"
            >
              {"<"}
            </button>
            <button
              className="ghost nav"
              onClick={() => setMonth(month + 1)}
              aria-label="Next month"
            >
              {">"}
            </button>
            <Help
              align="right"
              text="Click a date to see the exams scheduled on it. Dates filled in blue have exams."
            />
          </div>
          <div className="mini">
            {["S", "M", "T", "W", "T", "F", "S"].map((w, i) => (
              <small key={i}>{w}</small>
            ))}
            {cells.map((n, i) => {
              if (!n) return <span key={i} />;
              const k = iso(new Date(first.getFullYear(), first.getMonth(), n));
              const c = calByDate[k] || 0;
              const pick = () => setDay(day === k ? "" : k);
              return (
                <span
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={pick}
                  onKeyDown={(e) => e.key === "Enter" && pick()}
                  className={`mday ${c ? "has" : ""} ${k === todayIso ? "today" : ""} ${k === day ? "sel" : ""}`}
                  title={c ? `${c} exam hours` : ""}
                >
                  {n}
                </span>
              );
            })}
          </div>
          {ok.length > 0 && <input className="searchbox" style={{ marginTop: 12 }} placeholder="Search section, subject, room or proctor" value={cq} onChange={(e) => setCq(e.target.value)} />}
          {!day && !needle && (
            <p className="hint">Click a date to see its exams.</p>
          )}
          {!day && needle && (
            <>
              <h4 className="sechead" style={{ fontSize: 20 }}>
                Results <span className="muted">{okF.length} exam hour(s)</span>
              </h4>
              <div className="scroll" style={{ maxHeight: 260 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Section</th>
                      <th>Subject</th>
                      <th>Room</th>
                      <th>Proctor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hits.map((s) => (
                      <tr key={s.id}>
                        <td>{short(s.exam_date)}</td>
                        <td>
                          {t5(s.start_time)}-{t5(s.end_time)}
                        </td>
                        <td>
                          {s.program?.code} {s.section?.year_level}
                          {s.section?.name}
                        </td>
                        <td>{s.subject?.code}</td>
                        <td>{s.room?.name || "TBA"}</td>
                        <td>{s.proctor?.full_name || "To be announced"}</td>
                      </tr>
                    ))}
                    {!hits.length && (
                      <tr>
                        <td colSpan={6} className="empty">
                          No exams match your search.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {day && (
            <>
              <h4 className="sechead" style={{ fontSize: 20 }}>
                {short(day)}{" "}
                <span className="muted">{dayRows.length} exam hour(s)</span>
              </h4>
              {mobile ? (
                <div className="mlist fitday">
                  {dayRows.map((s) => (
                    <MRow key={s.id}
                      title={`${t5(s.start_time)} · ${s.program?.code} ${s.section?.year_level}${s.section?.name}`}
                      sub={s.subject?.code}
                      onHold={() => setDet({ kind: "exam", s })} />
                  ))}
                  {!dayRows.length && <p className="empty">No exams on this date.</p>}
                  {dayRows.length > 0 && <p className="mobhint">Hold a row for room and proctor</p>}
                </div>
              ) : ( <div className="scroll" style={{ maxHeight: 260 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Section</th>
                      <th>Subject</th>
                      <th>Room</th>
                      <th>Proctor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayRows.map((s) => (
                      <tr key={s.id}>
                        <td>
                          {t5(s.start_time)}-{t5(s.end_time)}
                        </td>
                        <td>
                          {s.program?.code} {s.section?.year_level}
                          {s.section?.name}
                        </td>
                        <td>{s.subject?.code}</td>
                        <td>{s.room?.name || "TBA"}</td>
                        <td>{s.proctor?.full_name || "To be announced"}</td>
                      </tr>
                    ))}
                    {!dayRows.length && (
                      <tr>
                        <td colSpan={5} className="empty">
                          No exams on this date.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div> )}
            </>
          )}
        </section>
      </div>

      <div className="two">
        <section className="card">
          <div className="card-head">
            <h3>Exams per program</h3>
            <Help
              align="right"
              text="Scheduled exam hours for each program. Shows the 8 programs with the most exams."
            />
          </div>
          <BarChart data={Object.entries(byProg)} limit={8} />
        </section>
        <section className="card ctr plc">
          <div className="card-head">
            <h3>Placement rate</h3>
            <Help
              align="right"
              text="The share of all exam entries that were given a room, date and time. Entries that did not fit are 'unscheduled'; see Reports for the reasons."
            />
          </div>
          <Donut
            center={`${rate}%`}
            parts={[
              ["Scheduled", scheduledHours],
              ["Unscheduled", unsched],
            ]}
          />
        </section>
      </div>

      <div className="two">
        <section className="card" id="emergencies" data-tour="dash-emg">
          <div className="card-head">
            <h3>Proctor emergencies</h3>
            <Help
              align="right"
              text="Exams where the assigned proctor reported an emergency. Click 'Find replacement' to pick a proctor who is free for those hours."
            />
          </div>
          {mobile ? (
            <div className="mlist">
              {flagged.map((s) => (
                <MRow key={s.id} danger
                  title={`${s.program?.code} ${s.section?.year_level}${s.section?.name}`}
                  sub={`${short(s.exam_date)} · ${t5(s.start_time)} · ${s.proctor?.full_name || ""}`}
                  onTap={() => setDet({ kind: "emg", s })}
                  onHold={() => setRep(s.id)} />
              ))}
              {!flagged.length && <p className="empty">No emergencies flagged. All good.</p>}
              {flagged.length > 0 && <p className="mobhint">Tap for details · hold to find a replacement</p>}
            </div>
          ) : (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Section</th>
                    <th>Proctor</th>
                    <th>Note</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {flagged.map((s) => (
                    <tr key={s.id} className="danger">
                      <td>{s.exam_date}</td>
                      <td>{t5(s.start_time)}</td>
                      <td>
                        {s.program?.code} Y{s.section?.year_level}
                        {s.section?.name}
                      </td>
                      <td>
                        <span
                          className="who-link"
                          onClick={() => setView(s.proctor_id)}
                        >
                          {s.proctor?.full_name}
                        </span>
                      </td>
                      <td>{s.emergency_note}</td>
                      <td className="actions">
                        <button className="sm" onClick={() => setRep(s.id)}>
                          Find replacement
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!flagged.length && (
                    <tr>
                      <td colSpan={6} className="empty">
                        No emergencies flagged. All good.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card" id="available" data-tour="dash-avail">
          <div className="card-head">
            <h3>Available proctors</h3>
            <Help
              align="right"
              text="Proctors who entered availability and have no upcoming exams. Use the filter to see Assigned proctors (already in a generated schedule) or All."
            />
          </div>
          <div className="bar" style={{ marginBottom: 8 }}>
            <input
              className="searchbox"
              style={{ flex: 1, margin: 0 }}
              placeholder="Search proctor or department"
              value={pq}
              onChange={(e) => setPq(e.target.value)}
            />
            <select value={pf} onChange={(e) => setPf(e.target.value)}>
              <option value="available">Available</option>
              <option value="assigned">Assigned</option>
              <option value="all">All</option>
            </select>
          </div>
          {mobile ? (
            <div className="mlist">
              {availShown.map((p) => (
                <MRow key={p.id}
                  title={p.name}
                  sub={`${p.dept}${p.days.size ? ` · ${p.days.size} day(s)` : ""}`}
                  meta={p.assigned ? "Assigned" : "Available"}
                  onTap={() => setDet({ kind: "proc", p })}
                  onHold={() => setView(p.id)} />
              ))}
              {!availShown.length && <p className="empty">{available.length ? "No proctor matches this filter." : "No proctor has entered availability yet."}</p>}
              {availShown.length > 0 && <p className="mobhint">Tap for details · hold to open profile</p>}
            </div>
          ) : (
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Proctor</th>
                    <th>Dept</th>
                    <th>Dates</th>
                    <th>Days</th>
                    <th>Hours</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {availShown.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div
                          className="who-cell who-link"
                          onClick={() => setView(p.id)}
                        >
                          <Avatar name={p.name} src={p.avatar} />
                          {p.name}
                        </div>
                      </td>
                      <td>{p.dept}</td>
                      <td>
                        {!p.first
                          ? "-"
                          : p.first === p.last
                            ? short(p.first)
                            : `${short(p.first)} - ${short(p.last)}`}
                      </td>
                      <td>{p.days.size}</td>
                      <td>{p.hours}</td>
                      <td>
                        {p.assigned ? (
                          <Badge tone="blue">Assigned</Badge>
                        ) : (
                          <Badge tone="green">Available</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!availShown.length && (
                    <tr>
                      <td colSpan={6} className="empty">
                        {available.length
                          ? "No proctor matches this filter."
                          : "No proctor has entered availability yet."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {view && <ProfileView userId={view} onClose={() => setView("")} />}
      {det && (
        <Modal title={det.kind === "emg" ? "Proctor emergency" : det.kind === "exam" ? "Exam" : "Proctor"} onClose={() => setDet(null)}
          footer={det.kind === "emg"
            ? <><button className="ghost" onClick={() => setDet(null)}>Close</button><button onClick={() => { const id = det.s.id; setDet(null); setRep(id); }}>Find replacement</button></>
            : det.kind === "exam"
            ? <button onClick={() => setDet(null)}>Close</button>
            : <><button className="ghost" onClick={() => setDet(null)}>Close</button><button onClick={() => { const id = det.p.id; setDet(null); setView(id); }}>View profile</button></>}>
          {(det.kind === "emg" ? [
            ["Date", short(det.s.exam_date)], ["Time", `${t5(det.s.start_time)}-${t5(det.s.end_time)}`],
            ["Section", `${det.s.program?.code} Y${det.s.section?.year_level}${det.s.section?.name}`],
            ["Proctor", det.s.proctor?.full_name], ["Note", det.s.emergency_note || "-"],
          ] : det.kind === "exam" ? [
            ["Time", `${t5(det.s.start_time)}-${t5(det.s.end_time)}`],
            ["Section", `${det.s.program?.code} ${det.s.section?.year_level}${det.s.section?.name}`],
            ["Subject", `${det.s.subject?.code} ${det.s.subject?.title || ""}`],
            ["Room", det.s.room?.name || "TBA"], ["Proctor", det.s.proctor?.full_name || "To be announced"],
          ] : [
            ["Name", det.p.name], ["Department", det.p.dept],
            ["Dates", !det.p.first ? "-" : det.p.first === det.p.last ? short(det.p.first) : `${short(det.p.first)} - ${short(det.p.last)}`],
            ["Days", det.p.days.size], ["Hours", det.p.hours], ["Status", det.p.assigned ? "Assigned" : "Available"],
          ]).map(([k, v]) => <div className="drow" key={k}><small>{k}</small><div>{v}</div></div>)}
        </Modal>
      )}
      {rep && (
        <ReplaceModal
          scheduleId={rep}
          onClose={() => setRep("")}
          onDone={load}
        />
      )}
    </div>
  );
}
