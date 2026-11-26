import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, FLOORS, floorLabel } from "../lib/api";
import { useMe } from "../lib/me";
import CrudTable from "../components/CrudTable";
import ImportCurriculum from "../components/ImportCurriculum";
import ImportRooms from "../components/ImportRooms";
import ProctorSchedule from "../components/ProctorSchedule";
import ProctorSubjects from "../components/ProctorSubjects";
import ProfileView from "../components/ProfileView";
import AccountApprovals from "../components/AccountApprovals";
import TabScroller from "../components/TabScroller";
import { Avatar, Badge, Modal } from "../components/ui";
import DeptLogo from "../components/DeptLogo";
import { todayIso } from "../lib/periods";
const ALL_TABS = [
  "Departments",
  "Programs and floors",
  "Subjects",
  "Sections",
  "Rooms",
  "Proctors",
  "Department heads",
  "Account requests",
];
const PROG_TABS = ["Programs and floors", "Subjects", "Sections"];
const YEARS = [1, 2, 3, 4].map((y) => ({
  value: String(y),
  label: `Year ${y}`,
}));
const SEMS = [
  { value: "1", label: "1st semester" },
  { value: "2", label: "2nd semester" },
  { value: "3", label: "Summer" },
];
const cmp = (a, b) =>
  String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true });
export default function Config() {
  const me = useMe();
  const admin = me.role === "admin";
  const tabs = admin
    ? ALL_TABS
    : [
        "Programs and floors",
        "Subjects",
        "Sections",
        "Rooms",
        "Proctors",
        "Account requests",
      ];
  const [sp, setSp] = useSearchParams();
  const wanted = sp.get("tab");
  const tab = wanted && tabs.includes(wanted) ? wanted : tabs[0];
  const setTab = (t) => setSp({ tab: t }, { replace: true });
  const [deptFilter, setDeptFilter] = useState("");
  const [progFilter, setProgFilter] = useState("");
  const [roomImport, setRoomImport] = useState(false);
  const unassignedOk = admin && (tab === "Proctors" || tab === "Rooms");
  const eff = deptFilter === "none" && !unassignedOk ? "" : deptFilter;
  const dsel = admin ? eff : me.department_id || "";
  const showProg = PROG_TABS.includes(tab);
  const [deps, setDeps] = useState([]);
  const [progs, setProgs] = useState([]);
  const [availIds, setAvailIds] = useState(new Set());
  const [viewP, setViewP] = useState(null);
  const [subP, setSubP] = useState(null);
  const [profileId, setProfileId] = useState("");
  const [statusInfo, setStatusInfo] = useState(false);
  const [rk, setRk] = useState(0);
  const [procFilter, setProcFilter] = useState("");
  const procStatus = (r) =>
    r.assigned_hours > 0
      ? "assigned"
      : availIds.has(r.id)
        ? "available"
        : "none";
  useEffect(() => {
    api.list("departments").then(setDeps);
    api.list("programs").then(setProgs);
    api
      .list("availability")
      .then((a) => {
        const t = todayIso();
        setAvailIds(
          new Set(a.filter((x) => x.date >= t).map((x) => x.proctor_id)),
        );
      })
      .catch(() => {});
  }, [tab, rk]);
  const depOpts = deps.map((d) => ({
    value: d.id,
    label: `${d.code} - ${d.name}`,
  }));
  const myProgs = admin
    ? progs
    : progs.filter((p) => p.department_id === me.department_id);
  const progOpts = [...myProgs]
    .sort((a, b) => cmp(a.code, b.code))
    .map((p) => ({ value: p.id, label: p.code }));
  const floorOpts = FLOORS.map((f) => ({ value: f, label: floorLabel(f) }));
  const depOptsMine = admin
    ? depOpts
    : depOpts.filter((d) => d.value === me.department_id);
  const filterProgs = [
    ...(admin
      ? progs.filter((p) => !dsel || p.department_id === dsel)
      : myProgs),
  ].sort((a, b) => cmp(a.code, b.code));
  const byDept = (r) =>
    !dsel || (dsel === "none" ? !r.department_id : r.department_id === dsel);
  const byProgDept = (r) => !dsel || r.program?.department_id === dsel;
  const byProgram = (r) =>
    byProgDept(r) && (!progFilter || r.program_id === progFilter);
  const people = (role, title) => (
    <CrudTable
      key={role}
      table="profiles"
      title={title}
      defaults={{ role }}
      reloadKey={rk}
      filter={(r) =>
        r.role === role &&
        r.status !== "pending" &&
        byDept(r) &&
        (role !== "proctor" || !procFilter || procStatus(r) === procFilter)
      }
      sort={(a, b) => cmp(a.full_name, b.full_name)}
      cols={[
        {
          key: "full_name",
          label: "Name",
          render: (r) => (
            <div
              className="who-cell who-link"
              onClick={() => setProfileId(r.id)}
            >
              <Avatar name={r.full_name} src={r.avatar_url} />
              {r.full_name}
            </div>
          ),
        },
        { key: "email", label: "Email" },
        {
          key: "department",
          label: "Department",
          render: (r) => r.department?.code || "-",
        },
        ...(role === "proctor"
          ? [
              {
                key: "avail",
                label: "Time availability",
                render: (r) => (
                  <button
                    type="button"
                    className="badgebtn"
                    title="Click for details"
                    onClick={() => setStatusInfo(true)}
                  >
                    {procStatus(r) === "assigned" ? (
                      <Badge tone="blue">Assigned</Badge>
                    ) : procStatus(r) === "available" ? (
                      <Badge tone="green">Available</Badge>
                    ) : (
                      <Badge tone="amber">Not available</Badge>
                    )}
                  </button>
                ),
              },
            ]
          : []),
      ]}
      rowExtra={role === "proctor" ? (r) => (<>
        <button className="ghost sm" onClick={() => setSubP(r)}>Subjects</button>
        <button className="ghost sm" onClick={() => setViewP(r)}>View schedule</button>
      </>) : undefined}
      fields={[
        { key: "full_name", label: "Full name", required: true },
        {
          key: "email",
          label: "Email",
          type: "email",
          required: true,
          createOnly: true,
        },
        {
          key: "password",
          label: "Temporary password",
          type: "password",
          required: true,
          createOnly: true,
        },
        {
          key: "department_id",
          label: "Department",
          type: "select",
          options: depOptsMine,
        },
      ]}
    />
  );
  return (
    <>
      <h2 style={{ marginBottom: 12 }}></h2>
      <TabScroller>
        {tabs.map((t) => (
          <button
            key={t}
            className={t === tab ? "on" : ""}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </TabScroller>
      {tab !== "Account requests" &&
        (admin || showProg || tab === "Proctors") && (
          <div className="bar">
            {admin && (
              <label
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                Show
                <select
                  value={eff}
                  onChange={(e) => {
                    setDeptFilter(e.target.value);
                    setProgFilter("");
                  }}
                >
                  <option value="">All departments</option>
                  {unassignedOk && <option value="none">Unassigned</option>}
                  {deps.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.code} - {d.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {tab === "Proctors" && (
              <label
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                Status
                <select
                  value={procFilter}
                  onChange={(e) => setProcFilter(e.target.value)}
                >
                  <option value="">All</option>
                  <option value="available">Available</option>
                  <option value="assigned">Assigned</option>
                  <option value="none">Not available</option>
                </select>
              </label>
            )}
            {showProg && dsel && filterProgs.length > 1 && (
              <label
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                Program
                <select
                  value={progFilter}
                  onChange={(e) => setProgFilter(e.target.value)}
                >
                  <option value="">All programs</option>
                  {filterProgs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}

      {tab === "Departments" && (
        <CrudTable
          key={tab}
          table="departments"
          title="Departments"
          reloadKey={rk}
          filter={(r) => !dsel || r.id === dsel}
          sort={(a, b) => cmp(a.code, b.code)}
          cols={[
            {
              key: "logo",
              label: "Logo",
              render: (r) =>
                r.logo_url ? (
                  <img className="dlogo" src={r.logo_url} alt="" />
                ) : (
                  "-"
                ),
            },
            { key: "code", label: "Code" },
            { key: "name", label: "Name" },
          ]}
          editExtra={(r, reload) =>
            r ? (
              <>
                <h4 className="sechead">Logo</h4>
                <DeptLogo dept={r} onSaved={reload} />
              </>
            ) : null
          }
          toolbar={
            <ImportCurriculum
              programs={progs}
              deps={deps}
              onDone={() => setRk((x) => x + 1)}
            />
          }
          fields={[
            { key: "code", label: "Code", required: true },
            { key: "name", label: "Name", required: true },
          ]}
        />
      )}

      {tab === "Programs and floors" && (
        <>
          {(() => {
            if (admin) return null;
            const d = deps.find((x) => x.id === me.department_id);
            return d ? (
              <section className="card">
                <h3>Department logo</h3>
                <p className="muted" style={{ marginTop: 0 }}>
                  Shown beside {d.code} in Exam periods.
                </p>
                <DeptLogo
                  dept={d}
                  preview
                  onSaved={() => setRk((x) => x + 1)}
                />
              </section>
            ) : null;
          })()}
          <CrudTable
            key={tab}
            table="programs"
            title="Programs and floors"
            hint="The floor is where this program's exams are held. Only rooms on the floors of the department's programs are used."
            filter={(r) => byDept(r) && (!progFilter || r.id === progFilter)}
            sort={(a, b) => cmp(a.code, b.code)}
            toolbar={
              !admin ? (
                <ImportCurriculum
                  programs={myProgs}
                  deps={deps}
                  onDone={() => setRk((x) => x + 1)}
                />
              ) : undefined
            }
            cols={[
              { key: "code", label: "Code" },
              { key: "name", label: "Name" },
              {
                key: "department",
                label: "Department",
                render: (r) => r.department?.code,
              },
              {
                key: "floor",
                label: "Floor",
                render: (r) => floorLabel(r.floor),
              },
            ]}
            fields={[
              { key: "code", label: "Code", required: true },
              { key: "name", label: "Name", required: true },
              {
                key: "department_id",
                label: "Department",
                type: "select",
                options: depOpts,
              },
              {
                key: "floor",
                label: "Floor",
                type: "select",
                options: floorOpts,
              },
            ]}
          />
        </>
      )}

      {tab === "Subjects" && (
        <CrudTable
          key={tab}
          table="subjects"
          title="Subjects"
          reloadKey={rk}
          filter={byProgram}
          filters={[{ key: "year", label: "Year", options: YEARS, test: (r, v) => String(r.year_level) === v }, { key: "sem", label: "Semester", options: SEMS, test: (r, v) => String(r.semester) === v }]}
          sort={(a, b) =>
            cmp(a.program?.code, b.program?.code) ||
            a.year_level - b.year_level ||
            a.semester - b.semester ||
            cmp(a.code, b.code)
          }
          cols={[
            {
              key: "program",
              label: "Program",
              m: "meta",
              render: (r) => r.program?.code,
            },
            { key: "year_level", label: "Year" },
            {
              key: "semester",
              label: "Semester",
              render: (r) =>
                SEMS.find((s) => s.value === String(r.semester))?.label,
            },
            { key: "code", label: "Subject code", m: "title" },
            { key: "title", label: "Title", m: "sub" },
          ]}
          fields={[
            {
              key: "program_id",
              label: "Program",
              type: "select",
              options: progOpts,
            },
            {
              key: "year_level",
              label: "Year level",
              type: "select",
              options: YEARS,
            },
            {
              key: "semester",
              label: "Semester",
              type: "select",
              options: SEMS,
            },
            { key: "code", label: "Subject code", required: true },
            { key: "title", label: "Title", required: true },
          ]}
        />
      )}

      {tab === "Sections" && (
        <CrudTable
          key={tab}
          table="sections"
          title="Sections"
          filter={byProgram}
          filters={[{ key: "year", label: "Year", options: YEARS, test: (r, v) => String(r.year_level) === v }]}
          sort={(a, b) =>
            cmp(a.program?.code, b.program?.code) ||
            a.year_level - b.year_level ||
            cmp(a.name, b.name)
          }
          hint="Student count decides which room a section can be placed in."
          cols={[
            {
              key: "program",
              label: "Program",
              render: (r) => r.program?.code,
            },
            { key: "year_level", label: "Year" },
            { key: "name", label: "Section" },
            { key: "student_count", label: "Students" },
          ]}
          fields={[
            {
              key: "program_id",
              label: "Program",
              type: "select",
              options: progOpts,
            },
            {
              key: "year_level",
              label: "Year level",
              type: "select",
              options: YEARS,
            },
            { key: "name", label: "Section name", required: true },
            {
              key: "student_count",
              label: "Number of students",
              type: "number",
              required: true,
            },
          ]}
        />
      )}

      {tab === "Rooms" && (
        <CrudTable
          key={tab}
          table="rooms"
          title="Rooms"
          reloadKey={rk}
          filter={admin ? byDept : undefined}
          filters={[{ key: "floor", label: "Floor", options: floorOpts, test: (r, v) => r.floor === v }]}
          addMenu={[{ label: "Import", onClick: () => setRoomImport(true) }]}
          sort={(a, b) =>
            FLOORS.indexOf(a.floor) - FLOORS.indexOf(b.floor) ||
            cmp(a.name, b.name)
          }
          cols={[
            { key: "name", label: "Room" },
            {
              key: "floor",
              label: "Floor",
              render: (r) => floorLabel(r.floor),
            },
            { key: "capacity", label: "Capacity" },
            {
              key: "department",
              label: "Department",
              render: (r) => r.department?.code || "Unassigned",
            },
          ]}
          fields={[
            { key: "name", label: "Room name", required: true },
            {
              key: "floor",
              label: "Floor",
              type: "select",
              options: floorOpts,
            },
            {
              key: "capacity",
              label: "Capacity",
              type: "number",
              required: true,
            },
            {
              key: "department_id",
              label: "Department (optional)",
              type: "select",
              options: depOptsMine,
              required: false,
            },
          ]}
        />
      )}

      {tab === "Proctors" && people("proctor", "Proctors")}
      {tab === "Department heads" && people("head", "Department heads")}
      {tab === "Account requests" && (
        <AccountApprovals onChange={() => setRk((x) => x + 1)} />
      )}
      {profileId && (
        <ProfileView userId={profileId} onClose={() => setProfileId("")} />
      )}
      {statusInfo && (
        <Modal
          title="Time availability status"
          onClose={() => setStatusInfo(false)}
          footer={<button onClick={() => setStatusInfo(false)}>Got it</button>}
        >
          <p className="dlgtext">
            <b>Assigned</b> = the proctor already has upcoming exams in a
            generated schedule.
          </p>
          <p className="dlgtext">
            <b>Available</b> = the proctor has entered time availability and has
            no upcoming exams yet.
          </p>
          <p className="dlgtext">
            <b>Not available</b> = none entered yet, so they are not scheduled
            automatically (they can still accept open assignments).
          </p>
        </Modal>
      )}
      {viewP && (
        <ProctorSchedule proctor={viewP} onClose={() => setViewP(null)} />
      )}
      {subP && <ProctorSubjects proctor={subP} onClose={() => setSubP(null)} />}
      {roomImport && (
        <ImportRooms
          onClose={() => setRoomImport(false)}
          onDone={() => setRk((x) => x + 1)}
        />
      )}
    </>
  );
}
