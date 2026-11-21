import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, TableSkeleton, useUi } from './ui';

const TYPE: Record<string, string> = {
  departments: 'Department', programs: 'Program', subjects: 'Subject', sections: 'Section', rooms: 'Room', exam_periods: 'Exam period',
};
const daysLeft = (date: string) => Math.max(0, 30 - Math.floor((Date.now() - new Date(date).getTime()) / 86400000));

export default function Trash() {
  const ui = useUi();
  const [rows, setRows] = useState<any[] | null>(null);
  const [busy, setBusy] = useState('');
  const reload = () => api.list('trash').then(setRows).catch((e) => { ui.toast.error(e.message); setRows([]); });
  useEffect(() => { reload(); }, []);

  const restore = async (item: any) => {
    setBusy(item.id);
    try { await api.restore(item.id); ui.toast.success('Item restored'); reload(); }
    catch (e: any) { ui.toast.error(e.message); }
    setBusy('');
  };
  const purge = async (item: any) => {
    const yes = await ui.confirm({ title: 'Delete this item forever?', message: 'This permanently removes the saved item and cannot be undone.', confirmLabel: 'Delete forever', danger: true });
    if (!yes) return;
    setBusy(item.id);
    try { await api.remove('trash', item.id); ui.toast.success('Item permanently deleted'); reload(); }
    catch (e: any) { ui.toast.error(e.message); }
    setBusy('');
  };
  const empty = async () => {
    const yes = await ui.confirm({ title: 'Empty Trash?', message: 'All deleted items will be permanently removed. This cannot be undone.', confirmLabel: 'Empty trash', danger: true });
    if (!yes) return;
    setBusy('all');
    try { await api.emptyTrash(); ui.toast.success('Trash emptied'); reload(); }
    catch (e: any) { ui.toast.error(e.message); }
    setBusy('');
  };

  return <section className="card">
    <div className="bar"><h3>Trash {rows && <span className="badge gray">{rows.length}</span>}</h3><span style={{ flex: 1 }} />
      <button className="ghost red" disabled={!rows?.length || !!busy} onClick={empty}>Empty trash</button>
    </div>
    <p className="muted">Items are permanently removed after 30 days. Restoring a parent restores its saved cascade children too.</p>
    {rows === null ? <TableSkeleton rows={5} cols={5} /> : <div className="scroll"><table>
      <thead><tr><th>Item</th><th>Type</th><th>Deleted by</th><th>Auto-deletes in</th><th /></tr></thead>
      <tbody>{rows.map((r) => {
        const days = daysLeft(r.deleted_at);
        return <tr key={r.id}>
          <td>{r.label || 'Unnamed item'}</td><td>{TYPE[r.entity] || r.entity}</td><td>{r.deleted_by_name || 'Unknown'}</td>
          <td><Badge tone={days <= 3 ? 'amber' : 'gray'}>{days} day{days === 1 ? '' : 's'}</Badge></td>
          <td className="actions"><button className="sm" disabled={!!busy} onClick={() => restore(r)}>{busy === r.id ? 'Restoring…' : 'Restore'}</button>
            <button className="ghost red sm" disabled={!!busy} onClick={() => purge(r)}>Delete forever</button></td>
        </tr>;
      })}{!rows.length && <tr><td colSpan={5} className="empty">Trash is empty.</td></tr>}</tbody>
    </table></div>}
  </section>;
}
