import { Avatar, Badge } from './ui';

export interface Candidate {
  id: string;
  full_name: string;
  avatar_url?: string | null;
  dept: string;
  load: number;
  same_department: boolean;
  whole_day?: boolean;
}

export default function ProctorPicker({ candidates, selected, onSelect, self }: {
  candidates: Candidate[]; selected: string; onSelect: (id: string) => void;
  self?: { id: string; full_name: string; free: boolean } | null;
}) {
  const groups = [
    { title: 'Same department', rows: candidates.filter((c) => c.same_department) },
    { title: 'Other departments', rows: candidates.filter((c) => !c.same_department) },
  ];
  return <>
    {!candidates.length && !self?.free && <div className="alert error">No proctor is free for those hours.</div>}
    {self && <div className="pgroup">
      <h5>Cover it yourself</h5>
      <div className="plist"><label className={`pick ${selected === self.id ? 'on' : ''} ${self.free ? '' : 'over'}`}>
        <input type="radio" name="proctor-picker" disabled={!self.free} checked={selected === self.id} onChange={() => onSelect(self.id)} />
        <span className="who-cell"><Avatar name={self.full_name} />{self.full_name} (you)</span>
        <span className="muted">{self.free ? 'Takes effect right away' : 'You have an exam at those hours'}</span><span />
      </label></div>
    </div>}
    {groups.map(({ title, rows }) => rows.length > 0 && <div className="pgroup" key={title}>
      <h5>{title} <span>{rows.length}</span></h5>
      <div className="plist">{rows.map((c) => <label key={c.id} className={`pick ${selected === c.id ? 'on' : ''}`}>
        <input type="radio" name="proctor-picker" checked={selected === c.id} onChange={() => onSelect(c.id)} />
        <span className="who-cell"><Avatar name={c.full_name} src={c.avatar_url} />{c.full_name} {c.id === candidates[0]?.id && <Badge tone="green">Best match</Badge>} {c.whole_day && <Badge tone="green">Whole day</Badge>}</span>
        <span className="muted">{c.dept}</span><span className="muted">{c.load} assigned</span>
      </label>)}</div>
    </div>)}
  </>;
}
