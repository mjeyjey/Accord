import { useState } from "react";
import { supabase } from "../lib/supabase";
import { LogoMark } from "../components/Logo";
import { Field, Modal, useLock } from "../components/ui";
import SignupModal from "../components/SignupModal";
import ForgotPasswordModal from "../components/ForgotPasswordModal";
const TERMS = [
  ["1. Acceptance of terms", "By signing in to Accord you confirm that you have read, understood and agree to these Terms and Conditions. If you do not agree, do not use the system."],
  ["2. Who may use Accord", "Accord is for authorized La Concepcion College administrators, department heads, faculty and proctors. Accounts must be approved by an admin or department head. You may not share, sell or transfer your account to anyone."],
  ["3. Account security", "Keep your password and verification codes private. Use a strong password, never let others use your account, and log out on shared devices. You are responsible for everything done under your account. Report any suspected unauthorized access to the administrator immediately."],
  ["4. Acceptable use", "Use Accord only for exam scheduling and related school work. Do not try to view data you are not permitted to see, bypass security, disrupt the service, or enter false availability, emergencies, messages or announcements."],
  ["5. Schedules and proctor duties", "Generated schedules may change. Proctors who accept an assignment must report on time. Emergencies must be flagged honestly and as early as possible so a replacement can be arranged. Availability locks once an exam period starts."],
  ["6. Information we collect", "We store your name, email, department, role, optional profile photo, availability, exam assignments, messages sent through Accord, notifications, and a log of actions you perform in the system."],
  ["7. How your information is used", "Your information is used to build and manage exam schedules, send notifications and verification emails, and keep a record for security and accountability. It is not sold and is not used for advertising."],
  ["8. Privacy and confidentiality", "Personal data is handled in line with the Data Privacy Act of 2012 (RA 10173). Schedules, student counts, messages and account details are confidential. Use them for school purposes only and do not copy, publish or share them with unauthorized persons."],
  ["9. Monitoring and records", "Your activity is recorded for security and accountability and may be reviewed by administrators. Deleted records stay in Trash for 30 days before being permanently removed. Administrators may keep backups of system data."],
  ["10. Service availability and changes", "Accord is provided as is and may be unavailable during maintenance or because of technical problems. These terms may be updated from time to time. Continued use after an update means you accept the new terms."],
  ["11. Suspension and removal", "The school may suspend or remove an account that violates these terms, is no longer needed, or puts the system or its data at risk."],
  ["12. Contact", "For questions or concerns, email accord.laconcepcioncollege@gmail.com."],
];
export default function Login({ notice }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [errs, setErrs] = useState({});
  const [formErr, setFormErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [signup, setSignup] = useState(false);
  const [agree, setAgree] = useState(false);
  const [terms, setTerms] = useState(false);
  const [locked, guard] = useLock();
  const submit = guard(async (e) => {
    e.preventDefault();
    setFormErr("");
    const er = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) er.email = "Enter a valid email address";
    if (!password) er.password = "Enter your password";
    if (!agree) er.agree = "Please agree to the Terms and Conditions to continue";
    setErrs(er);
    if (Object.keys(er).length) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setFormErr(
        error.message === "Invalid login credentials"
          ? "Incorrect email or password."
          : error.message,
      );
      setLoading(false);
    }
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
            <h2>Welcome back</h2>
            <p className="sub">Sign in to manage exam schedules.</p>
          </div>
          {(formErr || notice) && (
            <div className="alert error">{formErr || notice}</div>
          )}
          <Field label="Email" error={errs.email}>
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@school.edu"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setErrs({ ...errs, email: "" });
              }}
            />
          </Field>
          <Field label="Password" error={errs.password}>
            <div className="pw">
              <input
                type={show ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                placeholder="Your password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrs({ ...errs, password: "" });
                }}
              />
              {password && (
                <button type="button" onClick={() => setShow(!show)}>
                  {show ? "Hide" : "Show"}
                </button>
              )}
            </div>
          </Field>
          <button
            type="button"
            className="link"
            onClick={() => setForgot(true)}
          >
            Forgot password?
          </button>
          <label style={{ flexDirection: "row", alignItems: "center", gap: 8, fontWeight: 400, textAlign: "left" }}>
            <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setErrs({ ...errs, agree: "" }); }} />
            <span>I agree to the <button type="button" className="link" style={{ display: "inline", margin: 0 }} onClick={() => setTerms(true)}>Terms and Conditions</button></span>
          </label>
          {errs.agree && <small className="ferr">{errs.agree}</small>}
          <button type="submit" disabled={loading || locked} aria-busy={locked}>
            {loading ? "Signing in…" : "Login"}
          </button>
          <p className="foot">
            Need an account?{" "}
            <button
              type="button"
              className="link"
              onClick={() => setSignup(true)}
            >
              Create account
            </button>
          </p>
        </form>
        <p className="auth-contact">
          Concerns? Email{" "}
          <a href="mailto:accord.laconcepcioncollege@gmail.com">accord.laconcepcioncollege@gmail.com</a>
        </p>
      </main>

      {forgot && (
        <ForgotPasswordModal
          initialEmail={email}
          onClose={() => setForgot(false)}
        />
      )}
      {signup && <SignupModal onClose={() => setSignup(false)} />}
      {terms && (
        <Modal title="Terms and Conditions" onClose={() => setTerms(false)}
          footer={<>
            <button className="ghost" onClick={() => setTerms(false)}>Close</button>
            <button onClick={() => { setAgree(true); setErrs((x) => ({ ...x, agree: "" })); setTerms(false); }}>Accept all</button>
          </>}>
          {TERMS.map(([h, t]) => (
            <div key={h}>
              <h4 className="sechead" style={{ fontSize: 15, marginTop: 14 }}>{h}</h4>
              <p className="dlgtext">{t}</p>
            </div>
          ))}
        </Modal>
      )}
    </div>
  );
}
