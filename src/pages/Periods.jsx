import { Fragment, useEffect, useMemo, useState } from "react";
import { api, floorLabel, t5 } from "../lib/api";
import { useMe } from "../lib/me";
import {
  Badge,
  Field,
  Modal,
  Skeleton,
  useLock,
  useUi,
} from "../components/ui";
import Icon from "../components/icons";
import { exportYearLevel, exportPngPerProgram } from "../lib/exportSchedule";
import ReplaceModal from "../components/ReplaceModal";
import { useNavigate, useSearchParams } from "react-router-dom";
import ExportMenu from "../components/ExportMenu";
import { exportTable } from "../lib/exportTable";
import EditBlockModal from "../components/EditBlockModal";
import ResolveUnplacedModal from "../components/ResolveUnplacedModal";
import CountUp from "../components/CountUp";
const fmt = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
const fmtShort = (d) =>
  new Date(d + "T00:00:00").toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
const secLabel = (r) =>
  `${r.program?.code} ${r.section?.year_level}${r.section?.name}`;
const SEM = ["", "1st semester", "2nd semester", "Summer"];
const BLANK = {
  name: "",
  start_date: "",
  end_date: "",
  days_per_year: 2,
  semester: 1,
  program_ids: [],
};
const datesOf = (y) => [...new Set(y.rows.map((r) => r.exam_date))].sort();
const CUTOFF_CHOICES = [0, 1, 2, 3, 6, 12, 24, 48, 72];
const HINT = "Download a year level for students: PDF is best for printing, PNG is best for sharing on a phone.";
export default function Periods() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const me = useMe();
  const ui = useUi();
  const [locked, guard] = useLock();
  const [periods, setPeriods] = useState([]);
  const [progs, setProgs] = useState([]);
  const [deps, setDeps] = useState([]);
  const [sched, setSched] = useState(null);
  const [sel, setSel] = useState("");
  const [fp, setFp] = useState("");
  const [q, setQ] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [onlyPending, setOnlyPending] = useState(false);
  const [onlyUnplaced, setOnlyUnplaced] = useState(false);
  const [allOpen, setAllOpen] = useState(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [editId, setEditId] = useState("");
  const [form, setForm] = useState({ ...BLANK });
  const [ferr, setFerr] = useState({});
  const [openYear, setOpenYear] = useState("");
  const [editBlock, setEditBlock] = useState(null);
  const [resolve, setResolve] = useState(null);
  const [rep, setRep] = useState("");
  const [info, setInfo] = useState(false);
  const loadSched = () =>
    api
      .list("schedules")
      .then(setSched)
      .catch((e) => {
        ui.toast.error(e.message);
        setSched([]);
      });
  const loadAll = async () => {
    const [p, pr, de] = await Promise.all([
      api.list("exam_periods"),
      api.list("programs"),
      api.list("departments"),
    ]);
    const active = p.filter((x) => x.status !== "ended");
    setPeriods(active);
    setProgs(
      me.role === "head"
        ? pr.filter((x) => x.department_id === me.department_id)
        : pr,
    );
    setDeps(de);
    return active;
  };
  useEffect(() => {
    loadAll()
      .then((p) => setSel((cur) => cur || p[0]?.id || ""))
      .catch((e) => ui.toast.error(e.message));
    loadSched();
  }, []);
  useEffect(() => {
    const pid = sp.get("period"),
      f = sp.get("filter");
    if (pid) setSel(pid);
    if (f) {
      setOnlyPending(f === "pending");
      setOnlyUnplaced(f === "unplaced");
      setOnlyIssues(f === "issues");
      setAllOpen(true);
      setTick((t) => t + 1);
    }
  }, [sp]);
  const resetOpen = () => {
    setAllOpen(null);
    setTick((t) => t + 1);
  };
  const toggle = (id) => {
    setForm((f) => ({
      ...f,
      program_ids: f.program_ids.includes(id)
        ? f.program_ids.filter((x) => x !== id)
        : [...f.program_ids, id],
    }));
    setFerr((e) => ({ ...e, program_ids: "" }));
  };
  const setF = (k, v) => {
    setForm({ ...form, [k]: v });
    setFerr({ ...ferr, [k]: "" });
  };
  const openNew = () => {
    setEditId("");
    setForm({ ...BLANK });
    setFerr({});
    setShowNew(true);
  };
  const openEdit = () => {
    setEditId(sel);
    setForm({ name: period.name, start_date: period.start_date, end_date: period.end_date, days_per_year: period.days_per_year, semester: period.semester,
      program_ids: (period.program_ids || []).filter((id) => progs.some((p) => p.id === id)) });
    setFerr({}); setShowNew(true);
  };
  const create = guard(async (e) => {
    e.preventDefault();
    const er = {};
    if (!form.name.trim()) er.name = "Give the period a name";
    if (!form.start_date) er.start_date = "Pick a start date";
    if (!form.end_date) er.end_date = "Pick an end date";
    else if (form.start_date && form.end_date < form.start_date)
      er.end_date = "The end date is before the start date";
    if (!(form.days_per_year >= 1)) er.days_per_year = "Use at least 1 day";
    if (!form.program_ids.length)
      er.program_ids = "Select at least one program";
    setFerr(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      if (editId) {
        const mine = new Set(progs.map((p) => p.id));
        const keep = (period?.program_ids || []).filter((id) => !mine.has(id));
        await api.update("exam_periods", editId, { ...form, program_ids: [...keep, ...form.program_ids] });
        await loadAll(); setShowNew(false);
        ui.toast.success("Exam period updated. Regenerate the schedule to apply date or exam-day changes.");
      } else {
        const row = await api.create("exam_periods", form);
        await loadAll(); setSel(row.id); setShowNew(false);
        ui.toast.success("Exam period created. You can generate the schedule now.");
      }
    } catch (e) {
      setFerr({ form: e.message });
    }
    setSaving(false);
  });
  const period = periods.find((p) => p.id === sel);
  const deptOk = me.role === "head" && (period?.dept_approvals || []).includes(me.department_id);
  const approved = period?.status === "approved" || deptOk;
  const generate = guard(async () => {
    const ok = await ui.confirm({
      title:
        period?.status === "draft"
          ? "Generate schedule?"
          : "Regenerate schedule?",
      message:
        "This replaces any existing schedule for your programs in this period." +
        (period?.status === "approved"
          ? " The approval will be removed and the schedule must be approved again."
          : ""),
      confirmLabel: "Generate",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const s = await api.action("generate", { period_id: sel });
      ui.toast.success(
        `${s.sections} sections scheduled` +
          (s.unplacedSections ? `, ${s.unplacedSections} could not be fully placed` : "") +
          (s.tbaSections
            ? `. ${s.tbaSections} section(s) have no proctor yet (proctors were notified).`
            : "."),
      );
      await loadAll();
      await loadSched();
    } catch (e) {
      ui.toast.error(e.message);
    }
    setBusy(false);
  });
  const removePeriod = guard(async () => {
    const ok = await ui.confirm({
      title: "Move this exam period to Trash?",
      message:
        "Its saved schedules will move with it. Restore from History within 30 days.",
      confirmLabel: "Move to Trash",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.remove("exam_periods", sel);
      ui.toast.success("Exam period moved to Trash");
    } catch (e) {
      ui.toast.error(e.message);
    }
    const p = await loadAll();
    setSel(p[0]?.id || "");
    loadSched();
  });
  const setCutoff = guard(async (hours) => {
    try {
      await api.update("exam_periods", sel, { accept_cutoff_hours: hours });
      ui.toast.success(
        hours
          ? `Proctors can accept until ${hours} hour${hours === 1 ? "" : "s"} before the exam`
          : "Proctors can accept until the exam starts",
      );
      await loadAll();
    } catch (e) {
      ui.toast.error(e.message);
    }
  });
  const review = guard(async (decision) => {
    const list = (sched || []).filter((x) => x.period_id === sel);
    const unplaced = list.filter((x) => x.status === "unscheduled").length;
    const pending = list.filter(
      (x) => x.status === "scheduled" && (!x.proctor_id || !x.room_id),
    ).length;
    const warn =
      decision === "approve" && (unplaced || pending)
        ? ` Note: ${unplaced} exam hour(s) are not placed and ${pending} still wait for a proctor or room.`
        : "";
    const ok = await ui.confirm({
      title:
        decision === "approve" ? "Approve this schedule?" : "Revoke approval?",
      message:
        (decision === "approve"
          ? "Department heads will be notified that it is approved."
          : "The schedule goes back to pending approval.") + warn,
      confirmLabel: decision === "approve" ? "Approve" : "Revoke approval",
      danger: decision === "revoke",
    });
    if (!ok) return;
    try {
      await api.action("review_period", { period_id: sel, decision });
      ui.toast.success(
        decision === "approve" ? "Schedule approved" : "Approval revoked",
      );
      await loadAll();
    } catch (e) {
      ui.toast.error(e.message);
    }
  });
  const doExport = guard(async (y, format) => {
    setExporting(`${y.key}|${format}`);
    try {
      await exportYearLevel(
        y.rows,
        {
          program: y.prog,
          year: y.year,
          period: period?.name || "Exam period",
          start: period?.start_date,
          end: period?.end_date,
        },
        format,
      );
      ui.toast.success(
        `${y.prog} Year ${y.year} saved as ${format.toUpperCase()}`,
      );
    } catch (e) {
      ui.toast.error(e?.message || "Could not create the file");
    }
    setExporting("");
  });
  const rowKey = (r) =>
    `${r.program?.code}|${r.section?.year_level}|${r.section?.name}|${r.exam_date}|${t5(r.start_time)}`;
  const csvCols = [
    { label: "Program", weight: 1, get: (r) => r.program?.code || "" },
    {
      label: "Year",
      weight: 1,
      get: (r) => String(r.section?.year_level ?? ""),
    },
    { label: "Section", weight: 1, get: (r) => r.section?.name || "" },
    { label: "Date", weight: 1, get: (r) => r.exam_date || "" },
    { label: "Start", weight: 1, get: (r) => t5(r.start_time) },
    { label: "End", weight: 1, get: (r) => t5(r.end_time) },
    { label: "Subject code", weight: 1, get: (r) => r.subject?.code || "" },
    { label: "Subject", weight: 1, get: (r) => r.subject?.title || "" },
    { label: "Room", weight: 1, get: (r) => r.room?.name || "" },
    { label: "Floor", weight: 1, get: (r) => r.room?.floor || "" },
    {
      label: "Proctor",
      weight: 1,
      get: (r) => r.proctor?.full_name || "To be announced",
    },
  ];
  // Export many year levels at once (a whole department group, or everything).
  const doExportMany = guard(async (list, format, label) => {
    const rows = list.flatMap((y) => y.rows);
    const file = `ExamSchedule_${label}`.replace(/[^\w-]+/g, "_");
    const meta = {
      program: label,
      subtitle: `${label} · all year levels`,
      file,
      period: period?.name || "Exam period",
      start: period?.start_date,
      end: period?.end_date,
      headings: true,
    };
    try {
      const sorted = [...rows].sort((a, b) =>
        rowKey(a).localeCompare(rowKey(b), undefined, { numeric: true }),
      );
      if (format === "csv")
        await exportTable({
          title: label,
          filename: file,
          format,
          rows: sorted,
          columns: csvCols,
        });
      else if (format === "png") await exportPngPerProgram(sorted, meta, file);
      else await exportYearLevel(sorted, meta, format);
      ui.toast.success(`${label} saved as ${format.toUpperCase()}`);
    } catch (e) {
      ui.toast.error(e?.message || "Could not create the file");
    }
  });
  const closeDetail = () => {
    setOpenYear("");
    setEditBlock(null);
  };
  // One entry per program + year level; "secs" holds its sections, each with day blocks (one room, one proctor each).
  const years = useMemo(() => {
    const m = {};
    for (const r of (sched || []).filter(
      (x) => x.period_id === sel && (!fp || x.program_id === fp),
    )) {
      const yl = r.section?.year_level;
      const k = `${r.program_id}|${yl}`;
      const y = (m[k] ||= {
        key: k,
        prog: r.program?.code || "-",
        deptId: r.program?.department_id || "x",
        year: yl,
        secs: {},
        rows: [],
        count: 0,
        bad: 0,
        pend: 0,
        emerg: false,
      });
      const s = (y.secs[r.section_id] ||= {
        id: r.section_id,
        label: secLabel(r),
        students: r.section?.student_count,
        ok: {},
        bad: [],
      });
      if (r.status === "scheduled") {
        (s.ok[`${r.exam_date}|${r.proctor_id}|${r.room_id}`] ||= []).push(r);
        y.rows.push(r);
        y.count++;
        if (!r.proctor_id || !r.room_id) y.pend++;
        if (r.emergency) y.emerg = true;
      } else {
        s.bad.push(r);
        y.bad++;
      }
    }
    return Object.values(m).sort((a, b) =>
      `${a.prog}|${a.year}`.localeCompare(`${b.prog}|${b.year}`, undefined, {
        numeric: true,
      }),
    );
  }, [sched, sel, fp]);
  const ql = q.toLowerCase();
  const shown = years.filter(
    (y) =>
      (!q ||
        `${y.prog} year ${y.year}`.toLowerCase().includes(ql) ||
        Object.values(y.secs).some((s) =>
          s.label.toLowerCase().includes(ql),
        )) &&
      (!onlyIssues || y.bad || y.emerg) &&
      (!onlyPending || y.pend) &&
      (!onlyUnplaced || y.bad),
  );
  const byDept = shown.reduce((m, y) => {
    (m[y.deptId] ||= []).push(y);
    return m;
  }, {});
  const deptInfo = (id) => {
    const d = deps.find((x) => x.id === id);
    return {
      code: d?.code || "Other",
      name: d?.name || "",
      logo: d?.logo_url || "",
    };
  };
  const deptKeys = Object.keys(byDept).sort((a, b) =>
    deptInfo(a).code.localeCompare(deptInfo(b).code),
  );
  const open =
    allOpen ?? (!!fp || !!q || onlyIssues || onlyPending || onlyUnplaced);
  const totalSections = years.reduce(
    (s, y) => s + Object.keys(y.secs).length,
    0,
  );
  const allSecs = years.flatMap((y) => Object.values(y.secs));
  const secPending = (s) => Object.values(s.ok).some((r) => !r[0].proctor_id || !r[0].room_id);
  const secProblem = (s) => s.bad.length > 0 || Object.values(s.ok).some((r) => r[0].emergency);
  const pendingCount = allSecs.filter(secPending).length;
  const problemCount = allSecs.filter(secProblem).length;
  const totalScheduled = allSecs.filter((s) => Object.keys(s.ok).length).length;
  const totalBad = allSecs.filter((s) => s.bad.length).length;
  const totalDays = new Set(years.flatMap((y) => datesOf(y))).size;
  const tiles = [
    ["Sections", totalSections, "layers", "", "/config?tab=Sections"],
    ["Scheduled sections", totalScheduled, "check", "good"],
    [
      "Unscheduled",
      totalBad,
      "alert",
      totalBad ? "warn" : "",
      undefined,
      () => {
        setOnlyUnplaced((v) => !v);
        resetOpen();
      },
    ],
    ["Exam days used", totalDays, "calendar", ""],
  ];
  const grouped = progs.reduce((m, p) => {
    (m[p.department?.code] ||= []).push(p);
    return m;
  }, {});
  const oy = years.find((y) => y.key === openYear);
  const ExportButtons = ({ y, up = false }) => (
    <ExportMenu
      small
      iconOnly
      up={up}
      label="Download"
      formats={["pdf", "png"]}
      disabled={!y.count || !!exporting || locked}
      onExport={(f) => doExport(y, f)}
    />
  );
  const renderBatch = (rows) => {
    const f = rows[0];
    const key = `${f.exam_date}|${f.proctor_id}|${f.room_id}`;
    const tooSmall = f.room && f.section?.student_count > f.room.capacity;
    return (
      <div key={key} className={`batch ${f.emergency ? "danger" : ""}`}>
        <div className="bhead">
          <div className="bmain">
            <strong>{fmt(f.exam_date)}</strong>
            {f.room ? (
              <span className="muted">
                Room {f.room.name} · {floorLabel(f.room.floor)}{" "}
                {tooSmall && <Badge tone="amber">Over capacity</Badge>}
              </span>
            ) : (
              <span className="room-tba">Room: to be announced</span>
            )}
          </div>
          <div className="bwho">
            <span className={`proc ${!f.proctor_id ? "tba" : ""}`}>
              {f.proctor_id
                ? `Proctor: ${f.proctor?.full_name}`
                : "Proctor: to be announced"}
            </span>
            {f.emergency && (
              <Badge tone="red">
                Emergency{f.emergency_note ? `: ${f.emergency_note}` : ""}
              </Badge>
            )}
          </div>
          <div className="bacts">
            <button
              className="ghost sm"
              onClick={() =>
                setEditBlock({ id: f.id, tab: !f.room_id ? "room" : "proctor" })
              }
            >
              Edit
            </button>
            {f.emergency && (
              <button className="sm" onClick={() => setRep(f.id)}>
                Find replacement
              </button>
            )}
          </div>
        </div>
        <ul>
          {rows.map((r) => (
            <li key={r.id}>
              <time>
                {t5(r.start_time)}-{t5(r.end_time)}
              </time>
              <span>
                <strong>{r.subject?.code}</strong>{" "}
                <span className="muted">{r.subject?.title}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };
  return (
    <div className="per">
      <div className="pagehead">
        <div>
          <p className="sub">
            Create a period, generate the schedule, then open or download each
            year level.
          </p>
        </div>
        <button disabled={locked} aria-busy={locked} onClick={openNew}>
          + New exam period
        </button>
      </div>

      <section className="card" data-tour="per-bar">
        <div className="bar" style={{ marginBottom: 0 }}>
          <select
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            style={{ minWidth: 260 }}
          >
            {!periods.length && <option value="">No exam periods yet</option>}
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.start_date} to {p.end_date})
              </option>
            ))}
          </select>
          {period && (
            <Badge
              tone={
                approved
                  ? "green"
                  : period.status === "draft"
                    ? "gray"
                    : "amber"
              }
            >
              {approved
                ? "Approved"
                : period.status === "draft"
                  ? "Draft"
                  : "Pending approval"}
            </Badge>
          )}
          {period && <button className="ghost" onClick={() => setInfo(true)} title="Period details" aria-label="Period details"><Icon name="list" size={16} /><span className="btxt">Details</span></button>}
          <span style={{ flex: 1 }} />
          {sel && period?.status === "generated" && !approved && (
            <button
              disabled={locked}
              aria-busy={locked}
              onClick={() => review("approve")}
            >
              Approve schedule
            </button>
          )}
          {sel && ((me.role === "admin" && period?.status === "approved") || deptOk) && (
            <button
              className="ghost"
              disabled={locked}
              aria-busy={locked}
              onClick={() => review("revoke")}
            >
              Revoke approval
            </button>
          )}
          {sel && (
            <button
              disabled={busy || locked}
              aria-busy={locked}
              onClick={generate}
            >
              {busy
                ? "Generating…"
                : period?.status === "draft"
                  ? "Generate schedule"
                  : "Regenerate"}
            </button>
          )}
        </div>
      </section>

      <div className="grid" data-tour="per-tiles">
        {tiles.map(([k, v, icon, tone, to, act], i) => (
          <div
            className={`tile ${to || act ? "click" : ""} ${tone} ${i === 0 ? "fill" : ""} ${k === "Unscheduled" && onlyUnplaced ? "on" : ""}`}
            key={k}
            role={to || act ? "button" : undefined}
            tabIndex={to || act ? 0 : undefined}
            onClick={() => (act ? act() : to && nav(to))}
            onKeyDown={(e) =>
              e.key === "Enter" && (act ? act() : to && nav(to))
            }
          >
            <span className="ico">
              <Icon name={icon} />
            </span>
            <div>
              <b><CountUp value={sched === null ? 0 : v} /></b>
              <span>{k}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="toggles">
        <button type="button" className={`tgl ${onlyIssues ? "on" : ""}`}
          onClick={() => { setOnlyIssues((v) => !v); resetOpen(); }}>
          Only show problems <b>{problemCount}</b>
        </button>
        <button type="button" className={`tgl ${onlyPending ? "on" : ""}`}
          onClick={() => { setOnlyPending((v) => !v); resetOpen(); }}>
          Pending (proctor or room) <b>{pendingCount}</b>
        </button>
      </div>

      <section className="card" data-tour="per-filter">
        <div className="bar" style={{ marginBottom: 0 }}>
          <select
            value={fp}
            onChange={(e) => {
              setFp(e.target.value);
              resetOpen();
            }}
          >
            <option value="">All programs</option>
            {progs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </select>
          <input
            placeholder="Search, e.g. BSIT Year 2"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              resetOpen();
            }}
            style={{ width: 230 }}
          />
          <span style={{ flex: 1 }} />
          <button
            className="ghost sm"
            onClick={() => {
              setAllOpen(!open);
              setTick((t) => t + 1);
            }}
          >
            {open ? "Collapse all" : "Expand all"}
          </button>
          <span title={HINT}><ExportMenu
            label="Export all programs"
            onExport={(f) => doExportMany(years, f, "All programs")}
            disabled={locked || !years.some((y) => y.count)}
          /></span>
        </div>
      </section>

      {sched === null &&
        [1, 2, 3].map((i) => (
          <section className="card" key={i}>
            <Skeleton h={22} w="30%" />
          </section>
        ))}

      {deptKeys.map((id) => {
        const list = byDept[id];
        const info = deptInfo(id);
        const issues = list.filter((y) => y.bad || y.emerg).length;
        const pending = list.filter((y) => y.pend).length;
        return (
          <div className="progwrap" key={`${id}-${tick}`}>
            <details className="prog" open={open}>
              <summary>
                {info.logo && <img className="dlogo" src={info.logo} alt="" />}
                <span className="pname">{info.code}</span>
                <span className="muted">
                  {info.name ? `${info.name} · ` : ""}
                  {list.length} year level{list.length === 1 ? "" : "s"}
                </span>
                {issues > 0 && (
                  <Badge tone="amber">{issues} need attention</Badge>
                )}
                {pending > 0 && <Badge tone="amber">{pending} pending</Badge>}
                <span className="chev" />
              </summary>
              <div className="yeargrid">
                {list.map((y, i) => {
                  const dates = datesOf(y);
                  const secCount = Object.keys(y.secs).length;
                  return (
                    <Fragment key={y.key}>
                      {i > 0 && list[i - 1].prog !== y.prog && (
                        <hr className="progline" />
                      )}
                      <div
                        className={`yearcard ${y.bad || y.emerg ? "issue" : ""} ${y.emerg ? "hot" : ""}`}
                      >
                        <div className="yc-head">
                          <div>
                            <small>{y.prog}</small>
                            <h4>Year {y.year}</h4>
                          </div>
                          <Badge>
                            {secCount} section{secCount === 1 ? "" : "s"}
                          </Badge>
                        </div>
                        <div className="yc-meta">
                          {y.count} exams · {dates.length} exam day
                          {dates.length === 1 ? "" : "s"}
                        </div>
                        <div className="chips" style={{ marginBottom: 0 }}>
                          {dates.slice(0, 4).map((d) => (
                            <span className="dchip" key={d}>
                              {fmtShort(d)}
                            </span>
                          ))}
                          {dates.length > 4 && (
                            <span className="dchip">+{dates.length - 4}</span>
                          )}
                        </div>
                        {y.emerg && <Badge tone="red">Proctor emergency</Badge>}
                        {y.bad > 0 && (
                          <Badge tone="amber">{y.bad} not placed</Badge>
                        )}
                        {y.pend > 0 && (
                          <Badge tone="amber">{y.pend} pending</Badge>
                        )}
                        <div className="yc-actions">
                          <button
                            className="ghost sm"
                            onClick={() => setOpenYear(y.key)}
                          >
                            View
                          </button>
                          <ExportButtons y={y} />
                        </div>
                      </div>
                    </Fragment>
                  );
                })}
              </div>
            </details>
            <div className="progact" title={HINT}>
              <ExportMenu
                small
                label="Export"
                onExport={(f) => doExportMany(list, f, info.code)}
                disabled={locked || !list.some((y) => y.count)}
              />
            </div>
          </div>
        );
      })}
      {sched !== null && !deptKeys.length && (
        <section className="card">
          <p className="muted" style={{ margin: 0 }}>
            {years.length
              ? "Nothing matches your filters."
              : "Nothing scheduled yet. Choose a period and click Generate schedule."}
          </p>
        </section>
      )}

      {oy && (
        <Modal
          wide
          title={`${oy.prog} · Year ${oy.year}`}
          onClose={closeDetail}
          footer={
            <>
              <button className="ghost" onClick={closeDetail}>
                Close
              </button>
              <ExportButtons y={oy} up />
            </>
          }
        >
          <div className="chips">
            <Badge>{Object.keys(oy.secs).length} section(s)</Badge>
            <Badge>{oy.count} exams</Badge>
            <Badge>{datesOf(oy).length} exam day(s)</Badge>
            {onlyUnplaced && (
              <Badge tone="amber">Showing only sections that need action</Badge>
            )}
            {oy.emerg && <Badge tone="red">Proctor emergency</Badge>}
          </div>
          {Object.values(oy.secs)
            .filter((s) => !onlyUnplaced || s.bad.length)
            .sort((a, b) =>
              a.label.localeCompare(b.label, undefined, { numeric: true }),
            )
            .map((s) => {
              const blocks = Object.values(s.ok).sort((a, b) =>
                (a[0].exam_date + a[0].start_time).localeCompare(
                  b[0].exam_date + b[0].start_time,
                ),
              );
              const pend = blocks.filter(
                (r) => !r[0].proctor_id || !r[0].room_id,
              );
              const done = blocks.filter(
                (r) => r[0].proctor_id && r[0].room_id,
              );
              return (
                <div key={s.id}>
                  <h4 className="sechead">
                    {s.label}{" "}
                    <span className="muted">{s.students} students</span>
                  </h4>
                  {pend.length > 0 && (
                    <div className="group pend">
                      <h5>
                        Pending{" "}
                        <span>
                          waiting for a proctor or room · {pend.length}
                        </span>
                      </h5>
                      {pend.map((r) => renderBatch(r))}
                    </div>
                  )}
                  {done.length > 0 && (
                    <div className="group">
                      {pend.length > 0 && (
                        <h5>
                          Assigned <span>{done.length}</span>
                        </h5>
                      )}
                      {done.map((r) => renderBatch(r))}
                    </div>
                  )}
                  {s.bad.length > 0 && (
                    <div className="batch warn">
                      <strong>Could not place:</strong>{" "}
                      {s.bad.map((r) => r.subject?.code).join(", ")}
                      <div className="muted">{s.bad[0].reason}</div>
                      <button
                        className="sm"
                        style={{ marginTop: 10 }}
                        onClick={() => setResolve(s.bad[0])}
                      >
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
        </Modal>
      )}

      {showNew && (
        <Modal
          wide
          title={editId ? "Edit exam period" : "New exam period"}
          onClose={() => setShowNew(false)}
          footer={
            <>
              <button
                type="button"
                className="ghost"
                onClick={() => setShowNew(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                form="newperiod"
                disabled={saving || locked}
                aria-busy={locked}
              >
                {saving ? "Creating…" : editId ? "Save changes" : "Create period"}
              </button>
            </>
          }
        >
          <form id="newperiod" onSubmit={create} noValidate>
            {ferr.form && <div className="alert error">{ferr.form}</div>}
            <div className="fields">
              <Field label="Name *" error={ferr.name}>
                <input
                  placeholder="Midterm, 1st semester"
                  value={form.name}
                  onChange={(e) => setF("name", e.target.value)}
                />
              </Field>
              <Field label="Semester">
                <select
                  value={form.semester}
                  onChange={(e) => setF("semester", Number(e.target.value))}
                >
                  <option value={1}>1st semester</option>
                  <option value={2}>2nd semester</option>
                  <option value={3}>Summer</option>
                </select>
              </Field>
              <Field label="Start date *" error={ferr.start_date}>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setF("start_date", e.target.value)}
                />
              </Field>
              <Field label="End date *" error={ferr.end_date}>
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setF("end_date", e.target.value)}
                />
              </Field>
              <Field
                label="Exam days per year level *"
                error={ferr.days_per_year}
              >
                <input
                  type="number"
                  min={1}
                  value={form.days_per_year}
                  onChange={(e) =>
                    setF("days_per_year", Number(e.target.value))
                  }
                />
              </Field>
            </div>
            <div className="bar" style={{ marginTop: 18 }}>
              <strong style={{ flex: 1 }}>Programs *</strong>
              <button type="button" className="ghost sm" onClick={() => {
                const all = progs.length > 0 && form.program_ids.length === progs.length;
                setForm({ ...form, program_ids: all ? [] : progs.map((p) => p.id) });
                setFerr({ ...ferr, program_ids: "" });
              }}>
                {progs.length > 0 && form.program_ids.length === progs.length ? "Clear" : "Select all"}
              </button>
            </div>
            <div className="checks">
              {Object.keys(grouped).map((d) =>
                grouped[d].map((p) => (
                  <label key={p.id}>
                    <input
                      type="checkbox"
                      checked={form.program_ids.includes(p.id)}
                      onChange={() => toggle(p.id)}
                    />
                    {d}: {p.code}
                  </label>
                )),
              )}
            </div>
            {ferr.program_ids && (
              <small className="ferr">{ferr.program_ids}</small>
            )}
          </form>
        </Modal>
      )}
      {rep && (
        <ReplaceModal
          scheduleId={rep}
          onClose={() => setRep("")}
          onDone={loadSched}
        />
      )}
      {editBlock && (
        <EditBlockModal
          scheduleId={editBlock.id}
          initialTab={editBlock.tab}
          onClose={() => setEditBlock(null)}
          onDone={loadSched}
        />
      )}
      {resolve && (
        <ResolveUnplacedModal
          schedule={resolve}
          onClose={() => setResolve(null)}
          onDone={loadSched}
        />
      )}
      {info && period && (
        <Modal
          title={period.name}
          onClose={() => setInfo(false)}
          footer={
            <>
              <button className="ghost red" disabled={locked} onClick={() => { setInfo(false); removePeriod(); }}>
                <Icon name="trash" size={16} /> Delete period
              </button>
              <span style={{ flex: 1 }} />
              <button className="ghost" onClick={() => setInfo(false)}>Close</button>
              <button disabled={locked} onClick={() => { setInfo(false); openEdit(); }}>
                <Icon name="edit" size={16} /> Edit period
              </button>
            </>
          }
        >
          {[["Semester", SEM[period.semester] || "-"], ["Dates", `${period.start_date} to ${period.end_date}`], ["Exam days per year level", period.days_per_year]]
            .map(([k, v]) => <div className="drow" key={k}><small>{k}</small><div>{v}</div></div>)}
          <label style={{ marginTop: 12 }}>Proctors can accept until
            <select
              style={{ width: "auto" }}
              disabled={locked}
              aria-busy={locked}
              value={period.accept_cutoff_hours ?? 1}
              onChange={(e) => setCutoff(Number(e.target.value))}
            >
              {[...new Set([...CUTOFF_CHOICES, period.accept_cutoff_hours ?? 1])]
                .sort((a, b) => a - b)
                .map((h) => <option key={h} value={h}>{h === 0 ? "the exam starts" : `${h} hour${h === 1 ? "" : "s"} before`}</option>)}
            </select>
          </label>
        </Modal>
      )}
    </div>
  );
}
