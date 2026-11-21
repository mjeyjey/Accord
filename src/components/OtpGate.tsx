import { FormEvent, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';
import Logo from './Logo';
import { Field } from './ui';

export default function OtpGate({ onVerified, onCancel }: { onVerified: () => void; onCancel: () => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [trust, setTrust] = useState(false);
  const [wait, setWait] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const sent = useRef(false);

  const send = async () => {
    setErr('');
    try { await api.otp({ action: 'send', purpose: 'login' }); setErr(''); setWait(45); }
    catch (e: any) { setErr(e.message); }
  };
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email || ''));
    if (!sent.current) { sent.current = true; send(); }
  }, []);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setErr('Enter the 6-digit code');
    setBusy(true); setErr('');
    try { await api.otp({ action: 'verify_login', code, trust }); onVerified(); }
    catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="auth">
      <section className="auth-art">
        <Logo light size={52} />
        <h1>One more step</h1>
        <p className="lead">Keeping Accord secure</p>
        <p className="blurb">We email a code to confirm it is really you signing in.</p>
      </section>
      <section className="auth-form">
        <form className="auth-card" onSubmit={submit} noValidate>
          <Logo size={44} />
          <div>
            <h2>Verify it’s you</h2>
            <p className="sub">We sent a 6-digit code to<br /><b style={{ color: 'var(--head)' }}>{email || '…'}</b></p>
          </div>
          {err && <div className="alert error">{err}</div>}
          <Field label="Verification code">
            <input inputMode="numeric" maxLength={6} autoFocus autoComplete="one-time-code" value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setErr(''); }} />
          </Field>
          <label style={{ flexDirection: 'row', alignItems: 'center', gap: 8, fontWeight: 400, textAlign: 'left' }}>
            <input type="checkbox" checked={trust} onChange={(e) => setTrust(e.target.checked)} />
            Trust this device for 14 days (skip the code next time)
          </label>
          <button type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify'}</button>
          <button type="button" className="link" disabled={wait > 0} onClick={send}>
            {wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
          </button>
          <p className="foot">Not you? <button type="button" className="link" onClick={onCancel}>Use a different account</button></p>
        </form>
      </section>
    </div>
  );
}
