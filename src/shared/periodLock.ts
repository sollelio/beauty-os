// Why a capture was refused because of its period (Slice 06 decisions, 2026-10-07). Shown on the shared device:
// it names the period's state only, never a figure.
import type { AppError } from './errors'

const PERIOD_LOCK: Partial<Record<string, string>> = {
  PERIOD_APPROVED: 'Este período já tem os valores aprovados: não entram novos registos. Para mudar, a gestão tem de anular a aprovação no Fecho (só é possível antes de haver pagamentos).',
  PERIOD_CLOSED: 'Este período está fechado: não entram novos registos.',
}

export function captureFailure(err: AppError | null | undefined, fallback: string): string {
  return (err?.code && PERIOD_LOCK[err.code]) || fallback
}
