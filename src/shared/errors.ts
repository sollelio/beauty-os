// Maps Supabase/PostgREST failures to the app's error kinds (Architecture Definition §17).
export type DomainCode =
  | 'NOT_AUTHORIZED' | 'ALREADY_BOUND' | 'ENROLLMENT_INVALID' | 'CROSS_TENANT_REFERENCE'
  | 'VALIDATION_FAILED' | 'MIXED_PAYMENT_MISMATCH' | 'IDEMPOTENCY_CONFLICT'
  | 'VERIFICATION_REQUIRED' | 'INVALID' | 'LOCKED' | 'CONTRIBUTIONS_MISMATCH' | 'PERIOD_NOT_FOUND'
  | 'PERIOD_CLOSED' | 'PERIOD_STATE_INVALID' | 'STALE_REVIEW' | 'RULE_PENDING' | 'PAYMENT_EXCEEDS_APPROVED'
  | 'UNPAID_APPROVED_AMOUNTS' | 'RESERVE_INSUFFICIENT' | 'RESERVE_EXCEEDS_RECORD' | 'PERIOD_APPROVED'
  | 'RECORD_ALREADY_CANCELLED' | 'RECORD_IN_USE' | 'NAME_TAKEN' | 'CATALOGUE_INACTIVE'
  | 'CAPTURE_TIME_TOO_OLD' | 'CAPTURE_TIME_IN_FUTURE' | 'PERSON_INACTIVE' | 'SERVICE_INACTIVE'
  | 'PAYMENT_METHOD_INACTIVE' | 'CATEGORY_INACTIVE' | 'ORIGIN_INACTIVE' | 'PERIOD_OFFLINE_SYNC_PENDING'
  | 'DEVICE_ONLINE_ONLY' | 'PERIOD_WEEK_ENDED' | 'WEEK_END_TOO_EARLY' | 'WEEK_END_NOT_AVAILABLE' | 'WEEK_NOT_ENDED'
  | 'PERSON_NOT_PERSONNEL' | 'NO_PERIOD_FOR_DATE'

const DOMAIN_CODES: readonly DomainCode[] = [
  'NOT_AUTHORIZED', 'ALREADY_BOUND', 'ENROLLMENT_INVALID', 'CROSS_TENANT_REFERENCE',
  'VALIDATION_FAILED', 'MIXED_PAYMENT_MISMATCH', 'IDEMPOTENCY_CONFLICT',
  'VERIFICATION_REQUIRED', 'INVALID', 'LOCKED', 'CONTRIBUTIONS_MISMATCH', 'PERIOD_NOT_FOUND',
  'PERIOD_CLOSED', 'PERIOD_STATE_INVALID', 'STALE_REVIEW', 'RULE_PENDING', 'PAYMENT_EXCEEDS_APPROVED',
  'UNPAID_APPROVED_AMOUNTS', 'RESERVE_INSUFFICIENT', 'RESERVE_EXCEEDS_RECORD', 'PERIOD_APPROVED',
  'RECORD_ALREADY_CANCELLED', 'RECORD_IN_USE', 'NAME_TAKEN', 'CATALOGUE_INACTIVE',
  'CAPTURE_TIME_TOO_OLD', 'CAPTURE_TIME_IN_FUTURE', 'PERSON_INACTIVE', 'SERVICE_INACTIVE',
  'PAYMENT_METHOD_INACTIVE', 'CATEGORY_INACTIVE', 'ORIGIN_INACTIVE', 'PERIOD_OFFLINE_SYNC_PENDING',
  'DEVICE_ONLINE_ONLY', 'PERIOD_WEEK_ENDED', 'WEEK_END_TOO_EARLY', 'WEEK_END_NOT_AVAILABLE', 'WEEK_NOT_ENDED',
  'PERSON_NOT_PERSONNEL', 'NO_PERIOD_FOR_DATE',
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
