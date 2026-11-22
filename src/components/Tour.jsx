import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const TAIL = [
  { t: 'bulletin', title: 'Bulletin', body: 'Announcements for the whole school or your department appear here. A red dot means something new was posted.' },
  { t: 'chat', title: 'Messages', body: 'Send a private message to any other Accord user. A red dot means you have an unread message.' },
  { t: 'notifications', title: 'Notifications', body: 'Assignments, approvals, emergencies and reminders show up here. We also email them to you.' },
  { t: 'assistant', title: 'Assistant', body: 'Ask about your data or how to use Accord, for example “What is my next exam?”.' },
  { t: 'settings', title: 'Settings', body: 'Change your password, switch between light and dark mode and pick a theme colour.' },
  { t: 'profile', title: 'Your profile', body: 'Click your name to change your photo, name or email.' },
  { title: 'You are all set', body: 'That is everything. This tour only plays the first time you log in.' },
];

const MANAGER = [
  { title: 'Welcome to Accord', body: 'Accord builds and manages exam schedules for La Concepcion College. Here is a quick look around. It takes about a minute.' },
  { t: 'nav-/', title: 'Dashboard', body: 'Your overview: today’s exams, available proctors, emergencies and exams that still need a proctor or room.' },
  { t: 'nav-/periods', title: 'Exam periods', body: 'Create a period, generate the schedule, fix unplaced exams, edit blocks (proctor, room, swap, reschedule) and export as PDF or PNG. Admins approve the final schedule here.' },
  { t: 'nav-/config', title: 'Configuration', body: 'Set up programs, subjects, sections, rooms and proctors. You can import rooms from a spreadsheet and curriculum from evaluation-sheet PDFs. New account requests are approved here too.' },
  { t: 'nav-/reports', title: 'Reports', body: 'Placement rate, exams per day, proctor workload and room usage, with a downloadable report.' },
  { t: 'nav-/history', title: 'History', body: 'See who did what, and restore deleted records from Trash within 30 days.' },
  ...TAIL,
];

const PROCTOR = [
  { title: 'Welcome to Accord', body: 'Accord shows you the exams you proctor and lets you pick up open ones. Here is a quick look around.' },
  { t: 'nav-/availability', title: 'My availability', body: 'Enter the days and hours you are free before an exam period starts. Availability locks once the period begins.' },
  { t: 'nav-/requests', title: 'Assignment requests', body: 'Open exam blocks with no proctor yet. Accept the ones that fit your schedule before the cutoff set for that period.' },
  { t: 'nav-/my-schedule', title: 'My schedule', body: 'Your assigned exams with date, time, room and subjects. If something comes up, flag an emergency here.' },
  ...TAIL,
];

export default function Tour({ role, onClose }) {
  const steps = role === 'proctor' ? PROCTOR : MANAGER;
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const card = useRef(null);
  const step = steps[i];
  const last = i === steps.length - 1;
  const find = () => (step.t ? document.querySelector(`[data-tour="${step.t}"]`) : null);

  const measure = () => {
    const el = find();
    const r = el?.getBoundingClientRect();
    setRect(r && (r.width || r.height) ? { left: r.left, top: r.top, width: r.width, height: r.height } : null);
  };

  useLayoutEffect(() => { find()?.scrollIntoView?.({ block: 'nearest' }); measure(); }, [i]);
  useEffect(() => {
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [i]);

  useLayoutEffect(() => {
    const w = card.current?.offsetWidth || 340, h = card.current?.offsetHeight || 220;
    const vw = window.innerWidth, vh = window.innerHeight, g = 16;
    let left = (vw - w) / 2, top = (vh - h) / 2;
    if (rect) {
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
      if (rect.left + rect.width + g + w <= vw - 8) { left = rect.left + rect.width + g; top = cy - h / 2; }
      else if (rect.left - g - w >= 8) { left = rect.left - g - w; top = cy - h / 2; }
      else if (rect.top + rect.height + g + h <= vh - 8) { top = rect.top + rect.height + g; left = cx - w / 2; }
      else { top = rect.top - g - h; left = cx - w / 2; }
    }
    setPos({ left: Math.min(Math.max(8, left), vw - w - 8), top: Math.min(Math.max(8, top), vh - h - 8) });
  }, [rect, i]);

  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') last ? onClose() : setI((n) => n + 1);
      if (e.key === 'ArrowLeft') setI((n) => Math.max(0, n - 1));
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [last]);

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Accord tour">
      {rect
        ? <div className="tour-hole" style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} />
        : <div className="tour-dim" />}
      <div className="tour-card" ref={card} style={{ left: pos.left, top: pos.top }}>
        <small>Step {i + 1} of {steps.length}</small>
        <h4>{step.title}</h4>
        <p>{step.body}</p>
        <div className="tour-actions">
          {!last && <button className="ghost sm" onClick={onClose}>Skip tour</button>}
          <span className="grow" />
          {i > 0 && <button className="ghost sm" onClick={() => setI(i - 1)}>Back</button>}
          <button className="sm" autoFocus onClick={() => (last ? onClose() : setI(i + 1))}>{last ? 'Finish' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}
