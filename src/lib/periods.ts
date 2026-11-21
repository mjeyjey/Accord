export const SEM = ['', '1st semester', '2nd semester', 'Summer'];

// Local date (not UTC), so Philippine time does not flip the day early.
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const monthYear = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

// "Midterm · 1st semester · November 2026"
export const periodTitle = (p?: any) => (p ? `${p.name} · ${SEM[p.semester] || 'Semester'} · ${monthYear(p.start_date)}` : 'Other dates');

export function groupBy<T>(list: T[], key: (x: T) => string): T[][] {
  const m = new Map<string, T[]>();
  for (const x of list) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k)!.push(x); }
  return [...m.values()];
}

// Groups rows by exam period, newest period first. Uses periodOf(row) if given, else finds the period containing the date.
export function groupByPeriod<T>(rows: T[], periods: any[], dateOf: (r: T) => string, periodOf?: (r: T) => any) {
  const m = new Map<string, { key: string; period?: any; rows: T[] }>();
  for (const r of rows) {
    const p = periodOf?.(r) || periods.find((x) => dateOf(r) >= x.start_date && dateOf(r) <= x.end_date);
    const key = p?.id || 'other';
    if (!m.has(key)) m.set(key, { key, period: p, rows: [] });
    m.get(key)!.rows.push(r);
  }
  return [...m.values()].sort((a, b) => (b.period?.start_date || '').localeCompare(a.period?.start_date || ''));
}
