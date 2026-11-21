import { Badge } from './ui';

const CLICKABLE = ['emergency', 'bulletin', 'requests', 'assignment', 'availability', 'period_ended', 'approval'];
const ago = (iso: string) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} day(s) ago`;
};

export default function NotificationPanel({ open, notes, onClose, onOpen, onReadAll }: {
  open: boolean; notes: any[]; onClose: () => void; onOpen: (n: any) => void; onReadAll: () => void;
}) {
  const unread = notes.filter((n) => !n.read).length;
  return (
    <div className={`notifpanel ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="np-head">
        <h3>Notifications {unread > 0 && <Badge tone="red">{unread}</Badge>}</h3>
        <button className="ghost sm" disabled={!unread} onClick={onReadAll}>Mark all read</button>
        <button type="button" className="x" onClick={onClose} aria-label="Close notifications">×</button>
      </div>
      <div className="np-list">
        {notes.map((n) => (
          <button key={n.id} className={`nitem ${n.read ? '' : 'unread'}`} onClick={() => onOpen(n)}>
            <i className="ndot" />
            <span className="ntext">
              <b>{n.title}</b>
              {n.body && <span>{n.body}</span>}
              <small>{ago(n.created_at)}{CLICKABLE.includes(n.kind) ? ' · tap to open' : ''}</small>
            </span>
          </button>
        ))}
        {!notes.length && <p className="muted" style={{ padding: 16 }}>No notifications yet.</p>}
      </div>
    </div>
  );
}
