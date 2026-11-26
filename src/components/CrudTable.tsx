import { FormEvent, MouseEvent, ReactNode, TouchEvent, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useMobile } from '../lib/useMobile';
import { Field as FieldControl, Modal, TableSkeleton, useLock, useUi } from './ui';
import Pager, { slicePage } from './Pager';
import RowMenu from './RowMenu';
import { passwordProblem } from '../lib/password';

export interface Field {
  key: string; label: string;
  type?: 'text' | 'number' | 'select' | 'password' | 'date' | 'time' | 'email';
  options?: { value: string; label: string }[];
  createOnly?: boolean; required?: boolean;
  min?: string; max?: string;
  check?: (v: any) => string | null;
}
export interface Col { key: string; label: string; render?: (r: any) => ReactNode; m?: 'title' | 'sub' | 'meta' }

interface Props {
  table: string; title: string; cols: Col[]; fields: Field[];
  defaults?: any; filter?: (r: any) => boolean; sort?: (a: any, b: any) => number;
  allowAdd?: boolean; allowEdit?: boolean; allowDelete?: boolean;
  rowExtra?: (r: any, reload: () => void) => ReactNode;
  editExtra?: (r: any, reload: () => void) => ReactNode;
  reloadKey?: any; hint?: string; toolbar?: ReactNode;
  addMenu?: { label: string; onClick: () => void }[];
  filters?: { key: string; label: string; options: { value: string; label: string }[]; test: (r: any, v: string) => boolean }[];
}

const runAll = async (ids: string[], fn: (id: string) => Promise<any>) => {
  let ok = 0, fail = 0, msg = '';
  for (let i = 0; i < ids.length; i += 5) {
    const res = await Promise.allSettled(ids.slice(i, i + 5).map(fn));
    res.forEach((r) => {
      if (r.status === 'fulfilled') ok++;
      else { fail++; msg = (r.reason as Error)?.message || msg; }
    });
  }
  return { ok, fail, msg };
};

function useLongPress(onLong: () => void, onTap: () => void) {
  const timer = useRef<number | undefined>(undefined);
  const fired = useRef(false);
  const pos = useRef<[number, number]>([0, 0]);
  return {
    onTouchStart: (e: TouchEvent) => {
      fired.current = false;
      pos.current = [e.touches[0].clientX, e.touches[0].clientY];
      timer.current = window.setTimeout(() => { fired.current = true; navigator.vibrate?.(15); onLong(); }, 450);
    },
    onTouchMove: (e: TouchEvent) => {
      const [x, y] = pos.current;
      if (Math.abs(e.touches[0].clientX - x) > 8 || Math.abs(e.touches[0].clientY - y) > 8) clearTimeout(timer.current);
    },
    onTouchEnd: () => clearTimeout(timer.current),
    onTouchCancel: () => clearTimeout(timer.current),
    onClick: () => { if (fired.current) { fired.current = false; return; } onTap(); },
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
  };
}

function MobileRow({ r, cols, selecting, selected, onTap, onHold }: any) {
  const lp = useLongPress(onHold, onTap);
  const pick = (k: string, i: number): Col | undefined => cols.find((c: Col) => c.m === k) || cols[i];
  const t = pick('title', 0), s = pick('sub', 1), m = pick('meta', 2);
  const val = (c?: Col) => c ? (c.render ? c.render(r) : String(r[c.key] ?? '')) : '';
  return (
    <div className={`mrow ${selected ? 'on' : ''} ${r.emergency ? 'danger' : ''}`} {...lp}>
      {selecting && <input type="checkbox" checked={selected} readOnly />}
      <div className="mmain">
        <div className="mtitle">{val(t)}</div>
        {s && s !== t && <small>{val(s)}</small>}
      </div>
      {m && m !== t && m !== s && <span className="mmeta">{val(m)}</span>}
      <span className="mchev">›</span>
    </div>
  );
}

export default function CrudTable(p: Props) {
  const ui = useUi();
  const [locked, guard] = useLock();
  const mobile = useMobile();
  const [rows, setRows] = useState<any[] | null>(null);
  const [form, setForm] = useState<any | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const [bulk, setBulk] = useState<any | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [formErr, setFormErr] = useState('');
  const [loadErr, setLoadErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');
  const [fv, setFv] = useState<Record<string, string>>({});
  const [fOpen, setFOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState('');

  const reload = () => api.list(p.table)
    .then((r) => { setRows(r); setLoadErr(''); })
    .catch((e) => { setLoadErr(e.message); setRows([]); });
  useEffect(() => {
    setRows(null); setPage(1); setSel(new Set()); setEdit(null); setBulk(null); setFv({}); reload();
  }, [p.table, p.reloadKey]);

  let shown = (rows || [])
    .filter(p.filter || (() => true))
    .filter((r) => (p.filters || []).every((f) => !fv[f.key] || f.test(r, fv[f.key])))
    .filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
  if (p.sort) shown = [...shown].sort(p.sort);
  const pageRows = slicePage(shown, page, size);
  const detail = rows?.find((r) => r.id === detailId);
  const selRows = shown.filter((r) => sel.has(r.id));
  const pageAll = pageRows.length > 0 && pageRows.every((r) => sel.has(r.id));
  const togglePage = () => {
    const n = new Set(sel);
    pageRows.forEach((r) => (pageAll ? n.delete(r.id) : n.add(r.id)));
    setSel(n);
  };
  const toggleRow = (id: string) => {
    const n = new Set(sel);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSel(n);
  };
  const bulkFields = p.fields.filter((x) => x.type === 'select' && !x.createOnly);

  const openAdd = () => { setEdit(null); setBulk(null); setForm({}); setErrs({}); setFormErr(''); };
  const openEdit = (r: any) => {
    const f: any = { id: r.id };
    p.fields.forEach((x) => {
      if (x.createOnly) return;
      const v = r[x.key] ?? '';
      f[x.key] = x.type === 'time' && v ? String(v).slice(0, 5) : v;
    });
    setForm(null); setBulk(null); setEdit(f); setErrs({}); setFormErr('');
  };
  const check = (v: any, creating: boolean) => {
    const e: Record<string, string> = {};
    for (const x of p.fields) {
      if (x.createOnly && !creating) continue;
      const val = v[x.key];
      const empty = val === '' || val === undefined || val === null;
      const need = x.required ?? x.type === 'select';
      if (need && empty) { e[x.key] = `${x.label} is required`; continue; }
      if (empty) continue;
      if (x.type === 'email' && !/^\S+@\S+\.\S+$/.test(String(val))) e[x.key] = 'Enter a valid email address';
      if (x.type === 'password') { const m = passwordProblem(String(val)); if (m) e[x.key] = m; }
      if (x.type === 'number' && (Number.isNaN(Number(val)) || Number(val) <= 0)) e[x.key] = 'Enter a number greater than 0';
      if (x.check) { const m = x.check(val); if (m) e[x.key] = m; }
    }
    return e;
  };
  const toBody = (v: any, creating: boolean) => {
    const body: any = { ...(creating ? p.defaults : {}) };
    for (const x of p.fields) {
      if (x.createOnly && !creating) continue;
      let val = v[x.key];
      if (val === '' || val === undefined) val = null;
      if (val !== null && x.type === 'number') val = Number(val);
      body[x.key] = val;
    }
    return body;
  };

  const saveAdd = guard(async (e: FormEvent) => {
    e.preventDefault(); setFormErr('');
    const er = check(form, true); setErrs(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      await api.create(p.table, toBody(form, true));
      ui.toast.success('Added successfully'); setForm(null); reload();
    } catch (e: any) { setFormErr(e.message); }
    setSaving(false);
  });
  const saveEdit = guard(async () => {
    setFormErr(''); const er = check(edit, false); setErrs(er);
    if (Object.keys(er).length) return;
    setSaving(true);
    try {
      await api.update(p.table, edit.id, toBody(edit, false));
      ui.toast.success('Changes saved'); setEdit(null); reload();
    } catch (e: any) { setFormErr(e.message); }
    setSaving(false);
  });
  const del = guard(async (r: any) => {
    const permanent = p.table === 'profiles';
    const ok = await ui.confirm({
      title: permanent ? 'Permanently delete this account?' : 'Move this record to Trash?',
      message: permanent ? 'This removes the user’s sign-in account and cannot be undone.' : 'Moved to Trash. Restore from History within 30 days.',
      confirmLabel: permanent ? 'Delete permanently' : 'Move to Trash', danger: true,
    });
    if (!ok) return;
    try { await api.remove(p.table, r.id); ui.toast.success(permanent ? 'Account permanently deleted' : 'Moved to Trash'); reload(); }
    catch (e: any) { ui.toast.error(e.message); }
  });
  const bulkDelete = guard(async () => {
    const permanent = p.table === 'profiles';
    const ok = await ui.confirm({
      title: `${permanent ? 'Permanently delete' : 'Move to Trash'} ${selRows.length} record(s)?`,
      message: permanent ? 'User sign-in accounts are removed permanently and cannot be restored.' : 'Moved to Trash. Restore from History within 30 days.',
      confirmLabel: permanent ? 'Delete permanently' : 'Move to Trash', danger: true,
    });
    if (!ok) return;
    const r = await runAll(selRows.map((x) => x.id), (id) => api.remove(p.table, id));
    if (r.fail) ui.toast.error(`${r.ok} ${permanent ? 'permanently deleted' : 'moved to Trash'}, ${r.fail} failed: ${r.msg}`);
    else ui.toast.success(`${r.ok} ${permanent ? 'permanently deleted' : 'moved to Trash'}`);
    setSel(new Set()); setBulk(null); reload();
  });
  const applyBulk = guard(async () => {
    const patch: any = {};
    bulkFields.forEach((x) => { if (bulk[x.key]) patch[x.key] = bulk[x.key]; });
    if (!Object.keys(patch).length) { setFormErr('Choose at least one field to change'); return; }
    setSaving(true); setFormErr('');
    const r = await runAll(selRows.map((x) => x.id), (id) => api.update(p.table, id, patch));
    setSaving(false);
    if (r.fail) ui.toast.error(`${r.ok} updated, ${r.fail} failed: ${r.msg}`);
    else ui.toast.success(`${r.ok} updated`);
    setSel(new Set()); setBulk(null); reload();
  });

  const control = (x: Field, v: any, set: (k: string, val: any) => void) => (
    <FieldControl key={x.key} label={x.label + ((x.required ?? x.type === 'select') ? ' *' : '')} error={errs[x.key]}>
      {x.type === 'select' ? (
        <select value={v[x.key] ?? ''} onChange={(e) => set(x.key, e.target.value)}>
          <option value="">Select</option>
          {x.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : <input type={x.type || 'text'} min={x.min} max={x.max} value={v[x.key] ?? ''} onChange={(e) => set(x.key, e.target.value)} />}
    </FieldControl>
  );
  const setAddVal = (k: string, v: any) => { setForm({ ...form, [k]: v }); if (errs[k]) setErrs({ ...errs, [k]: '' }); };
  const setEditVal = (k: string, v: any) => { setEdit({ ...edit, [k]: v }); if (errs[k]) setErrs({ ...errs, [k]: '' }); };
  const addVisible = p.fields;
  const editVisible = p.fields.filter((x) => !x.createOnly);
  const canMenu = p.allowEdit !== false || p.allowDelete !== false;

  return (
    <section className="card" data-tour="crud">
      <div className="bar">
        <h3>{p.title}{rows && <> <span className="badge gray">{shown.length}</span></>}</h3>
        <input placeholder="Search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} style={{ width: mobile ? '100%' : 200 }} />
        {!!p.filters?.length && (() => { const n = Object.values(fv).filter(Boolean).length; return (
          <div className="menu">
            <button className="ghost" onClick={() => setFOpen(!fOpen)}>Filter{n ? ` (${n})` : ''} ▾</button>
            {fOpen && <div className="menu-back" onClick={() => setFOpen(false)} />}
            {fOpen && <div className="menu-list" style={{ minWidth: 220, padding: 12, gap: 10 }}>
              {p.filters!.map((f) => <label key={f.key}>{f.label}
                <select value={fv[f.key] || ''} onChange={(e) => { setFv({ ...fv, [f.key]: e.target.value }); setPage(1); }}>
                  <option value="">All</option>{f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select></label>)}
              {n > 0 && <button className="ghost sm" onClick={() => { setFv({}); setPage(1); }}>Clear filters</button>}
            </div>}
          </div>); })()}
        {p.toolbar}
        <button className="ghost" disabled={locked} onClick={() => { setSelecting(!selecting); setSel(new Set()); setBulk(null); }}>{selecting ? 'Cancel' : 'Select'}</button>
        {p.allowAdd !== false && (p.addMenu?.length ? (
          <div className="menu">
            <button disabled={locked} onClick={() => setAddOpen(!addOpen)}>+ Add ▾</button>
            {addOpen && <div className="menu-back" onClick={() => setAddOpen(false)} />}
            {addOpen && <div className="menu-list">
              <button className="ghost sm" onClick={() => { setAddOpen(false); openAdd(); }}>Add manually</button>
              {p.addMenu.map((m) => <button key={m.label} className="ghost sm" onClick={() => { setAddOpen(false); m.onClick(); }}>{m.label}</button>)}
            </div>}
          </div>
        ) : <button disabled={locked} onClick={openAdd}>+ Add</button>)}
      </div>
      {p.hint && <p className="muted" style={{ marginTop: 0 }}>{p.hint}</p>}
      {loadErr && <div className="alert error">{loadErr}</div>}

      {form && <Modal title={`Add: ${p.title}`} onClose={() => setForm(null)} footer={<>
        <button type="button" className="ghost" onClick={() => setForm(null)}>Cancel</button>
        <button type="submit" form="crudform" disabled={saving || locked} aria-busy={saving || locked}>{saving ? 'Saving…' : 'Save'}</button>
      </>}>
        <form id="crudform" onSubmit={saveAdd} noValidate>
          {formErr && <div className="alert error">{formErr}</div>}
          <div className="fields">{addVisible.map((x) => control(x, form, setAddVal))}</div>
        </form>
      </Modal>}

      {edit && <Modal title={`Edit: ${p.title}`} onClose={() => setEdit(null)} footer={<>
        <button type="button" className="ghost" onClick={() => setEdit(null)}>Cancel</button>
        <button type="submit" form="editform" disabled={saving || locked} aria-busy={saving || locked}>{saving ? 'Saving…' : 'Save changes'}</button>
      </>}>
        <form id="editform" onSubmit={(e) => { e.preventDefault(); saveEdit(); }} noValidate>
          {formErr && <div className="alert error">{formErr}</div>}
          <div className="fields">{editVisible.map((x) => control(x, edit, setEditVal))}</div>
        </form>
        {p.editExtra && p.editExtra(rows?.find((r) => r.id === edit.id), reload)}
      </Modal>}

      {detail && mobile && (
        <Modal title={p.title} onClose={() => setDetailId('')} footer={
          <div className="mfoot" onClick={() => setDetailId('')}>
            {p.rowExtra?.(detail, reload)}
            {p.allowEdit !== false && <button className="ghost sm" onClick={() => { setDetailId(''); openEdit(detail); }}>Edit</button>}
            {p.allowDelete !== false && <button className="ghost red sm" onClick={() => del(detail)}>Delete</button>}
          </div>}>
          {p.cols.map((c) => (
            <div className="drow" key={c.key}><small>{c.label}</small><div>{c.render ? c.render(detail) : String(detail[c.key] ?? '-')}</div></div>
          ))}
        </Modal>
      )}

      {selecting && selRows.length > 0 && <div className="selbar">
        <span>{selRows.length} selected</span><span className="grow" />
        {p.allowEdit !== false && bulkFields.length > 0 && <button className="ghost sm" disabled={locked} onClick={() => { setEdit(null); setForm(null); setBulk({}); setFormErr(''); }}>Bulk edit</button>}
        {p.allowDelete !== false && <button className="ghost red sm" disabled={locked} onClick={bulkDelete}>Delete selected</button>}
        <button className="ghost sm" onClick={() => { setSel(new Set()); setBulk(null); }}>Clear</button>
      </div>}

      {selecting && bulk && selRows.length > 0 && <div className="inline-edit">
        <strong>Bulk edit {selRows.length} selected</strong>
        <p className="muted">Only fields that are safe to change for many rows are shown. Leave a field on “Keep current” to leave it unchanged.</p>
        {formErr && <div className="alert error">{formErr}</div>}
        <div className="fields">{bulkFields.map((x) => <FieldControl key={x.key} label={x.label}>
          <select value={bulk[x.key] ?? ''} onChange={(e) => setBulk({ ...bulk, [x.key]: e.target.value })}>
            <option value="">Keep current</option>{x.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </FieldControl>)}</div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="sm" disabled={saving || locked} aria-busy={saving || locked} onClick={applyBulk}>{saving ? 'Saving…' : 'Apply to selected'}</button>
          <button className="ghost sm" onClick={() => { setBulk(null); setFormErr(''); }}>Cancel</button>
        </div>
      </div>}

      {rows === null ? <TableSkeleton rows={6} cols={Math.max(2, p.cols.length)} /> : <>
        {mobile ? (
          <>
            <p className="mobhint">Tap a row for details · hold to select</p>
            <div className="mlist">
              {pageRows.map((r) => (
                <MobileRow key={r.id} r={r} cols={p.cols} selecting={selecting} selected={sel.has(r.id)}
                  onTap={() => (selecting ? toggleRow(r.id) : setDetailId(r.id))}
                  onHold={() => { setSelecting(true); setSel(new Set([r.id])); }} />
              ))}
              {!shown.length && <p className="empty">Nothing here yet.</p>}
            </div>
          </>
        ) : (
          <div className="scroll"><table>
            <thead><tr>{selecting && <th className="sel"><input type="checkbox" checked={pageAll} onChange={togglePage} aria-label="Select all" /></th>}
              {p.cols.map((c) => <th key={c.key}>{c.label}</th>)}<th /></tr></thead>
            <tbody>{pageRows.map((r) => <tr key={r.id} className={r.emergency ? 'danger' : r.status === 'unscheduled' ? 'warn' : ''}>
              {selecting && <td className="sel"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggleRow(r.id)} aria-label="Select row" /></td>}
              {p.cols.map((c) => <td key={c.key}>{c.render ? c.render(r) : String(r[c.key] ?? '')}</td>)}
              <td className="actions">{p.rowExtra?.(r, reload)}{canMenu && <RowMenu items={[
                ...(p.allowEdit !== false ? [{ label: 'Edit', onClick: () => openEdit(r) }] : []),
                ...(p.allowDelete !== false ? [{ label: 'Delete', danger: true, onClick: () => del(r) }] : []),
              ]} />}</td>
            </tr>)}
            {!shown.length && <tr><td colSpan={p.cols.length + (selecting ? 2 : 1)} className="empty">Nothing here yet.</td></tr>}</tbody>
          </table></div>
        )}
        <Pager total={shown.length} page={page} size={size} onPage={setPage} onSize={setSize} />
      </>}
    </section>
  );
}
