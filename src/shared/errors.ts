// Maps Supabase/PostgREST failures to the app's error kinds (Architecture Definition §17).
export type DomainCode =
  | 'NOT_AUTHORIZED' | 'ALREADY_BOUND' | 'ENROLLMENT_INVALID' | 'CROSS_TENANT_REFERENCE'
  | 'VALIDATION_FAILED' | 'MIXED_PAYMENT_MISMATCH' | 'IDEMPOTENCY_CONFLICT'
  | 'VERIFICATION_REQUIRED' | 'INVALID' | 'LOCKED' | 'CONTRIBUTIONS_MISMATCH' | 'PERIOD_NOT_FOUND'

const DOMAIN_CODES: readonly DomainCode[] = [
  'NOT_AUTHORIZED', 'ALREADY_BOUND', 'ENROLLMENT_INVALID', 'CROSS_TENANT_REFERENCE',
  'VALIDATION_FAILED', 'MIXED_PAYMENT_MISMATCH', 'IDEMPOTENCY_CONFLICT',
  'VERIFICATION_REQUIRED', 'INVALID', 'LOCKED', 'CONTRIBUTIONS_MISMATCH', 'PERIOD_NOT_FOUND',
]

export class AppError extends Error {
  readonly kind: 'network' | 'domain' | 'unexpected'
  readonly code?: DomainCode
  constructor(kind: AppError['kind'], message: string, code?: DomainCode) {
    super(message)
    this.kind = kind
    this.code = code
  }
}

type RawError = { message?: string; code?: string } | null | undefined

export function toAppError(error: RawError | unknown): AppError {
  if (error instanceof AppError) return error
  const e = (error ?? {}) as { message?: string; code?: string; name?: string }
  const message = e.message ?? String(error)
  const code = DOMAIN_CODES.find((c) => message === c)
  if (code) return new AppError('domain', message, code)
  if (!e.code && (e.name === 'TypeError' || /fetch|network|load failed/i.test(message))) {
    return new AppError('network', message)
  }
  return new AppError('unexpected', message)
}
