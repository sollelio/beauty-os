export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(iso))
}

export function formatToday(timeZone: string): string {
  return new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(new Date())
}
