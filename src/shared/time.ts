export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso))
}

export function formatToday(timeZone: string): string {
  return new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(new Date())
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Calendar date in the organization's timezone, "YYYY-MM-DD" (for grouping by day). */
export function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone }).format(new Date(iso))
}

/** "18 out", as in the approved designs. Accepts a timestamp or a plain "YYYY-MM-DD" date. */
export function formatDayShort(isoOrDate: string, timeZone: string): string {
  const [, m, d] = (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate) ? isoOrDate : dayKey(isoOrDate, timeZone)).split('-')
  return `${Number(d)} ${MONTHS[Number(m) - 1]}`
}
