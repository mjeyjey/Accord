import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useMe } from "../lib/me";
import { Badge, TableSkeleton, useLock, useUi } from "./ui";
export default function AccountApprovals({ onChange }) {
  const ui = useUi();
  const [locked, guard] = useLock();
  const me = useMe();
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState("");
  const load = () =>
    api
      .list("profiles")
      .then((r) =>
        setRows(
          r.filter(
            (x) =>
              x.status === "pending" &&
              (me.role === "admin" || x.department_id === me.department_id),
          ),
        ),
      )
      .catch((e) => {
        ui.toast.error(e.message);
        setRows([]);
      });
  useEffect(() => {
    load();
  }, []);
  const approve = guard(async (r) => {
    setBusy(r.id);
    try {
      await api.update("profiles", r.id, { status: "active" });
      ui.toast.success(`${r.full_name} approved`);
      load();
      onChange?.();
    } catch (e) {
      ui.toast.error(e.message);
    }
    setBusy("");
  });
  const reject = guard(async (r) => {
    const yes = await ui.confirm({
      title: "Reject this request?",
      message: `${r.full_name}'s pending account will be deleted and they will not be able to sign in.`,
      confirmLabel: "Reject",
      danger: true,
    });
    if (!yes) return;
    setBusy(r.id);
    try {
      await api.remove("profiles", r.id);
      ui.toast.success("Request rejected");
      load();
      onChange?.();
    } catch (e) {
      ui.toast.error(e.message);
    }
    setBusy("");
  });
  return (
    <section className="card">
      <div className="bar">
        <h3>
          Account requests {rows && <Badge tone="gray">{rows.length}</Badge>}
        </h3>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Check that each person is really a proctor or faculty member of the
        school before approving. Approved people can log in right away.
      </p>
      {rows === null ? (
        <TableSkeleton rows={4} cols={4} />
      ) : (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Requested</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.full_name}</td>
                  <td>{r.email}</td>
                  <td>{r.department?.code || "Unassigned"}</td>
                  <td>
                    {r.created_at
                      ? new Date(r.created_at).toLocaleDateString("en-PH")
                      : "-"}
                  </td>
                  <td className="actions">
                    <button
                      className="sm"
                      disabled={!!busy || locked}
                      aria-busy={locked}
                      onClick={() => approve(r)}
                    >
                      Approve
                    </button>
                    <button
                      className="ghost red sm"
                      disabled={!!busy || locked}
                      aria-busy={locked}
                      onClick={() => reject(r)}
                    >
                      Reject
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={5} className="empty">
                    No pending requests.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
