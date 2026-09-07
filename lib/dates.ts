export function todayStr(): string {
  return toStr(new Date());
}

export function toStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fromStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(s: string, n: number): string {
  const d = fromStr(s);
  d.setDate(d.getDate() + n);
  return toStr(d);
}

export function daysBetween(a: string, b: string): number {
  const ms = fromStr(b).getTime() - fromStr(a).getTime();
  return Math.round(ms / 86400000);
}

export function yesterdayStr(): string {
  return addDays(todayStr(), -1);
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function prettyDate(s: string): string {
  const d = fromStr(s);
  return `${DAY_SHORT[d.getDay()]}, ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
}

export function longDate(d: Date): string {
  return `${DAY_NAMES[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Most recent `weekday` (0-6) on or before `s` — allowance week start anchor. */
export function weekStartOnOrBefore(s: string, weekday: number): string {
  const d = fromStr(s);
  const diff = (d.getDay() - weekday + 7) % 7;
  return addDays(s, -diff);
}

export function fmtMoney(n: number, currency = "\u20A6"): string {
  const v = Math.round(n * 100) / 100;
  return `${currency}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

/** Minutes -> "2h 35m" / "45m". */
export function fmtMins(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h ${r}m` : `${r}m`;
}
