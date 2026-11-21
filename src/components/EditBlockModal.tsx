import { useEffect, useState } from 'react';
import { api, floorLabel, SLOT_TIMES } from '../lib/api';
import { Badge, Modal, useUi } from './ui';
import ProctorPicker, { Candidate } from './ProctorPicker';

type Tab = 'proctor' | 'room' | 'swap' | 'move';
interface RoomChoice { id: string; name: string; floor: string; capacity: number; fits: boolean }
interface SwapChoice { with_id: string; label: string; room: string; fits: boolean; fitsMe: boolean; fitsThem: boolean }

export default function EditBlockModal({ scheduleId, initialTab = 'proctor', onClose, onDone }: {
  scheduleId: string; initialTab?: Tab; onClose: () => void; onDone: () => void;
}) {
  const ui = useUi();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [self, setSelf] = useState<any>(null);
  const [fallback, setFallback] = useState(false);
  const [proctor, setProctor] = useState('');
  const [rooms, setRooms] = useState<RoomChoice[]>([]);
  const [swaps, setSwaps] = useState<SwapChoice[]>([]);
  const [room, setRoom] = useState('');
  const [swap, setSwap] = useState('');
  const [moveDate, setMoveDate] = useState('');
  const [moveStart, setMoveStart] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.action('candidates', { schedule_id: scheduleId }) as Promise<any>,
      api.action('room_options', { schedule_id: scheduleId }) as Promise<any>,
    ]).then(([p, r]) => {
      setCandidates(p.candidates || []); setFallback(!!p.fallback); setSelf(p.self || null); setProctor(p.candidates?.[0]?.id || (p.self?.free ? p.self.id : ''));
      const available: RoomChoice[] = r.rooms || [];
      setRooms(available); setRoom(available.find((x) => x.fits)?.id || available[0]?.id || '');
      setSwaps(r.swaps || []); setSwap(r.swaps?.[0]?.with_id || '');
    }).catch((e: any) => setError(e.message || 'Could not load edit options')).finally(() => setLoading(false));
  }, [scheduleId]);

  const complete = () => { ui.toast.success('Exam block updated'); onDone(); onClose(); };
  const withCapacityOverride = async (action: 'set_room' | 'swap_room', body: any) => {
    try { await api.action(action, body); complete(); }
    catch (e: any) {
      if (e.code !== 'capacity') throw e;
      const yes = await ui.confirm({ title: 'Room is too small', message: `${e.message}. Use anyway?`, confirmLabel: 'Use anyway', danger: true });
      if (!yes) return;
      await api.action(action, { ...body, override: true });
      complete();
    }
  };
  const submit = async () => {
    setBusy(true); setError('');
    try {
      if (tab === 'proctor') {
        await api.action('reassign', { schedule_id: scheduleId, proctor_id: proctor });
        complete();
      } else if (tab === 'room') {
        await withCapacityOverride('set_room', { schedule_id: scheduleId, room_id: room });
      } else if (tab === 'move') {
        const r: any = await api.action('reschedule', { schedule_id: scheduleId, exam_date: moveDate, start_time: moveStart });
        if (r.released) ui.toast.info('The proctor is not free then, so this block is now open for any proctor to accept.');
        complete();
      } else {
        await withCapacityOverride('swap_room', { schedule_id: scheduleId, with_id: swap });
      }
    } catch (e: any) { setError(e.message || 'Could not update this block'); }
    setBusy(false);
  };

  const actionLabel = tab === 'proctor' ? 'Assign proctor' : tab === 'room' ? 'Change room' : tab === 'swap' ? 'Swap rooms' : 'Reschedule';
  return <Modal wide title="Edit exam block" onClose={onClose} footer={<>
    <button className="ghost" onClick={onClose}>Cancel</button>
    <button disabled={busy || loading || (tab === 'proctor' ? !proctor : tab === 'room' ? !room : tab === 'swap' ? !swap : !(moveDate && moveStart))} onClick={submit}>
      {busy ? 'Saving…' : actionLabel}
    </button>
  </>}>
    <div className="tabs block-tabs">
      {(['proctor', 'room', 'swap', 'move'] as Tab[]).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => { setTab(t); setError(''); }}>
        {t === 'proctor' ? 'Proctor' : t === 'room' ? 'Room' : t === 'swap' ? 'Swap' : 'Reschedule'}
      </button>)}
    </div>
    {error && <div className="alert error">{error}</div>}
    {loading ? <p className="muted">Checking available options…</p> : <>
      {tab === 'proctor' && <>
        <p className="muted" style={{ marginTop: 0 }}>{fallback
          ? 'No proctor with entered availability covers these hours, so proctors who have not entered availability are shown.'
          : 'Candidates are free for all hours in this block and sorted by best match.'}</p>
        <ProctorPicker candidates={candidates} selected={proctor} onSelect={setProctor} self={self} />
      </>}
      {tab === 'room' && <>
        <p className="muted" style={{ marginTop: 0 }}>Choose a room available for every hour in this block. Rooms that cannot fit the section are shown as over capacity.</p>
        {!rooms.length ? <p className="muted">No other room is free for those hours.</p> : <div className="plist room-options">
          {rooms.map((r, i) => <label key={r.id} className={`pick ${room === r.id ? 'on' : ''} ${r.fits ? '' : 'over'}`}>
            <input type="radio" name="room-choice" checked={room === r.id} onChange={() => setRoom(r.id)} />
            <span>{r.name} {r.fits && i === 0 && <Badge tone="green">Best</Badge>}</span>
            <span className="muted">{floorLabel(r.floor)} · capacity {r.capacity}</span>
            {!r.fits && <Badge tone="amber">Over capacity</Badge>}
          </label>)}
        </div>}
      </>}
      {tab === 'swap' && <>
        <p className="muted" style={{ marginTop: 0 }}>Trade this section’s room with another section scheduled on the same date.</p>
        {!swaps.length ? <p className="muted">No compatible room swaps are available.</p> : <div className="plist room-options">
          {swaps.map((s) => <label key={s.with_id} className={`pick ${swap === s.with_id ? 'on' : ''}`}>
            <input type="radio" name="swap-choice" checked={swap === s.with_id} onChange={() => setSwap(s.with_id)} />
            <span>{s.label}</span><span className="muted">Trade for {s.room}</span>
            {!s.fits && <Badge tone="amber">{[!s.fitsMe && 'Their room too small for this section', !s.fitsThem && 'This room too small for them'].filter(Boolean).join(' · ')}</Badge>}
          </label>)}
        </div>}
      </>}
      {tab === 'move' && <>
        <p className="muted" style={{ marginTop: 0 }}>Move this whole block to another date and start hour. The room stays the same. If the proctor is not free then, the block becomes open for any proctor to accept.</p>
        <div className="fields">
          <label><span>New date</span><input type="date" value={moveDate} onChange={(e) => setMoveDate(e.target.value)} /></label>
          <label><span>Start hour</span><select value={moveStart} onChange={(e) => setMoveStart(e.target.value)}>
            <option value="">Select</option>{SLOT_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select></label>
        </div>
      </>}
    </>}
  </Modal>;
}
