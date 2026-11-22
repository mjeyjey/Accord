import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Field, Modal, useLock } from "./ui";
import { passwordChecks, passwordProblem } from "../lib/password";
export default function ForgotPasswordModal({ initialEmail = "", onClose }) {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const [locked, guard] = useLock();
  const [sendLocked, guardSend] = useLock();
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const sendCode = guardSend(async () => {
    await api.otp({ action: "send_reset", email });
    setWait(45);
  });
  const submit = guard(async (e) => {
    e.preventDefault();
    setErr("");
    if (step === "email") {
      if (!/^\S+@\S+\.\S+$/.test(email))
        return setErr("Enter a valid email address");
      setBusy(true);
      try {
        await sendCode();
        setStep("reset");
      } catch (x) {
        setErr(x.message);
      }
      setBusy(false);
      return;
    }
    if (!/^\d{6}$/.test(code)) return setErr("Enter the 6-digit code");
    const bad = passwordProblem(pw);
    if (bad) return setErr(bad);
    if (pw !== pw2) return setErr("The two passwords do not match");
    setBusy(true);
    try {
      await api.otp({ action: "reset_password", email, code, password: pw });
      setStep("done");
    } catch (x) {
      setErr(x.message);
    }
    setBusy(false);
  });
  return (
    <Modal
      title="Forgot your password?"
      onClose={onClose}
      footer={
        step === "done" ? (
          <button onClick={onClose}>Back to login</button>
        ) : (
          <>
            <button type="button" className="ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              form="forgotform"
              disabled={busy || locked}
              aria-busy={locked}
            >
              {busy
                ? "Please wait…"
                : step === "email"
                  ? "Send code"
                  : "Reset password"}
            </button>
          </>
        )
      }
    >
      {step === "done" ? (
        <p className="dlgtext">
          Your password was changed. You can now log in with your new password.
        </p>
      ) : (
        <form id="forgotform" onSubmit={submit} noValidate>
          {err && <div className="alert error">{err}</div>}
          {step === "email" ? (
            <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
              <p className="muted" style={{ margin: 0 }}>
                Enter your account email. We will send a 6-digit code to it.
              </p>
              <Field label="Email">
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
            </div>
          ) : (
            <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
              <p className="muted" style={{ margin: 0 }}>
                If {email} has an account, a 6-digit code was sent to it. It
                expires in 10 minutes.
              </p>
              <Field label="Verification code">
                <input
                  name="otp"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="one-time-code"
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
              <Field label="New password">
                <input
                  type="password"
                  name="new-password"
                  autoComplete="new-password"
                  value={pw}
                  onChange={(e) => setPw(e.target.value)}
                />
              </Field>
              <ul className="pwrules">
                {passwordChecks(pw).map((c) => (
                  <li key={c.label} className={c.ok ? "ok" : ""}>
                    {c.label}
                  </li>
                ))}
              </ul>
              <Field label="Confirm new password">
                <input
                  type="password"
                  name="confirm-password"
                  autoComplete="new-password"
                  value={pw2}
                  onChange={(e) => setPw2(e.target.value)}
                />
              </Field>
              <button
                type="button"
                className="ghost sm"
                disabled={wait > 0 || sendLocked || locked}
                aria-busy={sendLocked}
                onClick={() => sendCode().catch((x) => setErr(x.message))}
              >
                {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
              </button>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
