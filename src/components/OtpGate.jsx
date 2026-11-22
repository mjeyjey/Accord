import { useEffect, useRef, useState } from "react";
import { supabase, setRemember as keepLogin } from "../lib/supabase";
import { api } from "../lib/api";
import { LogoMark } from "./Logo";
import { Field, useLock } from "./ui";
export default function OtpGate({ onVerified, onCancel }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(false);
  const [wait, setWait] = useState(0);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, guard] = useLock();
  const [sendLocked, guardSend] = useLock();
  const sent = useRef(false);
  const send = guardSend(async () => {
    setErr("");
    try {
      await api.otp({ action: "send", purpose: "login" });
      setErr("");
      setWait(45);
    } catch (e) {
      setErr(e.message);
    }
  });
  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setEmail(data.session?.user.email || ""));
    if (!sent.current) {
      sent.current = true;
      send();
    }
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const submit = guard(async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setErr("Enter the 6-digit code");
    setBusy(true);
    setErr("");
    try {
      await api.otp({ action: "verify_login", code, remember });
      if (remember) keepLogin(true);
      onVerified();
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  });
  return (
    <div className="auth solo">
      <main className="auth-center">
        <div className="brand">
          <LogoMark size={76} />
          <h1>Accord</h1>
          <small>La Concepcion College</small>
        </div>
        <form className="auth-card" onSubmit={submit} noValidate>
          <div>
            <h2>Verify it’s you</h2>
            <p className="sub">
              We sent a 6-digit code to
              <br />
              <b style={{ color: "var(--head)" }}>{email || "…"}</b>
            </p>
          </div>
          {err && <div className="alert error">{err}</div>}
          <Field label="Verification code">
            <input
              inputMode="numeric"
              maxLength={6}
              autoFocus
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ""));
                setErr("");
              }}
            />
          </Field>
          <label
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              fontWeight: 400,
              textAlign: "left",
            }}
          >
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember this device for 7 days
          </label>
          <button type="submit" disabled={busy || locked} aria-busy={locked}>
            {busy ? "Verifying…" : "Verify"}
          </button>
          <button
            type="button"
            className="link"
            disabled={wait > 0 || sendLocked || locked}
            aria-busy={sendLocked}
            onClick={send}
          >
            {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
          </button>
          <p className="foot">
            Not you?{" "}
            <button type="button" className="link" onClick={onCancel}>
              Use a different account
            </button>
          </p>
        </form>
      </main>
    </div>
  );
}
