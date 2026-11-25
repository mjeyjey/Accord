import { useState } from "react";
import { supabase } from "../lib/supabase";
import { LogoMark } from "../components/Logo";
import { Field, Modal, useLock } from "../components/ui";
import SignupModal from "../components/SignupModal";
import ForgotPasswordModal from "../components/ForgotPasswordModal";
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
      {terms && <Modal title="Terms and Conditions" onClose={() => setTerms(false)} footer={<button onClick={() => setTerms(false)}>Close</button>}>
        <p className="dlgtext">Accord is for authorized La Concepcion College staff only. Use your own account, keep your password private, and use schedule data only for school purposes. Your activity is recorded for security and accountability.</p>
        <p className="dlgtext">Concerns? Email accord.laconcepcioncollege@gmail.com.</p>
      </Modal>}
    </div>
  );
}
