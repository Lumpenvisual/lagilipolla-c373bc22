// Date/time helpers. Matches are stored in UTC; participants are in ET (EDT = UTC-4 during June).
const ET_OFFSET_HOURS = -4;

type FmtLang = "es" | "en" | "fr";

const MONTHS: Record<FmtLang, string[]> = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  es: ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"],
  fr: ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."],
};

// Module-level current language, kept in sync by the i18n provider via setFormatLang().
let currentLang: FmtLang = "es";

export function setFormatLang(lang: FmtLang): void {
  currentLang = lang;
}

function months(): string[] {
  return MONTHS[currentLang] ?? MONTHS.en;
}

function toET(date: Date): Date {
  // Shift to ET by applying the fixed June offset to the UTC components.
  return new Date(date.getTime() + ET_OFFSET_HOURS * 60 * 60 * 1000);
}

/** "Jun 11 · 3:00 PM ET" */
export function formatET(iso: string): string {
  const et = toET(new Date(iso));
  const month = months()[et.getUTCMonth()];
  const day = et.getUTCDate();
  let h = et.getUTCHours();
  const m = et.getUTCMinutes().toString().padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${month} ${day} · ${h}:${m} ${ampm} ET`;
}

/** "(19:00 UTC)" */
export function formatUTC(iso: string): string {
  const d = new Date(iso);
  const h = d.getUTCHours().toString().padStart(2, "0");
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  return `${h}:${m} UTC`;
}

/** "Jun 11" ET date label used for grouping. */
export function dateLabelET(iso: string): string {
  const et = toET(new Date(iso));
  return `${months()[et.getUTCMonth()]} ${et.getUTCDate()}`;
}

export function isLocked(iso: string, now: number = Date.now()): boolean {
  return new Date(iso).getTime() <= now;
}

export function hoursUntil(iso: string, now: number = Date.now()): number {
  return (new Date(iso).getTime() - now) / (1000 * 60 * 60);
}

export type Countdown = { days: number; hours: number; minutes: number; seconds: number; done: boolean };

export function countdownTo(targetIso: string, now: number = Date.now()): Countdown {
  const diff = new Date(targetIso).getTime() - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);
  return { days, hours, minutes, seconds, done: false };
}

export function formatCAD(amount: number): string {
  return `$${Math.round(amount).toLocaleString("en-CA")} CAD`;
}
