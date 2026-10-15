// Local storage failures are explicit: there is no silent fallback (to memory or localStorage) for offline work.

export type OfflineStorageErrorCode =
  | 'UNAVAILABLE'          // no IndexedDB in this browser context
  | 'OPEN_FAILED'          // the database could not be opened or upgraded
  | 'QUOTA_EXCEEDED'       // the browser refused the write for lack of space
  | 'WRITE_FAILED'
  | 'READ_FAILED'
  | 'MALFORMED_RECORD'     // a record (to write, or read back) does not match its contract
  | 'FORBIDDEN_FIELD'      // a field name of a secret or of private data (ADR-0010 §4)
  | 'PARTITION_MISMATCH'   // a stored record does not belong to the partition it was read from
  | 'NOT_FOUND'
  | 'RECORD_CONFLICT'      // the same id with different immutable content
  | 'INVALID_TRANSITION'
  | 'UNSYNCED_WORK'        // a purge would discard work not yet on the server, without an explicit decision

export class OfflineStorageError extends Error {
  readonly code: OfflineStorageErrorCode
  readonly detail?: Record<string, number | string>
  constructor(code: OfflineStorageErrorCode, message: string, options: { cause?: unknown; detail?: Record<string, number | string> } = {}) {
    super(message, { cause: options.cause })
    this.name = 'OfflineStorageError'
    this.code = code
    this.detail = options.detail
  }
}

/** A browser storage failure as an OfflineStorageError (quota is recognised where the browser reports it). */
export function toStorageError(error: unknown, fallback: 'OPEN_FAILED' | 'WRITE_FAILED' | 'READ_FAILED'): OfflineStorageError {
  if (error instanceof OfflineStorageError) return error
  const name = (error as { name?: string } | null)?.name
  const message = (error as { message?: string } | null)?.message ?? String(error)
  return new OfflineStorageError(name === 'QuotaExceededError' ? 'QUOTA_EXCEEDED' : fallback, message, { cause: error })
}
