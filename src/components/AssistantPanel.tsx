import { FormEvent, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import Icon from './icons';

interface Msg { role: 'user' | 'assistant'; content: string; links?: { label: string; to: string }[]; error?: boolean }

const SUGGEST: Record<string, string[]> = {
  manager: ['How many proctors are available today?', 'Which sections are still pending a proctor or room?', 'Any proctor emergencies?', 'How do I generate a schedule?', 'Which exams could not be placed?', 'Pending account requests'],
  proctor: ['What is my next exam?', 'Which open assignments can I accept?', 'How do I add my availability?', 'How do I flag an emergency?', 'How many hours before the exam can I accept?'],
};

export default function AssistantPanel({ open, role, onClose, onGo }: {
  open: boolean; role: string; onClose: () => void; onGo: (to: string) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  const send = async (q = text) => {
    q = q.trim();
    if (!q || busy) return;
    const next: Msg[] = [...msgs, { role: 'user', content: q }];
    setMsgs(next); setText(''); setBusy(true);
    try {
      const r = await api.assistant(next.map(({ role: msgRole, content }) => ({ role: msgRole, content })));
      setMsgs([...next, { role: 'assistant', content: r.reply, links: r.links }]);
    } catch (e: any) {
      setMsgs([...next, { role: 'assistant', content: e.message || 'Something went wrong.', error: true }]);
    }
    setBusy(false);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); send(); };

  return (
    <div className={`notifpanel ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="np-head">
        <h3>Assistant</h3>
        {msgs.length > 0 && <button className="ghost sm" onClick={() => setMsgs([])}>Clear</button>}
        <button type="button" className="x" onClick={onClose} aria-label="Close assistant">×</button>
      </div>
      <div className="np-list chat">
        {!msgs.length && (
          <div className="sugg">
            <p className="muted" style={{ margin: '4px 2px' }}>Ask about your data or how to use Accord.</p>
            {SUGGEST[role === 'proctor' ? 'proctor' : 'manager'].map((s) => (
              <button key={s} className="ghost sm" onClick={() => send(s)}>{s}</button>
            ))}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role === 'user' ? 'user' : 'bot'} ${m.error ? 'err' : ''}`}>
            {m.content}
            {!!m.links?.length && (
              <div className="msglinks">
                {m.links.map((l) => <button key={l.to} className="ghost sm" onClick={() => onGo(l.to)}>{l.label} ›</button>)}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="msg bot muted">Thinking…</div>}
        <div ref={end} />
      </div>
      <form className="chatform" onSubmit={submit}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask something…" maxLength={500} />
        <button type="submit" className="iconbtn" disabled={busy || !text.trim()} aria-label="Send"><Icon name="send" size={16} /></button>
      </form>
    </div>
  );
}
