import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Badge, initials, Modal, TableSkeleton, useUi } from './ui';

const ROLE: Record<string, string> = { admin: 'Administrator', head: 'Department head', proctor: 'Proctor' };

export default function ProfileView({ userId, onClose }: { userId: string; onClose: () => void }) {
  const ui = useUi();
  const [d, setD] = useState<any>(null);
  useEffect(() => {
    api.action('user_profile', { user_id: userId }).then((x: any) => setD(x))
      .catch((e) => { ui.toast.error(e.message); onClose(); });
  }, [userId]);
  const p = d?.profile;
  const item = (label: string, value: any) => <div><small className="muted">{label}</small><div>{value ?? '-'}</div></div>;

  return (
    <Modal title="Profile" onClose={onClose} footer={<button onClick={onClose}>Close</button>}>
      {!d ? <TableSkeleton rows={4} cols={2} /> : <>
        <div className="row" style={{ marginBottom: 16, gap: 16 }}>
          {p.avatar_url ? <img className="pfp" src={p.avatar_url} alt="" /> : <span className="pfp">{initials(p.full_name)}</span>}
          <div><h3 style={{ margin: '0 0 6px' }}>{p.full_name}</h3><Badge tone="blue">{ROLE[p.role] || p.role}</Badge></div>
        </div>
        <div className="fields" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {item('Email', p.email)}
          {item('Department', p.department ? `${p.department.code} - ${p.department.name}` : 'Unassigned')}
          {p.role === 'proctor' && item('Time availability', d.availability_days
            ? <Badge tone="green">Available · {d.availability_days} day(s), {d.availability_hours} hr</Badge>
            : <Badge tone="amber">Not available</Badge>)}
          {p.role === 'proctor' && item('Exam hours assigned', d.exams)}
        </div>
      </>}
    </Modal>
  );
}
