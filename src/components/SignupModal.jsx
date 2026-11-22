import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Field, Modal, useLock } from "./ui";
import { passwordProblem, PASSWORD_RULE } from "../lib/password";
export default function SignupModal({ onClose }) {
  const [deps, setDeps] = useState([]);
  const [f, setF] = useState({
    full_name: "",
    email: "",
    password: "",
    confirm: "",
    department_id: "",
  });
  const [errs, setErrs] = useState({});
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("form");
  const [code, setCode] = useState("");
  const [wait, setWait] = useState(0);
  const [locked, guard] = useLock();
  const [sendLocked, guardSend] = useLock();
  useEffect(() => {
    fetch("/api/signup")
      .then((r) => r.json())
      .then((d) => Array.isArray(d) && setDeps(d))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  const set = (k, v) => {
    setF({ ...f, [k]: v });
    setErrs({ ...errs, [k]: "" });
  };
  const sendCode = guardSend(async () => {
    await api.otp({ action: "send_public", purpose: "signup", email: f.email });
    setWait(45);
  });
  const submit = guard(async (e) => {
    e.preventDefault();
    setErr("");
    if (step === "form") {
      const er = {};
      if (!f.full_name.trim()) er.full_name = "Name is required";
      if (!/^\S+@\S+\.\S+$/.test(f.email))
        er.email = "Enter a valid email address";
      const pwBad = passwordProblem(f.password);
      if (pwBad) er.password = pwBad;
      if (f.confirm !== f.password) er.confirm = "The passwords do not match";
      setErrs(er);
      if (Object.keys(er).length) return;
      setBusy(true);
      try {
        await sendCode();
        setStep("code");
      } catch (e) {
        setErr(e.message);
      }
      setBusy(false);
      return;
    }
    if (!/^\d{6}$/.test(code)) return setErr("Enter the 6-digit code");
    setBusy(true);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: f.full_name,
          email: f.email,
          password: f.password,
          department_id: f.department_id || null,
          code,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(json.error || "Could not create the account");
      setStep("done");
    } catch (e) {
      setErr(e.message);
    }
    setBusy(false);
  });
  return (
    <Modal
      title="Create account"
      onClose={onClose}
      footer={
        step === "done" ? (
          <button onClick={onClose}>Close</button>
        ) : (
          <>
            <button type="button" className="ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              form="signupform"
              disabled={busy || locked}
              aria-busy={locked}
            >
              {busy
                ? "Please wait…"
                : step === "form"
                  ? "Send verification code"
                  : "Verify and submit request"}
            </button>
          </>
        )
      }
    >
      {step === "done" ? (
        <p className="dlgtext">
          Your request was sent. An admin or department head will verify that
          you are a proctor or faculty member. You can log in once it is
          approved, and we will email you.
        </p>
      ) : (
        <form id="signupform" onSubmit={submit} noValidate>
          {err && <div className="alert error">{err}</div>}
          {step === "form" ? (
            <>
              <p className="muted" style={{ marginTop: 0 }}>
                Accounts created here are proctor accounts and need approval
                before first login.
              </p>
              <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
                <Field label="Full name *" error={errs.full_name}>
                  <input
                    value={f.full_name}
                    onChange={(e) => set("full_name", e.target.value)}
                  />
                </Field>
                <Field label="Email *" error={errs.email}>
                  <input
                    type="email"
                    autoComplete="email"
                    value={f.email}
                    onChange={(e) => set("email", e.target.value)}
                  />
                </Field>
                <Field label="Department">
                  <select
                    value={f.department_id}
                    onChange={(e) => set("department_id", e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {deps.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} - {d.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Password *" error={errs.password}>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={f.password}
                    onChange={(e) => set("password", e.target.value)}
                  />
                </Field>
                <small className="muted">{PASSWORD_RULE}</small>
                <Field label="Confirm password *" error={errs.confirm}>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={f.confirm}
                    onChange={(e) => set("confirm", e.target.value)}
                  />
                </Field>
              </div>
            </>
          ) : (
            <div className="fields" style={{ gridTemplateColumns: "1fr" }}>
              <p className="muted" style={{ margin: 0 }}>
                We sent a 6-digit code to {f.email}.
              </p>
              <Field label="Verification code">
                <input
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
              <button
                type="button"
                className="ghost sm"
                disabled={wait > 0 || sendLocked || locked}
                aria-busy={sendLocked}
                onClick={() => sendCode().catch((e) => setErr(e.message))}
              >
                {wait > 0 ? `Resend in ${wait}s` : "Resend code"}
              </button>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
