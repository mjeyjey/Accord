const KEY = 'accord-theme';
export const ACCENTS: Record<string, string[]> = {
  Coral: ['#EC6F61', '#D95A4C', '#F6A599', '#1D2152', '#13173F'],
  Blue: ['#1A52A3', '#133F82', '#4A8FE0', '#11306E', '#0A1B3F'],
  Green: ['#1F7A5A', '#16604A', '#3FB68B', '#11503C', '#0A2B21'],
  Purple: ['#6A3FB5', '#53308F', '#9A74E0', '#3F2275', '#1E1040'],
  Rose: ['#B23A5A', '#8F2D47', '#E07A96', '#6E2036', '#3A0F1B'],
};
export type Theme = { mode: 'light' | 'dark' | 'system'; accent: string };

export const getTheme = (): Theme => {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) || '{"mode":"system","accent":"Coral"}');
    return {
      mode: ['light', 'dark', 'system'].includes(t.mode) ? t.mode : 'system',
      accent: Object.prototype.hasOwnProperty.call(ACCENTS, t.accent) ? t.accent : 'Coral',
    };
  } catch { return { mode: 'system', accent: 'Coral' }; }
};

export function applyTheme(t: Theme = getTheme()) {
  const dark = t.mode === 'dark' || (t.mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const r = document.documentElement;
  r.dataset.theme = dark ? 'dark' : 'light';
  ['--blue', '--blue-dark', '--teal', '--deep', '--navy'].forEach((v, i) => r.style.setProperty(v, (ACCENTS[t.accent] || ACCENTS.Coral)[i]));
}

export const saveTheme = (t: Theme) => { localStorage.setItem(KEY, JSON.stringify(t)); applyTheme(t); };
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
