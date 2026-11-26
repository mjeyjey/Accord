import { useEffect, useRef, useState } from "react";
import {
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { supabase } from "./lib/supabase";
import { api } from "./lib/api";
import { MeCtx } from "./lib/me";
import Logo, { LogoMark } from "./components/Logo";
import Icon from "./components/icons";
import { Avatar, useLock, useUi } from "./components/ui";
import { SettingsModal, ProfileModal } from "./components/AccountModals";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Periods from "./pages/Periods";
import Config from "./pages/Config";
import Reports from "./pages/Reports";
import History from "./pages/History";
import MySchedule from "./pages/MySchedule";
import Availability from "./pages/Availability";
import Requests from "./pages/Requests";
import NotificationPanel from "./components/NotificationPanel";
import OtpGate from "./components/OtpGate";
import BulletinPanel from "./components/BulletinPanel";
import AssistantPanel from "./components/AssistantPanel";
import ChatPanel from "./components/ChatPanel";
import Tour from "./components/Tour";
const TITLES = {
  "/": "Dashboard",
  "/periods": "Exam periods",
  "/config": "Configuration",
  "/reports": "Reports",
  "/history": "History",
  "/my-schedule": "My schedule",
  "/availability": "My availability",
  "/requests": "Assignment requests",
};
export default function App() {
  const ui = useUi();
  const [logoutLocked, guard] = useLock();
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);
  const [needOtp, setNeedOtp] = useState(false);
  const [notice, setNotice] = useState("");
  const [openReq, setOpenReq] = useState(0);
  const [showPw, setShowPw] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [notes, setNotes] = useState([]);
  const [showNotes, setShowNotes] = useState(false);
  const [bulls, setBulls] = useState([]);
  const [showBull, setShowBull] = useState(false);
  const [showBot, setShowBot] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [tourOn, setTourOn] = useState(false);
  const [seenTs, setSeenTs] = useState(0);
  const [bullSince, setBullSince] = useState(0);
  const seen = useRef(null);
  useEffect(() => {
    if (me)
      setSeenTs(Number(localStorage.getItem(`accord-bull-${me.id}`) || 0));
  }, [me?.id]);
  useEffect(() => {
    if (!me || me.tour_seen_at) return;
    const t = setTimeout(() => setTourOn(true), 700);
    return () => clearTimeout(t);
  }, [me?.id]);
  useEffect(() => {
    if (!me) {
      setNotes([]);
      setBulls([]);
      return;
    }
    seen.current = null;
    let stop = false;
    const pull = async () => {
      try {
        api
          .list("bulletins")
          .then((b) => {
            if (!stop) setBulls(b);
          })
          .catch(() => {});
        api.get("chat?action=unread")
          .then((r) => { if (!stop) setChatUnread(r.count); })
          .catch(() => {});
        const list = await api.list("notifications");
        if (stop) return;
        setNotes(list);
        const unread = list.filter((n) => !n.read);
        if (seen.current === null) {
          if (unread.length)
            ui.toast.info(
              `You have ${unread.length} unread notification${unread.length === 1 ? "" : "s"}.`,
            );
        } else {
          unread
            .filter((n) => !seen.current.has(n.id))
            .slice(0, 3)
            .forEach((n) =>
              ui.toast.info(`${n.title}${n.body ? ": " + n.body : ""}`),
            );
        }
        seen.current = new Set(list.map((n) => n.id));
      } catch {
        /* ignore */
      }
    };
    pull();
    const t = setInterval(pull, 20000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [me?.id]);
  const loadMe = async (signedIn) => {
    if (!signedIn) {
      setMe(null);
      setNeedOtp(false);
      setReady(true);
      return;
    }
    try {
      setMe(await api.get("db?table=me"));
      setNeedOtp(false);
      setNotice("");
    } catch (e) {
      if (e.code === "otp") {
        setMe(null);
        setNeedOtp(true);
      } else {
        setMe(null);
        setNeedOtp(false);
        setNotice(e.message);
        await supabase.auth.signOut({ scope: "local" });
      }
    }
    setReady(true);
  };
  useEffect(() => {
    // setTimeout avoids a supabase-js deadlock when calling auth inside this callback.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setTimeout(() => loadMe(!!s), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  // Always start on the dashboard: on page refresh and right after logging in.
  useEffect(() => {
    if (pathname !== "/") nav("/", { replace: true });
    window.scrollTo(0, 0);
  }, [me?.id]);
  const refreshBulls = () =>
    api
      .list("bulletins")
      .then((b) => {
        setBulls(b);
        if (me?.id) {
          const now = Date.now();
          setSeenTs(now);
          localStorage.setItem(`accord-bull-${me.id}`, String(now));
        }
      })
      .catch(() => {});
  useEffect(() => {
    if (me?.role === "proctor")
      api
        .action("requests", {})
        .then((r) => setOpenReq(r.filter((x) => x.can_accept).length))
        .catch(() => {});
  }, [me, pathname]);
  if (!ready)
    return (
      <div className="splash">
        <LogoMark size={56} />
        <span>Loading…</span>
      </div>
    );
  if (!me && needOtp)
    return (
      <OtpGate
        onVerified={() => loadMe(true)}
        onCancel={() => supabase.auth.signOut({ scope: "local" })}
      />
    );
  if (!me) return <Login notice={notice} />;
  const logout = guard(async () => {
    const yes = await ui.confirm({
      title: "Log out?",
      message: "Are you sure you want to log out?",
      confirmLabel: "Yes, log out",
      icon: "logout",
    });
    if (!yes) return;
    await api.otp({ action: "logout" }).catch(() => {});
    supabase.auth.signOut({ scope: "local" });
  });
  const unread = notes.filter((n) => !n.read).length;
  const routeOf = (n) =>
    n.kind === "emergency"
      ? "/#emergencies"
      : n.kind === "requests"
        ? "/requests"
        : n.kind === "assignment"
          ? "/my-schedule"
          : n.kind === "availability"
            ? me.role === "proctor"
              ? "/availability"
              : "/periods"
            : n.kind === "period_ended"
              ? "/history?tab=periods"
              : n.kind === "approval"
                ? "/config?tab=Account%20requests"
                : null;
  const openNote = (n) => {
    if (!n.read) {
      setNotes((l) => l.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      api.update("notifications", n.id, { read: true }).catch(() => {});
    }
    if (n.kind === "bulletin") {
      openBullPanel();
      return;
    }
    const to = routeOf(n);
    if (to) {
      nav(to);
      setShowNotes(false);
    }
  };
  const newBull = bulls.filter(
    (b) => new Date(b.created_at).getTime() > seenTs,
  ).length;
  const closeAll = () => { setShowNotes(false); setShowBull(false); setShowBot(false); setShowChat(false); };
  const markBullSeen = () => {
    const now = Date.now();
    setBullSince(seenTs); setSeenTs(now);
    localStorage.setItem(`accord-bull-${me.id}`, String(now));
  };
  const openBullPanel = () => { if (!showBull) markBullSeen(); closeAll(); setShowBull(true); };
  const toggleNotes = () => { const next = !showNotes; closeAll(); setShowNotes(next); };
  const toggleBull = () => { if (!showBull) markBullSeen(); const next = !showBull; closeAll(); setShowBull(next); };
  const toggleBot = () => { const next = !showBot; closeAll(); setShowBot(next); };
  const toggleChat = () => { const next = !showChat; closeAll(); setShowChat(next); };
  const goFromBot = (to) => {
    nav(to);
    if (window.innerWidth <= 900) setShowBot(false);
  };
  const openBull = (b) => {
    if (b.kind === "availability") {
      nav(me.role === "proctor" ? "/availability" : "/periods");
      setShowBull(false);
    }
  };
  const readAll = () => {
    notes
      .filter((n) => !n.read)
      .forEach((n) =>
        api.update("notifications", n.id, { read: true }).catch(() => {}),
      );
    setNotes((l) => l.map((x) => ({ ...x, read: true })));
  };
  const finishTour = () => {
    setTourOn(false);
    setMe((m) => (m ? { ...m, tour_seen_at: new Date().toISOString() } : m));
    api.patchMe({ tour_seen: true }).catch(() => {});
  };
  const manager = me.role !== "proctor";
  const links = manager
    ? [
        ["/", "Dashboard", "home"],
        ["/periods", "Exam periods", "calendar"],
        ["/config", "Configuration", "sliders"],
        ["/reports", "Reports", "chart"],
        ["/history", "History", "clock"],
      ]
    : [
        ["/my-schedule", "My schedule", "calendar"],
        ["/requests", "Assignment requests", "flag"],
        ["/availability", "My availability", "clock"],
      ];
  const first = me.full_name.split(" ")[0];
  const today = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  return (
    <MeCtx.Provider value={me}>
      <div className={`layout ${showNotes || showBull || showBot || showChat ? "np" : ""}`}>
        <aside>
          <a href="/" className="logolink" aria-label="Go to dashboard">
            <Logo light />
          </a>
          <nav>
            {links.map(([to, label, icon]) => (
              <NavLink key={to} to={to} end={to === "/"} aria-label={label} data-tour={`nav-${to}`}>
                <Icon name={icon} />
                <span className="lbl">{label}</span>
                {to === "/requests" && openReq > 0 && (
                  <b className="navbadge">{openReq}</b>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="sidefoot">
            <button
              className="navbtn"
              aria-label="Settings"
              data-tour="settings"
              onClick={() => setShowPw(true)}
            >
              <Icon name="settings" />
              <span className="lbl">Settings</span>
            </button>
            <button
              className="navbtn out"
              aria-label="Logout"
              disabled={logoutLocked}
              aria-busy={logoutLocked}
              onClick={logout}
            >
              <Icon name="logout" />
              <span className="lbl">Logout</span>
            </button>
          </div>
        </aside>

        <NotificationPanel
          open={showNotes}
          notes={notes}
          onClose={() => setShowNotes(false)}
          onOpen={openNote}
          onReadAll={readAll}
        />
        <BulletinPanel
          open={showBull}
          items={bulls}
          since={bullSince}
          canPost={me.role === "admin"}
          onClose={() => setShowBull(false)}
          onOpen={openBull}
          onChanged={refreshBulls}
        />
        <ChatPanel open={showChat} onClose={() => setShowChat(false)} onUnread={setChatUnread} />
        <AssistantPanel
          key={me.id}
          open={showBot}
          role={me.role}
          userId={me.id}
          onClose={() => setShowBot(false)}
          onGo={goFromBot}
        />
        {!showBot && (
          <button
            className={`botfab ${showNotes || showBull || showChat ? "shift" : ""}`}
            aria-label="Open assistant"
            data-tour="assistant"
            onClick={toggleBot}
          >
            <Icon name="chat" size={24} />
          </button>
        )}

        <div className="content">
          <header className="topbar">
            <div>
              <small>
                Hello, {first} · {today}
              </small>
              <h1>{TITLES[pathname] || "Accord"}</h1>
            </div>
            <div className="topright">
              <button
                className="bell"
                aria-label="Bulletin"
                title="Bulletin"
                data-tour="bulletin"
                onClick={toggleBull}
              >
                <Icon name="megaphone" />
                {newBull > 0 && <i className="dot" />}
              </button>
              <button className="bell" aria-label="Messages" title="Messages" data-tour="chat" onClick={toggleChat}>
                <Icon name="message" />
                {chatUnread > 0 && <i className="dot" />}
              </button>
              <button
                className="bell"
                aria-label="Notifications"
                data-tour="notifications"
                onClick={toggleNotes}
              >
                <Icon name="bell" />
                {unread > 0 && <i className="dot" />}
              </button>
              <button
                className="chip-user"
                data-tour="profile"
                onClick={() => setShowProfile(true)}
                title="Edit your profile"
              >
                <Avatar name={me.full_name} src={me.avatar_url} />
                <div>
                  <strong>{me.full_name}</strong>
                  <span>
                    {me.role === "head" ? "department head" : me.role}
                    {me.department && (
                      <i className="deptcode" title={me.department.name}>
                        {me.department.code}
                      </i>
                    )}
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
                <Route
                  path="/history"
                  element={<History trashOnly={me.role === "head"} />}
                />
              </>
            ) : (
              <>
                <Route path="/my-schedule" element={<MySchedule />} />
                <Route path="/requests" element={<Requests />} />
                <Route path="/availability" element={<Availability />} />
              </>
            )}
            <Route
              path="*"
              element={<Navigate to={manager ? "/" : "/my-schedule"} />}
            />
          </Routes>
        </div>
      </div>

      {showPw && <SettingsModal me={me} onClose={() => setShowPw(false)} />}
      {showProfile && (
        <ProfileModal
          me={me}
          onClose={() => setShowProfile(false)}
          onSaved={(m) => setMe({ ...me, ...m })}
          onEmailChanged={(email) => setMe({ ...me, email })}
        />
      )}
      {tourOn && <Tour role={me.role} onClose={finishTour} />}
    </MeCtx.Provider>
  );
}
