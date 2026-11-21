import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, TableSkeleton, useUi } from './ui';
import { SEM } from '../lib/periods';

export default function EndedPeriods() {
  const ui = useUi();
  const [periods, setPeriods] = useState<any[] | null>(null);
  const [sched, setSched] = useState<any[]>([]);
  useEffect(() => {
    api.list('exam_periods').then((p) => setPeriods(p.filter((x) => x.status === 'ended')))
      .catch((e) => { ui.toast.error(e.message); setPeriods([]); });
    api.list('schedules').then(setSched).catch(() => {});
  }, []);
  const count = (id: string, status: string) => sched.filter((s) => s.period_id === id && s.status === status).length;

  return <section className="card">
    <div className="bar"><h3>Ended exam periods {periods && <Badge tone="gray">{periods.length}</Badge>}</h3></div>
    <p className="muted" style={{ marginTop: 0 }}>Periods move here automatically after their last day. The full breakdown stays available in Reports.</p>
    {periods === null ? <TableSkeleton rows={4} cols={5} /> : <div className="scroll"><table>
      <thead><tr><th>Period</th><th>Semester</th><th>Dates</th><th>Programs</th><th>Exams placed</th><th>Not placed</th></tr></thead>
      <tbody>{periods.map((p) => <tr key={p.id}>
        <td>{p.name} <Badge tone="gray">Ended</Badge></td><td>{SEM[p.semester]}</td>
        <td>{p.start_date} to {p.end_date}</td><td>{p.program_ids?.length || 0}</td>
        <td>{count(p.id, 'scheduled')}</td><td>{count(p.id, 'unscheduled')}</td>
      </tr>)}
      {!periods.length && <tr><td colSpan={6} className="empty">No exam period has ended yet.</td></tr>}</tbody>
    </table></div>}
  </section>;
}
