import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { Avatar } from './ui';
import Icon from './icons';

const ROLE = { admin: 'Admin', head: 'Department head', proctor: 'Proctor' };
const sub = (u) => `${ROLE[u.role] || u.role}${u.department?.code ? ` · ${u.department.code}` : ''}`;
const clock = (iso) => new Date(iso).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
const dayKey = (iso) => new Date(iso).toDateString();
const dayLabel = (iso) => new Date(iso).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
const ago = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} day(s) ago`;
};

export default function ChatPanel({ open, onClose, onUnread }) {
  const [view, setView] = useState('list');
  const [convos, setConvos] = useState([]);
  const [people, setPeople] = useState(null);
  const [q, setQ] = useState('');
  const [peer, setPeer] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const peerRef = useRef(null);
  const end = useRef(null);

  const loadConvos = () => api.get('chat?action=conversations')
    .then((c) => { setConvos(c); onUnread?.(c.reduce((n, x) => n + x.unread, 0)); })
    .catch(() => {});
  const loadThread = (id) => api.get(`chat?action=messages&with=${id}`)
    .then((m) => {
      if (peerRef.current !== id) return;
      setMsgs((old) => (old.length === m.length && old[old.length - 1]?.id === m[m.length - 1]?.id ? old : m));
    }).catch(() => {});

  useEffect(() => {
    if (!open) return;
    loadConvos();
    if (peerRef.current) loadThread(peerRef.current);
    const t = setInterval(() => {
      loadConvos();
      if (peerRef.current) loadThread(peerRef.current);
    }, 5000);
    return () => clearInterval(t);
  }, [open]);

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [msgs.length, view]);

  const openThread = (user) => {
    peerRef.current = user.id;
    setPeer(user); setMsgs([]); setErr(''); setText(''); setView('thread');
    loadThread(user.id).then(loadConvos);
  };
  const backToList = () => { peerRef.current = null; setPeer(null); setView('list'); loadConvos(); };
  const startNew = () => {
    setView('people'); setQ('');
    if (!people) api.get('chat?action=people').then(setPeople).catch((e) => { setErr(e.message); setPeople([]); });
  };

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending || !peer) return;
    setSending(true); setErr('');
    try {
      const m = await api.post('chat', { to: peer.id, body });
      setMsgs((l) => [...l, m]); setText(''); loadConvos();
    } catch (x) { setErr(x.message); }
    setSending(false);
  };

  const shown = (people || []).filter((p) => {
    const s = `${p.full_name} ${ROLE[p.role] || ''} ${p.department?.code || ''}`.toLowerCase();
    return !q || s.includes(q.toLowerCase());
  });

  return (
    <div className={`notifpanel ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="np-head">
        {view === 'thread' && peer ? <>
          <button className="ghost sm" onClick={backToList} aria-label="Back to messages">‹</button>
          <h3><Avatar name={peer.full_name} src={peer.avatar_url} />
            <span className="ntext"><b>{peer.full_name}</b><small>{sub(peer)}</small></span></h3>
        </> : view === 'people' ? <>
          <h3>New message</h3>
          <button className="ghost sm" onClick={() => setView('list')}>Back</button>
        </> : <>
          <h3>Messages</h3>
          <button className="ghost sm" onClick={startNew}>+ New</button>
        </>}
        <button type="button" className="x" onClick={onClose} aria-label="Close messages">×</button>
      </div>

      {view === 'list' && (
        <div className="np-list">
          {convos.map((c) => (
            <button key={c.user.id} className={`nitem ${c.unread ? 'unread' : ''}`} onClick={() => openThread(c.user)}>
              <Avatar name={c.user.full_name} src={c.user.avatar_url} />
              <span className="ntext">
                <b>{c.user.full_name}</b>
                <span className="cprev">{c.last.mine ? 'You: ' : ''}{c.last.body}</span>
                <small>{sub(c.user)} · {ago(c.last.created_at)}</small>
              </span>
              {c.unread > 0 && <b className="cbadge">{c.unread}</b>}
            </button>
          ))}
          {!convos.length && <p className="muted" style={{ padding: 16 }}>No conversations yet. Press “+ New” to message someone.</p>}
        </div>
      )}

      {view === 'people' && (
        <div className="np-list">
          {err && <div className="alert error">{err}</div>}
          <input className="searchbox" placeholder="Search by name, role or department" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {people === null && <p className="muted" style={{ padding: 8 }}>Loading…</p>}
          {shown.map((p) => (
            <button key={p.id} className="nitem" onClick={() => openThread(p)}>
              <Avatar name={p.full_name} src={p.avatar_url} />
              <span className="ntext"><b>{p.full_name}</b><small>{sub(p)}</small></span>
            </button>
          ))}
          {people && !shown.length && <p className="muted" style={{ padding: 8 }}>Nobody matches.</p>}
        </div>
      )}

      {view === 'thread' && <>
        <div className="np-list chat">
          {!msgs.length && <p className="muted" style={{ margin: '4px 2px' }}>Say hello to {peer?.full_name.split(' ')[0]}.</p>}
          {msgs.map((m, i) => (
            <div key={m.id} style={{ display: 'contents' }}>
              {(i === 0 || dayKey(msgs[i - 1].created_at) !== dayKey(m.created_at)) && <small className="cday">{dayLabel(m.created_at)}</small>}
              <div className={`msg ${m.mine ? 'user' : 'bot'}`}>
                {m.body}
                <small className="mt">{clock(m.created_at)}{m.mine && m.read ? ' · Seen' : ''}</small>
              </div>
            </div>
          ))}
          <div ref={end} />
        </div>
        {err && <div className="alert error" style={{ margin: '0 12px' }}>{err}</div>}
        <form className="chatform" onSubmit={send}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message…" maxLength={1000} />
          <button type="submit" className="iconbtn" disabled={sending || !text.trim()} aria-label="Send"><Icon name="send" size={16} /></button>
        </form>
      </>}
    </div>
  );
}
