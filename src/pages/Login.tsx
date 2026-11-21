import { FormEvent, useState } from 'react';
import { supabase } from '../lib/supabase';
import Logo from '../components/Logo';
import { Field } from '../components/ui';
import SignupModal from '../components/SignupModal';
import ForgotPasswordModal from '../components/ForgotPasswordModal';

export default function Login({ notice }: { notice: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errs, setErrs] = useState<{ email?: string; password?: string }>({});
  const [formErr, setFormErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [signup, setSignup] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormErr('');
    const er: typeof errs = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) er.email = 'Enter a valid email address';
    if (!password) er.password = 'Enter your password';
    setErrs(er);
    if (Object.keys(er).length) return;
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setFormErr(error.message === 'Invalid login credentials' ? 'Incorrect email or password.' : error.message);
      setLoading(false);
    }
  };

  return (
    <div className="auth">
      <section className="auth-art">
        <Logo light size={52} />
        <h1>Hey, Hello!</h1>
        <p className="lead">Welcome to Accord</p>
        <p className="blurb">Plan exam rooms, proctors and schedules for every department, with no clashes and no spreadsheets.</p>
      </section>

      <section className="auth-form">
        <form className="auth-card" onSubmit={submit} noValidate>
          <Logo size={44} />
          <div>
            <h2>Welcome Back</h2>
            <p className="sub">Sign in to manage exam schedules.</p>
          </div>
          {(formErr || notice) && <div className="alert error">{formErr || notice}</div>}
          <Field label="Email" error={errs.email}>
            <input type="email" name="email" autoComplete="email" placeholder="you@school.edu" value={email}
              onChange={(e) => { setEmail(e.target.value); setErrs({ ...errs, email: '' }); }} />
          </Field>
          <Field label="Password" error={errs.password}>
            <div className="pw">
              <input type={show ? 'text' : 'password'} name="password" autoComplete="current-password" placeholder="Your password" value={password}
                onChange={(e) => { setPassword(e.target.value); setErrs({ ...errs, password: '' }); }} />
              {password && <button type="button" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>}
            </div>
          </Field>
          <button type="button" className="link" onClick={() => setForgot(true)}>Forgot password?</button>
          <button type="submit" disabled={loading}>{loading ? 'Signing in…' : 'Login'}</button>
          <p className="foot">Need an account? <button type="button" className="link" onClick={() => setSignup(true)}>Create account</button></p>
        </form>
      </section>

      {forgot && <ForgotPasswordModal initialEmail={email} onClose={() => setForgot(false)} />}
      {signup && <SignupModal onClose={() => setSignup(false)} />}
    </div>
  );
}