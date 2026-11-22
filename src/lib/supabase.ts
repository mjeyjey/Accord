import { createClient } from '@supabase/supabase-js';

// Browser client: only used for signing in. Data goes through /api.
const FLAG = 'accord-remember';
const isAuthKey = (k: string) => k.startsWith('sb-');

try {
  if (localStorage.getItem(FLAG) === null && Object.keys(localStorage).some(isAuthKey)) localStorage.setItem(FLAG, '1');
} catch { /* storage blocked */ }

const remembered = () => { try { return localStorage.getItem(FLAG) === '1'; } catch { return false; } };

const storage = {
  getItem: (k: string) => { try { return sessionStorage.getItem(k) ?? localStorage.getItem(k); } catch { return null; } },
  setItem: (k: string, v: string) => {
    try {
      const [on, off] = remembered() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
      on.setItem(k, v); off.removeItem(k);
    } catch { /* ignore */ }
  },
  removeItem: (k: string) => { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* ignore */ } },
};

export function setRemember(on: boolean) {
  try {
    if (on) {
      localStorage.setItem(FLAG, '1');
      for (const k of Object.keys(sessionStorage)) if (isAuthKey(k)) {
        const v = sessionStorage.getItem(k); if (v !== null) localStorage.setItem(k, v);
        sessionStorage.removeItem(k);
      }
    } else {
      localStorage.removeItem(FLAG);
    }
  } catch { /* ignore */ }
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  { auth: { storage, persistSession: true, autoRefreshToken: true } },
);

supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') setRemember(false); });
