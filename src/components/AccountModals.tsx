import { FormEvent, useEffect, useRef, useState } from 'react';
import { api, Me } from '../lib/api';
import { Field, initials, Modal, useUi } from './ui';
import { ACCENTS, getTheme, saveTheme, Theme } from '../lib/theme';
import RowMenu from './RowMenu';
import { passwordProblem, PASSWORD_RULE } from '../lib/password';
import SubjectPicker from './SubjectPicker';


// Crop to a square and shrink, so the picture is stored as a small data URL in the profile row.
const shrink = (file: File) => new Promise<string>((res, rej) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const s = 160, c = document.createElement('canvas');
    c.width = c.height = s;
    const m = Math.min(img.width, img.height);
    c.getContext('2d')!.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
    URL.revokeObjectURL(url);
    res(c.toDataURL('image/jpeg', 0.85));
  };
  img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That file is not an image')); };
  img.src = url;
});

export function ProfileModal({ me, onClose, onSaved, onEmailChanged }: {
  me: Me; onClose: () => void; onSaved: (m: Partial<Me>) => void; onEmailChanged: (email: string) => void;
}) {
  const ui = useUi();
  const [tab, setTab] = useState<'profile' | 'email' | 'subjects'>('profile');
  const [name, setName] = useState(me.full_name);
  const [pic, setPic] = useState<string | null>(me.avatar_url || null);
  const [nameErr, setNameErr] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const pick = async (f?: File) => {
    if (!f) return;
    try { setPic(await shrink(f)); setErr(''); } catch (e: any) { setErr(e.message); }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setNameErr('Name is required');
    setNameErr(''); setErr('');
    setBusy(true);
    try {
      const saved = await api.patchMe({ full_name: name.trim(), avatar_url: pic });
      onSaved(saved);
      ui.toast.success('Profile saved');
      onClose();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <Modal title="Edit profile" onClose={onClose}
      footer={tab === 'profile' ? <>
        <button type="button" className="ghost" onClick={onClose}>Cancel</button>
        <button type="submit" form="profform" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </> : <button type="button" className="ghost" onClick={onClose}>Close</button>}>
      <div className="tabs">
        <button type="button" className={tab === 'profile' ? 'on' : ''} onClick={() => setTab('profile')}>Profile</button>
        <button type="button" className={tab === 'email' ? 'on' : ''} onClick={() => setTab('email')}>Change email</button>
        {me.role !== 'admin' && <button type="button" className={tab === 'subjects' ? 'on' : ''} onClick={() => setTab('subjects')}>My subjects</button>}
      </div>
      {tab === 'subjects' ? <MySubjects me={me} /> : tab === 'email' ? <ChangeEmailForm me={me} onChanged={(email) => { onEmailChanged(email); onClose(); }} /> : <form id="profform" onSubmit={submit} noValidate>
        {err && <div className="alert error">{err}</div>}
        <div className="row" style={{ marginBottom: 16 }}>
          {pic ? <img className="pfp" src={pic} alt="" /> : <span className="pfp">{initials(name)}</span>}
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <RowMenu items={[
            { label: 'Upload photo', onClick: () => file.current?.click() },
            ...(pic ? [{ label: 'Remove photo', danger: true, onClick: () => setPic(null) }] : []),
          ]} />
        </div>
        <div className="fields" style={{ gridTemplateColumns: '1fr' }}>
          <Field label="Full name *" error={nameErr}><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Email"><input type="email" value={me.email || ''} disabled readOnly /></Field>
          <small className="muted">To change your email, open the Change email tab above.</small>
        </div>
      </form>}
    </Modal>
  );
}

function MySubjects({ me }: { me: Me }) {
  const ui = useUi();
  const [all, setAll] = useState<any[]>([]);
  const [val, setVal] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([api.action('subject_catalog', {}), api.action('proctor_subjects', { proctor_id: me.id })])
      .then(([s, v]: any) => { setAll(s); setVal(v); }).catch((e: any) => ui.toast.error(e.message));
  }, []);
  const save = async () => {
    setBusy(true);
    try { await api.action('set_proctor_subjects', { proctor_id: me.id, codes: val }); ui.toast.success('Subjects saved'); }
    catch (e: any) { ui.toast.error(e.message); }
    setBusy(false);
  };
  return <>
    <p className="muted" style={{ marginTop: 0 }}>You will never be assigned to sections that include these subjects.</p>
    {val ? <SubjectPicker subjects={all} value={val} onChange={setVal} /> : <p className="muted">Loading…</p>}
    <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
      <button disabled={busy || !val} onClick={save}>{busy ? 'Saving…' : 'Save subjects'}</button>
    </div>
  </>;
}

function ChangeEmailForm({ me, onChanged }: { me: Me; onChanged: (email: string) => void }) {
  const ui = useUi();
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [cur, setCur] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const sendCode = async () => { await api.otp({ action: 'send', purpose: 'email', email: email.trim(), current: cur }); setWait(45); };

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    if (step === 'form') {
      const next = email.trim().toLowerCase();
      if (!cur) return setErr('Enter your current password');
      if (!/^\S+@\S+\.\S+$/.test(next)) return setErr('Enter a valid email address');
      if (next === (me.email || '').toLowerCase()) return setErr('That is already your email');
      setBusy(true);
      try { await sendCode(); setStep('code'); } catch (x: any) { setErr(x.message); }
      setBusy(false); return;
    }
    if (!/^\d{6}$/.test(code)) return setErr('Enter the 6-digit code');
    setBusy(true);
    try {
      const r: any = await api.otp({ action: 'change_email', email: email.trim(), code });
      ui.toast.success('Email changed. Use it the next time you sign in.');
      onChanged(r.email);
    } catch (x: any) { setErr(x.message); }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} noValidate>
      {err && <div className="alert error">{err}</div>}
      <div className="fields" style={{ gridTemplateColumns: '1fr' }}>
        {step === 'form' ? <>
          <Field label="Current email"><input value={me.email || ''} disabled readOnly /></Field>
          <Field label="New email"><input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Current password"><input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
        </> : <>
          <p className="muted" style={{ margin: 0 }}>We sent a 6-digit code to {email}. Enter it to confirm.</p>
          <Field label="Verification code">
            <input inputMode="numeric" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </Field>
        </>}
      </div>
      <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
        {step === 'code' && <button type="button" className="ghost" disabled={wait > 0 || busy}
          onClick={() => sendCode().catch((x) => setErr(x.message))}>{wait > 0 ? `Resend in ${wait}s` : 'Resend code'}</button>}
        <button type="submit" disabled={busy}>{busy ? 'Please wait…' : step === 'form' ? 'Send code' : 'Change email'}</button>
      </div>
    </form>
  );
}

export function SettingsModal({ me, onClose }: { me: Me; onClose: () => void }) {
  const ui = useUi();
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [wait, setWait] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<'password' | 'theme'>('password');
  const [theme, setTheme] = useState<Theme>(getTheme);
  const changeTheme = (next: Theme) => { setTheme(next); saveTheme(next); };

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const sendCode = async () => {
    await api.otp({ action: 'send', purpose: 'password', current: cur });
    setWait(45);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr('');
    if (step === 'form') {
      if (!me.email) return setErr('Your account has no email on file. Ask an admin.');
      if (!cur) return setErr('Enter your current password');
      const bad = passwordProblem(pw);
      if (bad) return setErr(bad);
      if (pw !== pw2) return setErr('The two new passwords do not match');
      if (pw === cur) return setErr('Choose a password different from the current one');
      setBusy(true);
      try { await sendCode(); setStep('code'); } catch (e: any) { setErr(e.message); }
      setBusy(false);
      return;
    }
    if (!/^\d{6}$/.test(code)) return setErr('Enter the 6-digit code');
    setBusy(true);
    try {
      await api.otp({ action: 'change_password', code, password: pw });
      ui.toast.success('Password changed');
      onClose();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <Modal title="Settings" onClose={onClose} footer={<button type="button" className="ghost" onClick={onClose}>Close</button>}>
      <div className="tabs">
        <button type="button" className={tab === 'password' ? 'on' : ''} onClick={() => setTab('password')}>Change password</button>
        <button type="button" className={tab === 'theme' ? 'on' : ''} onClick={() => setTab('theme')}>Theme</button>
      </div>

      {tab === 'theme' && <>
        <h4 className="sechead" style={{ marginTop: 0, borderBottom: 'none' }}>Color mode</h4>
        <div className="theme-modes" role="radiogroup" aria-label="Color mode">
          {(['light', 'dark', 'system'] as const).map((mode) => <label key={mode} className="theme-mode">
            <input type="radio" name="theme-mode" checked={theme.mode === mode} onChange={() => changeTheme({ ...theme, mode })} />
            <span>{mode[0].toUpperCase() + mode.slice(1)}</span>
          </label>)}
        </div>
        <h4 className="sechead" style={{ borderBottom: 'none' }}>Theme colour</h4>
        <div className="swatches" aria-label="Theme colour">
          {Object.entries(ACCENTS).map(([name, colors]) => <button key={name} type="button"
            className={`swatch ${theme.accent === name ? 'on' : ''}`} title={name} aria-label={`${name} theme colour`}
            style={{ background: colors[0] }} onClick={() => changeTheme({ ...theme, accent: name })} />)}
        </div>
      </>}

      {tab === 'password' && (
        <form id="pwform" onSubmit={submit} noValidate>
          {err && <div className="alert error">{err}</div>}
          {step === 'form' ? (
            <div className="fields" style={{ gridTemplateColumns: '1fr' }}>
              <Field label="Current password"><input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
              <Field label="New password"><input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
              <small className="muted">{PASSWORD_RULE}</small>
              <Field label="Confirm new password"><input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
            </div>
          ) : (
            <div className="fields" style={{ gridTemplateColumns: '1fr' }}>
              <p className="muted" style={{ margin: 0 }}>We sent a 6-digit code to {me.email}. Enter it to confirm the change.</p>
              <Field label="Verification code">
                <input inputMode="numeric" maxLength={6} autoFocus value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              </Field>
            </div>
          )}
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            {step === 'code' && <button type="button" className="ghost" disabled={wait > 0 || busy}
              onClick={() => sendCode().catch((e) => setErr(e.message))}>{wait > 0 ? `Resend in ${wait}s` : 'Resend code'}</button>}
            <button type="submit" disabled={busy}>{busy ? 'Please wait…' : step === 'form' ? 'Send code' : 'Change password'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}
