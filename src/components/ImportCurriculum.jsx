import { useRef, useState } from "react";
import { api } from "../lib/api";
import { Badge, Modal, useLock, useUi } from "./ui";
import { parseCurriculum, readPdfColumns } from "../lib/curriculumPdf";
const SEMS = { 1: "1st semester", 2: "2nd semester", 3: "Summer" };
const TERMS = [1, 2, 3];
let seq = 0;
export default function ImportCurriculum({ programs, deps, onDone }) {
  const ui = useUi();
  const input = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [removeMissing, setRemoveMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [locked, guard] = useLock();
  const close = () => {
    setOpen(false);
    setItems([]);
    setErr("");
    setRemoveMissing(false);
  };
  const patch = (id, p) =>
    setItems((l) => l.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const setRow = (id, i, r) =>
    setItems((l) =>
      l.map((x) =>
        x.id === id && x.rows
          ? { ...x, rows: x.rows.map((q, j) => (j === i ? { ...q, ...r } : q)) }
          : x,
      ),
    );
  // Add a blank subject the PDF reader missed, to a given year and semester (1st, 2nd or Summer).
  const addRow = (id, year, sem) =>
    setItems((l) =>
      l.map((x) =>
        x.id === id
          ? {
              ...x,
              open: true,
              rows: [
                ...(x.rows || []),
                {
                  year_level: year,
                  semester: sem,
                  code: "",
                  title: "",
                  on: true,
                  manual: true,
                },
              ],
            }
          : x,
      ),
    );
  const delRow = (id, i) =>
    setItems((l) =>
      l.map((x) =>
        x.id === id && x.rows
          ? { ...x, rows: x.rows.filter((_, j) => j !== i) }
          : x,
      ),
    );
  const guess = (name) => {
    const n = name.toUpperCase().replace(/[_\s]+/g, "-");
    return (
      [...programs]
        .sort((a, b) => b.code.length - a.code.length)
        .find((p) => n.includes(p.code.toUpperCase())) || null
    );
  };
  const setDepartment = (item, department_id) => {
    const choices = programs.filter((p) => p.department_id === department_id);
    const current = choices.find((p) => p.id === item.prog);
    patch(item.id, {
      department_id,
      prog: current?.id || (choices.length === 1 ? choices[0].id : ""),
    });
  };
  const pick = async (files) => {
    if (!files?.length) return;
    const list = Array.from(files);
    if (input.current) input.current.value = "";
    const fresh = list.map((f) => {
      const p = guess(f.name);
      return {
        id: ++seq,
        name: f.name,
        department_id: p?.department_id || "",
        prog: p?.id || "",
        rows: null,
        error: "",
        reading: true,
        done: false,
        result: "",
        open: false,
      };
    });
    setItems((l) => [...l, ...fresh]);
    for (let i = 0; i < list.length; i++) {
      try {
        const rows = parseCurriculum(await readPdfColumns(list[i]));
        if (!rows.length)
          throw new Error(
            "No subjects found. The PDF may be a scan (image only) or use an unknown layout.",
          );
        patch(fresh[i].id, {
          rows: rows.map((x) => ({ ...x, on: !x.optional })),
          reading: false,
        });
      } catch (e) {
        patch(fresh[i].id, { error: e.message, reading: false });
      }
    }
  };
  const todo = items.filter((x) => x.rows && !x.done);
  const apply = guard(async () => {
    if (todo.some((x) => !x.department_id || !x.prog)) {
      setErr("Choose a department and program for every file");
      return;
    }
    if (removeMissing && new Set(todo.map((x) => x.prog)).size < todo.length) {
      setErr(
        'Two files use the same program. Untick "Also remove…" or remove one of the files.',
      );
      return;
    }
    setSaving(true);
    setErr("");
    let good = 0;
    for (const x of todo) {
      try {
        const r = await api.action("import_curriculum", {
          program_id: x.prog,
          remove_missing: removeMissing,
          subjects: x.rows
            .filter((s) => s.on && s.code.trim() && s.title.trim())
            .map(({ on, manual, optional, ...s }) => ({
              ...s,
              code: s.code.trim(),
              title: s.title.trim(),
            })),
        });
        patch(x.id, {
          done: true,
          error: "",
          result:
            `${r.added} added, ${r.updated} updated, ${r.removed} removed` +
            (r.kept ? `, ${r.kept} kept` : ""),
        });
        good++;
      } catch (e) {
        patch(x.id, { error: e.message });
      }
    }
    setSaving(false);
    if (good) {
      ui.toast.success(`${good} curriculum file(s) imported`);
      onDone();
    }
    if (good === todo.length) close();
  });
  return (
    <>
      <button className="ghost" onClick={() => setOpen(true)}>
        Add curriculum
      </button>
      {open && (
        <Modal
          wide
          title="Add curriculum from evaluation sheets"
          onClose={close}
          footer={
            <>
              <button className="ghost" onClick={close}>
                Cancel
              </button>
              {todo.length > 0 && (
                <button
                  disabled={saving || locked}
                  aria-busy={locked}
                  onClick={apply}
                >
                  {saving ? "Saving…" : `Apply ${todo.length} file(s)`}
                </button>
              )}
            </>
          }
        >
          {err && <div className="alert error">{err}</div>}
          <input
            ref={input}
            type="file"
            accept="application/pdf"
            multiple
            hidden
            onChange={(e) => pick(e.target.files)}
          />
          <div className="row">
            <button className="ghost sm" onClick={() => input.current?.click()}>
              Choose PDF files
            </button>
            <span className="muted">
              Select one or more evaluation sheets. Each file imports one
              program. Bridging programs are skipped.
            </span>
          </div>
          {items.map((x) => {
            const choices = programs
              .filter((p) => p.department_id === x.department_id)
              .sort((a, b) => a.code.localeCompare(b.code));
            const rows = x.rows || [];
            const maxYear = Math.max(4, ...rows.map((r) => r.year_level));
            // Every year shows all three terms (1st, 2nd, Summer) so a missed subject can be added anywhere.
            const groups = Array.from(
              { length: maxYear },
              (_, i) => i + 1,
            ).flatMap((y) =>
              TERMS.map((s) => ({
                y,
                s,
                label: `Year ${y} · ${SEMS[s]}`,
                rows: rows
                  .map((row, index) => ({ row, index }))
                  .filter(
                    ({ row }) => row.year_level === y && row.semester === s,
                  ),
              })),
            );
            return (
              <div className="batch" key={x.id}>
                <div
                  className="row"
                  style={{ justifyContent: "space-between" }}
                >
                  <strong>{x.name}</strong>
                  {!x.done && (
                    <button
                      className="ghost red sm"
                      onClick={() =>
                        setItems((l) => l.filter((y) => y.id !== x.id))
                      }
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="fields" style={{ marginTop: 10 }}>
                  <label>
                    <span>Department *</span>
                    <select
                      value={x.department_id}
                      disabled={x.done}
                      onChange={(e) => setDepartment(x, e.target.value)}
                    >
                      <option value="">Select department</option>
                      {deps
                        .filter((d) =>
                          programs.some((p) => p.department_id === d.id),
                        )
                        .sort((a, b) => a.code.localeCompare(b.code))
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.code} - {d.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    <span>Program *</span>
                    <select
                      value={x.prog}
                      disabled={
                        x.done || !x.department_id || choices.length === 1
                      }
                      onChange={(e) => patch(x.id, { prog: e.target.value })}
                    >
                      <option value="">Select program</option>
                      {choices.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.code}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {x.reading && <p className="muted">Reading the PDF…</p>}
                {x.error && (
                  <div className="alert error" style={{ marginTop: 8 }}>
                    {x.error}
                  </div>
                )}
                {x.done && (
                  <p style={{ margin: "8px 0 0" }}>
                    <Badge tone="green">Imported</Badge>{" "}
                    <span className="muted">{x.result}</span>
                  </p>
                )}
                {x.rows && !x.done && (
                  <details
                    style={{ marginTop: 8 }}
                    open={x.open}
                    onToggle={(e) =>
                      patch(x.id, { open: e.currentTarget.open })
                    }
                  >
                    <summary className="muted" style={{ cursor: "pointer" }}>
                      {x.rows.length} subjects found · review selection and add
                      missing ones
                    </summary>
                    {groups.map((g) => (
                      <div key={g.label}>
                        <h5 className="sechead">
                          <span>
                            {g.label}{" "}
                            <span className="muted">
                              {g.rows.length
                                ? `${g.rows.length} subject${g.rows.length === 1 ? "" : "s"}`
                                : "none read"}
                            </span>
                          </span>
                          <button
                            className="ghost sm"
                            onClick={() => addRow(x.id, g.y, g.s)}
                          >
                            + Add subject
                          </button>
                        </h5>
                        {g.rows.length > 0 && (
                          <div
                            className="scroll"
                            style={{ marginTop: 8, maxHeight: "32vh" }}
                          >
                            <table>
                              <thead>
                                <tr>
                                  <th />
                                  <th>Code</th>
                                  <th>Title</th>
                                  <th />
                                </tr>
                              </thead>
                              <tbody>
                                {g.rows.map(({ row, index }) => (
                                  <tr
                                    key={index}
                                    style={
                                      row.on ? undefined : { opacity: 0.4 }
                                    }
                                  >
                                    <td>
                                      <input
                                        type="checkbox"
                                        checked={row.on}
                                        onChange={(e) =>
                                          setRow(x.id, index, {
                                            on: e.target.checked,
                                          })
                                        }
                                      />
                                    </td>
                                    <td>
                                      <input
                                        value={row.code}
                                        placeholder="Code"
                                        onChange={(e) =>
                                          setRow(x.id, index, {
                                            code: e.target.value,
                                          })
                                        }
                                        style={{ minWidth: 110 }}
                                      />
                                    </td>
                                    <td>
                                      <input
                                        value={row.title}
                                        placeholder="Subject title"
                                        onChange={(e) =>
                                          setRow(x.id, index, {
                                            title: e.target.value,
                                          })
                                        }
                                        style={{ minWidth: 320 }}
                                      />
                                    </td>
                                    <td>
                                      {row.manual && (
                                        <button
                                          className="ghost red sm"
                                          onClick={() => delRow(x.id, index)}
                                        >
                                          Remove
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </details>
                )}
              </div>
            );
          })}
          {items.length > 0 && (
            <label
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                fontWeight: 400,
                marginTop: 12,
              }}
            >
              <input
                type="checkbox"
                checked={removeMissing}
                onChange={(e) => setRemoveMissing(e.target.checked)}
              />
              Also remove each program's subjects that are not in its sheet
              (subjects already used in a schedule are kept)
            </label>
          )}
        </Modal>
      )}
    </>
  );
}
