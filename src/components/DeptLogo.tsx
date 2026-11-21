import { useRef, useState } from 'react';
import { api } from '../lib/api';
import { useUi } from './ui';

// Shrink to max 256px and keep transparency (PNG).
const shrink = (file: File) => new Promise<string>((res, rej) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const k = Math.min(1, 256 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    res(c.toDataURL('image/png'));
  };
  img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That file is not an image')); };
  img.src = url;
});

export default function DeptLogo({ dept, onSaved, preview = false }: { dept: any; onSaved: () => void; preview?: boolean }) {
  const ui = useUi();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const save = async (logo_url: string | null) => {
    setBusy(true);
    try { await api.update('departments', dept.id, { logo_url }); ui.toast.success(logo_url ? 'Logo saved' : 'Logo removed'); onSaved(); }
    catch (e: any) { ui.toast.error(e.message); }
    setBusy(false);
  };
  const pick = async (f?: File) => {
    if (!f) return;
    try { await save(await shrink(f)); } catch (e: any) { ui.toast.error(e.message); }
    if (input.current) input.current.value = '';
  };
  return (
    <div className="logoedit">
      {preview ? (dept.logo_url ? <img className="dlogo big" src={dept.logo_url} alt="" /> : <span className="dlogo big ph">{dept.code}</span>)
        : dept.logo_url ? <img className="dlogo big" src={dept.logo_url} alt="" /> : <span className="muted">No logo yet</span>}
      <div className="row">
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        <button type="button" className="ghost sm" disabled={busy} onClick={() => input.current?.click()}>
          {dept.logo_url ? 'Change logo' : 'Upload logo'}
        </button>
        {dept.logo_url && <button type="button" className="ghost red sm" disabled={busy} onClick={() => save(null)}>Remove</button>}
      </div>
    </div>
  );
}
