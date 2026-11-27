import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

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
  { t: 'nav-/', go: '/', title: 'Dashboard', body: 'Your overview of everything happening in the exam periods. Let’s look inside.' },
  { t: 'dash-tiles', go: '/', title: 'Summary tiles', body: 'Scheduled sections, available proctors, rooms and emergency flags. Click a tile to jump to its page or section.' },
  { t: 'dash-cal', go: '/', title: 'Calendar', body: 'Dates in blue have exams. Click a date to see its exams, or search by section, subject, room or proctor.' },
  { t: 'dash-emg', go: '/', title: 'Proctor emergencies', body: 'Exams whose proctor reported an emergency. Use Find replacement to pick a free proctor.' },
  { t: 'dash-avail', go: '/', title: 'Available proctors', body: 'Proctors who entered availability and have no exams yet. Filter by Assigned or All.' },
  { t: 'nav-/periods', go: '/periods', title: 'Exam periods', body: 'Create a period, generate the schedule, fix problems and export. Let’s look inside.' },
  { t: 'per-bar', go: '/periods', title: 'Period controls', body: 'Choose a period, set how late proctors can accept open blocks, then Generate, Edit, Approve (admins) or Delete.' },
  { t: 'per-tiles', go: '/periods', title: 'Period summary', body: 'Sections, scheduled and unscheduled sections, and exam days used. Click Unscheduled to see only problems.' },
  { t: 'per-filter', go: '/periods', title: 'Filters and export', body: 'Filter by program or problems, expand a department, open a year level to edit blocks, and download PDF/PNG/CSV.' },
  { t: 'nav-/config', go: '/config', title: 'Configuration', body: 'Set up your data. Let’s look inside.' },
  { t: 'cfg-tabs', go: '/config', title: 'Setup tabs', body: 'Programs, subjects, sections, rooms, proctors and account requests. Admins also manage departments and heads.' },
  { t: 'crud', go: '/config', title: 'Tables', body: 'Search, filter, add, edit or delete. Use Select for bulk actions. You can import rooms from a spreadsheet and curriculum from PDFs.' },
  { t: 'nav-/reports', go: '/reports', title: 'Reports', body: 'Charts and numbers for a period. Let’s look inside.' },
  { t: 'rep-bar', go: '/reports', title: 'Period and export', body: 'Pick the exam period and download the full report as CSV, PDF or PNG.' },
  { t: 'rep-tiles', go: '/reports', title: 'Report numbers', body: 'Below are placement rate, exams per day, proctor workload, room usage and a list of exams that could not be placed.' },
  { t: 'nav-/history', go: '/history', title: 'History', body: 'Everything that happened in the system. Let’s look inside.' },
  { t: 'hist-tabs', go: '/history', title: 'History tabs', body: 'Activity shows who did what. Previous exam periods keeps ended periods for download. Trash restores deleted records within 30 days.' },
  ...TAIL,
];

const PROCTOR = [
  { title: 'Welcome to Accord', body: 'Accord shows you the exams you proctor and lets you pick up open ones. Here is a quick look around.' },
  { t: 'nav-/availability', go: '/availability', title: 'My availability', body: 'Enter the days and hours you are free before an exam period starts. Availability locks once the period begins.' },
  { t: 'nav-/requests', go: '/requests', title: 'Assignment requests', body: 'Open exam blocks with no proctor yet. Accept the ones that fit your schedule before the cutoff set for that period.' },
  { t: 'nav-/my-schedule', go: '/my-schedule', title: 'My schedule', body: 'Your assigned exams with date, time, room and subjects. If something comes up, flag an emergency here.' },
  ...TAIL,
];

export default function Tour({ role, onClose }) {
  const steps = role === 'proctor' ? PROCTOR : MANAGER;
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [i, setI] = useState(0);
  const [rect, setRect] = useState(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const card = useRef(null);
  const step = steps[i];
  const last = i === steps.length - 1;
  const find = () => (step.t ? document.querySelector(`[data-tour="${step.t}"]`) : null);
  const finish = () => { nav(role === 'proctor' ? '/my-schedule' : '/'); window.scrollTo(0, 0); onClose(); };

  const measure = () => {
    const r = find()?.getBoundingClientRect();
    setRect(r && (r.width || r.height) ? { left: r.left, top: r.top, width: r.width, height: r.height } : null);
  };

  // Go to the step's page, then wait for the element to appear (pages load data first).
  useEffect(() => {
    if (step.go && step.go !== pathname) nav(step.go);
    if (!step.t) window.scrollTo(0, 0);
    setRect(null);
    let tries = 0;
    const id = setInterval(() => {
      const el = find();
      if (el) {
        const r = el.getBoundingClientRect();
        if (!el.closest('aside,.topbar') && (r.top < 90 || r.bottom > window.innerHeight - 20))
          el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? 'start' : 'center' });
        measure(); clearInterval(id);
      } else if (++tries > 30) clearInterval(id);
    }, 100);
    return () => clearInterval(id);
  }, [i]);

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
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight') last ? finish() : setI((n) => n + 1);
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
          {!last && <button className="ghost sm" onClick={finish}>Skip tour</button>}
          <span className="grow" />
          {i > 0 && <button className="ghost sm" onClick={() => setI(i - 1)}>Back</button>}
          <button className="sm" autoFocus onClick={() => (last ? finish() : setI(i + 1))}>{last ? 'Finish' : 'Next'}</button>
        </div>
      </div>
    </div>
  );
}
