import { useEffect, useRef, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { api, Me } from './lib/api';
import { MeCtx } from './lib/me';
import Logo, { LogoMark } from './components/Logo';
import Icon, { IconName } from './components/icons';
import { Avatar, useUi } from './components/ui';
import { SettingsModal, ProfileModal } from './components/AccountModals';
import Login from './pages/Login';
import Overview from './pages/Overview';
import Periods from './pages/Periods';
import Config from './pages/Config';
import Reports from './pages/Reports';
import History from './pages/History';
import MySchedule from './pages/MySchedule';
import Availability from './pages/Availability';
import Requests from './pages/Requests';
import NotificationPanel from './components/NotificationPanel';
import OtpGate from './components/OtpGate';
import BulletinPanel from './components/BulletinPanel';
import AssistantPanel from './components/AssistantPanel';

const TITLES: Record<string, string> = {
  '/': 'Dashboard', '/periods': 'Exam periods', '/config': 'Configuration', '/reports': 'Reports',
  '/history': 'History', '/my-schedule': 'My schedule', '/availability': 'My availability',
  '/requests': 'Assignment requests',
};

export default function App() {
  const ui = useUi();
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [needOtp, setNeedOtp] = useState(false);
  const [notice, setNotice] = useState('');
  const [openReq, setOpenReq] = useState(0);
  const [showPw, setShowPw] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [notes, setNotes] = useState<any[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [bulls, setBulls] = useState<any[]>([]);
  const [showBull, setShowBull] = useState(false);
  const [showBot, setShowBot] = useState(false);
  const [seenTs, setSeenTs] = useState(0);
  const [bullSince, setBullSince] = useState(0);
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => { if (me) setSeenTs(Number(localStorage.getItem(`accord-bull-${me.id}`) || 0)); }, [me?.id]);

  useEffect(() => {
    if (!me) { setNotes([]); setBulls([]); return; }
    seen.current = null;
    let stop = false;
    const pull = async () => {
      try {
        api.list('bulletins').then((b) => { if (!stop) setBulls(b); }).catch(() => {});
        const list: any[] = await api.list('notifications');
        if (stop) return;
        setNotes(list);
        const unread = list.filter((n) => !n.read);
        if (seen.current === null) {
          if (unread.length) ui.toast.info(`You have ${unread.length} unread notification${unread.length === 1 ? '' : 's'}.`);
        } else {
          unread.filter((n) => !seen.current!.has(n.id)).slice(0, 3)
            .forEach((n) => ui.toast.info(`${n.title}${n.body ? ': ' + n.body : ''}`));
        }
        seen.current = new Set(list.map((n) => n.id));
      } catch { /* ignore */ }
    };
    pull();
    const t = setInterval(pull, 20000);
    return () => { stop = true; clearInterval(t); };
  }, [me?.id]);

  const loadMe = async (signedIn: boolean) => {
    if (!signedIn) { setMe(null); setNeedOtp(false); setReady(true); return; }
    try { setMe(await api.get<Me>('db?table=me')); setNeedOtp(false); setNotice(''); }
    catch (e: any) {
      if (e.code === 'otp') { setMe(null); setNeedOtp(true); }
      else { setMe(null); setNeedOtp(false); setNotice(e.message); await supabase.auth.signOut({ scope: 'local' }); }
    }
    setReady(true);
  };
  useEffect(() => {
    // setTimeout avoids a supabase-js deadlock when calling auth inside this callback.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setTimeout(() => loadMe(!!s), 0); });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Always start on the dashboard: on page refresh and right after logging in.
  useEffect(() => { if (pathname !== '/') nav('/', { replace: true }); }, [me?.id]);

  const refreshBulls = () => api.list('bulletins').then((b) => {
    setBulls(b);
    if (me?.id) { const now = Date.now(); setSeenTs(now); localStorage.setItem(`accord-bull-${me.id}`, String(now)); }
  }).catch(() => {});

  useEffect(() => {
    if (me?.role === 'proctor')
      api.action('requests', {}).then((r: any) => setOpenReq(r.filter((x: any) => x.can_accept).length)).catch(() => {});
  }, [me, pathname]);

  if (!ready) return <div className="splash"><LogoMark size={56} /><span>Loading…</span></div>;
  if (!me && needOtp) return <OtpGate onVerified={() => loadMe(true)} onCancel={() => supabase.auth.signOut({ scope: 'local' })} />;
  if (!me) return <Login notice={notice} />;

  const logout = async () => {
    const yes = await ui.confirm({ title: 'Log out?', message: 'Are you sure you want to log out?', confirmLabel: 'Yes, log out', icon: 'logout' });
    if (!yes) return;
    await api.otp({ action: 'logout' }).catch(() => {});
    supabase.auth.signOut({ scope: 'local' });
  };

  const unread = notes.filter((n) => !n.read).length;
  const routeOf = (n: any) =>
    n.kind === 'emergency' ? '/#emergencies'
    : n.kind === 'requests' ? '/requests'
    : n.kind === 'assignment' ? '/my-schedule'
    : n.kind === 'availability' ? (me.role === 'proctor' ? '/availability' : '/periods')
    : n.kind === 'period_ended' ? '/history'
    : n.kind === 'approval' ? '/config?tab=Account%20requests' : null;
  const openBullPanel = () => {
    if (!showBull) { const now = Date.now(); setBullSince(seenTs); setSeenTs(now); localStorage.setItem(`accord-bull-${me.id}`, String(now)); }
    setShowNotes(false); setShowBot(false); setShowBull(true);
  };
  const openNote = (n: any) => {
    if (!n.read) {
      setNotes((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      api.update('notifications', n.id, { read: true }).catch(() => {});
    }
    if (n.kind === 'bulletin') { openBullPanel(); return; }
    const to = routeOf(n);
    if (to) { nav(to); setShowNotes(false); }
  };
  const newBull = bulls.filter((b) => new Date(b.created_at).getTime() > seenTs).length;
  const toggleNotes = () => { setShowBull(false); setShowBot(false); setShowNotes(!showNotes); };
  const toggleBull = () => {
    if (!showBull) { const now = Date.now(); setBullSince(seenTs); setSeenTs(now); localStorage.setItem(`accord-bull-${me.id}`, String(now)); }
    setShowNotes(false); setShowBot(false); setShowBull(!showBull);
  };
  const toggleBot = () => { setShowNotes(false); setShowBull(false); setShowBot(!showBot); };
  const goFromBot = (to: string) => { nav(to); if (window.innerWidth <= 900) setShowBot(false); };
  const openBull = (b: any) => {
    if (b.kind === 'availability') { nav(me.role === 'proctor' ? '/availability' : '/periods'); setShowBull(false); }
  };
  const readAll = () => {
    notes.filter((n) => !n.read).forEach((n) => api.update('notifications', n.id, { read: true }).catch(() => {}));
    setNotes((l) => l.map((x) => ({ ...x, read: true })));
  };

  const manager = me.role !== 'proctor';
  const links: [string, string, IconName][] = manager
    ? [['/', 'Dashboard', 'home'], ['/periods', 'Exam periods', 'calendar'], ['/config', 'Configuration', 'sliders'], ['/reports', 'Reports', 'chart'],
      ['/history', 'History', 'clock']]
    : [['/my-schedule', 'My schedule', 'calendar'], ['/requests', 'Assignment requests', 'flag'], ['/availability', 'My availability', 'clock']];

  const first = me.full_name.split(' ')[0];
  const today = new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <MeCtx.Provider value={me}>
      <div className={`layout ${showNotes || showBull || showBot ? 'np' : ''}`}>
        <aside>
          <a href="/" className="logolink" aria-label="Go to dashboard"><Logo light /></a>
          <nav>
            {links.map(([to, label, icon]) => (
              <NavLink key={to} to={to} end={to === '/'} aria-label={label}>
                <Icon name={icon} /><span className="lbl">{label}</span>{to === '/requests' && openReq > 0 && <b className="navbadge">{openReq}</b>}
              </NavLink>
            ))}
          </nav>
          <div className="sidefoot">
            <button className="navbtn" aria-label="Settings" onClick={() => setShowPw(true)}><Icon name="settings" /><span className="lbl">Settings</span></button>
            <button className="navbtn out" aria-label="Logout" onClick={logout}><Icon name="logout" /><span className="lbl">Logout</span></button>
          </div>
        </aside>

        <NotificationPanel open={showNotes} notes={notes} onClose={() => setShowNotes(false)} onOpen={openNote} onReadAll={readAll} />
        <BulletinPanel open={showBull} items={bulls} since={bullSince} canPost={me.role === 'admin'}
          onClose={() => setShowBull(false)} onOpen={openBull} onChanged={refreshBulls} />
        <AssistantPanel open={showBot} role={me.role} onClose={() => setShowBot(false)} onGo={goFromBot} />
        {!showBot && (
          <button className={`botfab ${showNotes || showBull ? 'shift' : ''}`} aria-label="Open assistant" onClick={toggleBot}>
            <Icon name="chat" size={24} />
          </button>
        )}

        <div className="content">
          <header className="topbar">
            <div><small>Hello, {first} · {today}</small><h1>{TITLES[pathname] || 'Accord'}</h1></div>
            <div className="topright">
              <button className="bell" aria-label="Bulletin" title="Bulletin" onClick={toggleBull}>
                <Icon name="megaphone" />{newBull > 0 && <i className="dot" />}
              </button>
              <button className="bell" aria-label="Notifications" onClick={toggleNotes}>
                <Icon name="bell" />{unread > 0 && <i className="dot" />}
              </button>
              <button className="chip-user" onClick={() => setShowProfile(true)} title="Edit your profile">
                <Avatar name={me.full_name} src={me.avatar_url} />
                <div>
                  <strong>{me.full_name}</strong>
                  <span>{me.role === 'head' ? 'department head' : me.role}
                    {me.department && <i className="deptcode" title={me.department.name}>{me.department.code}</i>}
                  </span>
                </div>
              </button>
            </div>
          </header>
          <Routes>
            {manager ? (
              <>
                <Route path="/" element={<Overview />} />
                <Route path="/periods" element={<Periods />} />
                <Route path="/config" element={<Config />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/history" element={<History trashOnly={me.role === 'head'} />} />
              </>
            ) : (
              <>
                <Route path="/my-schedule" element={<MySchedule />} />
                <Route path="/requests" element={<Requests />} />
                <Route path="/availability" element={<Availability />} />
              </>
            )}
            <Route path="*" element={<Navigate to={manager ? '/' : '/my-schedule'} />} />
          </Routes>
        </div>
      </div>

      {showPw && <SettingsModal me={me} onClose={() => setShowPw(false)} />}
      {showProfile && <ProfileModal me={me} onClose={() => setShowProfile(false)} onSaved={(m) => setMe({ ...me, ...m })} onEmailChanged={(email) => setMe({ ...me, email })} />}
    </MeCtx.Provider>
  );
}
