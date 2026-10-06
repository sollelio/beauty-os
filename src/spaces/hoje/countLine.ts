import type { HojeSummary } from '../../modules/services/api'
import { formatTime } from '../../shared/time'

// Salon-level count line (Slice 01 §3): counts only, no money totals.
export function countLine(s: HojeSummary, timeZone: string): string {
  if (s.total === 0) return 'Ainda não há serviços registados hoje.'
  const parts = [`${s.total} ${s.total === 1 ? 'serviço registado' : 'serviços registados'} hoje`]
  for (const m of s.by_method) parts.push(`${m.count} ${(m.label ?? 'misto').toLowerCase()}`)
  if (s.last_at) parts.push(`último às ${formatTime(s.last_at, timeZone)}`)
  return parts.join(' · ')
}
