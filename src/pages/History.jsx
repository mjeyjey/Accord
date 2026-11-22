import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import {
  Badge,
  initials,
  TableSkeleton,
  useLock,
  useUi,
} from "../components/ui";
import Pager, { slicePage } from "../components/Pager";
import ExportMenu from "../components/ExportMenu";
import { exportTable } from "../lib/exportTable";
import Trash from "../components/Trash";
import EndedPeriods from "../components/EndedPeriods";
import { save } from "../lib/exportSchedule";
import { useMe } from "../lib/me";
const ACTIONS = {
  create: { label: "Added", tone: "green" },
  update: { label: "Updated", tone: "blue" },
  delete: { label: "Deleted", tone: "red" },
  generate: { label: "Generated", tone: "blue" },
  emergency: { label: "Emergency", tone: "red" },
  announce: { label: "Announced", tone: "blue" },
  reassign: { label: "Reassigned", tone: "amber" },
  "edit batch": { label: "Edited block", tone: "blue" },
  "import curriculum": { label: "Curriculum import", tone: "blue" },
  "accept assignment": { label: "Accepted", tone: "green" },
  restore: { label: "Restored", tone: "green" },
  purge: { label: "Purged", tone: "red" },
  approve: { label: "Approved", tone: "green" },
  "revoke approval": { label: "Approval revoked", tone: "amber" },
  reschedule: { label: "Rescheduled", tone: "amber" },
  backup: { label: "Backup", tone: "gray" },
};
const ENTITY = {
  profiles: "user account",
  departments: "department",
  programs: "program",
  subjects: "subject",
  sections: "section",
  rooms: "room",
  availability: "availability slot",
  exam_periods: "exam period",
  schedules: "schedule",
  trash: "trash item",
  bulletins: "bulletin",
};
const nice = (k) => k.replace(/_id$/, "").replace(/_/g, " ");
const who = (r) => r.user?.full_name || r.user_name || "Deleted user";
function describe(r) {
  const d = r.details || {};
  const what = ENTITY[r.entity] || r.entity;
  switch (r.action) {
    case "create": {
      const name = d.full_name || d.name || d.code || d.title;
      return name ? `Added the ${what} “${name}”` : `Added a new ${what}`;
    }
    case "update": {
      const keys = Object.keys(d).filter((k) => k !== "id");
      return keys.length
        ? `Updated a ${what} (changed ${keys.map(nice).join(", ")})`
        : `Updated a ${what}`;
    }
    case "delete":
      return `Deleted a ${what}`;
    case "generate":
      return (
        `Generated the schedule for “${d.period}”: ${d.scheduled} of ${d.total} exams placed` +
        (d.unscheduled ? `, ${d.unscheduled} could not be placed` : "")
      );
    case "emergency":
      return d.note
        ? `Flagged a proctor emergency: “${d.note}”`
        : "Flagged a proctor emergency";
    case "announce":
      return `Posted the announcement “${d.title}”`;
    case "reassign":
      return `Assigned a replacement proctor for exams on ${d.date}`;
    case "edit batch":
      return (
        `Edited an exam block` + (d.exam_date ? `, now on ${d.exam_date}` : "")
      );
    case "import curriculum":
      return `Imported the curriculum of ${d.program}: ${d.added} added, ${d.updated} updated, ${d.removed} removed`;
    case "accept assignment":
      return `A proctor accepted an open assignment on ${d.date}`;
    case "restore":
      return `Restored the ${what} “${d.label || d.id}”`;
    case "purge":
      return `Permanently deleted ${d.count || 0} trash item(s)`;
    case "approve":
      return `Approved the schedule of “${d.period}”`;
    case "revoke approval":
      return `Withdrew the approval of “${d.period}”`;
    case "reschedule":
      return (
        `Moved an exam block to ${d.exam_date} at ${d.start}` +
        (d.released ? " (proctor released, now open)" : "")
      );
    case "backup":
      return "Downloaded a system backup";
    default:
      return `${r.action} ${what}`;
  }
}
function ago(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "Just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  if (s < 172800) return "Yesterday";
  return `${Math.floor(s / 86400)} days ago`;
}
export default function History({ trashOnly = false }) {
  const ui = useUi();
  const me = useMe();
  const [sp] = useSearchParams();
  const [locked, guard] = useLock();
  const [rows, setRows] = useState(null);
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [tab, setTab] = useState(
    sp.get("tab") || (trashOnly ? "periods" : "activity"),
  );
  useEffect(() => {
    if (!trashOnly)
      api
        .list("audit_log")
        .then(setRows)
        .catch((e) => {
          ui.toast.error(e.message);
          setRows([]);
        });
  }, [trashOnly]);
  const shown = useMemo(
    () =>
      (rows || []).filter(
        (r) =>
          (!action || r.action === action) &&
          (!q ||
            `${who(r)} ${describe(r)}`.toLowerCase().includes(q.toLowerCase())),
      ),
    [rows, action, q],
  );
  const doExport = guard(async (format) => {
    try {
      await exportTable({
        title: "History",
        subtitle: `${shown.length} actions`,
        filename: "Accord_History",
        format,
        rows: shown,
        columns: [
          {
            label: "When",
            weight: 2,
            get: (r) => new Date(r.created_at).toLocaleString(),
          },
          { label: "Who", weight: 2, get: (r) => who(r) },
          {
            label: "Action",
            weight: 1.4,
            get: (r) => ACTIONS[r.action]?.label || r.action,
          },
          { label: "What happened", weight: 5, get: describe },
        ],
      });
      ui.toast.success("Export ready");
    } catch (e) {
      ui.toast.error(e.message);
    }
  });
  const backup = guard(async () => {
    try {
      const data = await api.action("backup", {});
      save(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
        `Accord_Backup_${new Date().toISOString().slice(0, 10)}.json`,
      );
      ui.toast.success("Backup downloaded");
    } catch (e) {
      ui.toast.error(e.message);
    }
  });
  return (
    <>
      <div className="tabs">
        {!trashOnly && (
          <button
            className={tab === "activity" ? "on" : ""}
            onClick={() => setTab("activity")}
          >
            Activity
          </button>
        )}
        <button
          className={tab === "periods" ? "on" : ""}
          onClick={() => setTab("periods")}
        >
          Previous exam periods
        </button>
        <button
          className={tab === "trash" ? "on" : ""}
          onClick={() => setTab("trash")}
        >
          Trash
        </button>
      </div>
      {tab === "trash" ? (
        <Trash />
      ) : tab === "periods" ? (
        <EndedPeriods />
      ) : (
        <section className="card">
          <div className="bar">
            <input
              placeholder="Search by person or detail"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              style={{ width: 260 }}
            />
            <select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All actions</option>
              {Object.entries(ACTIONS)
                .filter(([k]) => k !== "purge")
                .map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
            </select>
            <span style={{ flex: 1 }} />
            {rows && <span className="muted">{shown.length} entries</span>}
            <ExportMenu
              onExport={doExport}
              disabled={!shown.length || locked}
            />
            {me.role === "admin" && (
              <button
                className="ghost"
                disabled={locked}
                aria-busy={locked}
                onClick={backup}
              >
                Download backup
              </button>
            )}
          </div>
          {rows === null ? (
            <TableSkeleton rows={8} cols={4} />
          ) : (
            <>
              <div className="scroll">
                <table>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Who</th>
                      <th>Action</th>
                      <th>What happened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {slicePage(shown, page, size).map((r) => {
                      const a = ACTIONS[r.action] || {
                        label: r.action,
                        tone: "gray",
                      };
                      return (
                        <tr key={r.id}>
                          <td className="when">
                            <b>{ago(r.created_at)}</b>
                            <small>
                              {new Date(r.created_at).toLocaleString()}
                            </small>
                          </td>
                          <td>
                            <div className="who-cell">
                              <span className="avatar">{initials(who(r))}</span>
                              {who(r)}
                            </div>
                          </td>
                          <td>
                            <Badge tone={a.tone}>{a.label}</Badge>
                          </td>
                          <td className="what">{describe(r)}</td>
                        </tr>
                      );
                    })}
                    {!shown.length && (
                      <tr>
                        <td colSpan={4} className="empty">
                          No history matches your search.
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
      )}
    </>
  );
}
