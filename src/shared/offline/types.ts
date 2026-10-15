// Offline V1 local persistence contracts (ADR-0010 §6). Infrastructure only: no flow writes here yet (Offline 4 / 6).
// Every record is plain, structured-clone-safe data — ISO-8601 UTC strings for times, integer minor units for money,
// no class instances — and carries its partition: the organization and the device principal (Supabase auth user id;
// one anonymous user is one device binding, re-enrollment is a new user and therefore a new partition).

export type Partition = { organizationId: string; deviceUserId: string }

/** JSON-shaped data: what payloads, acknowledgements and snapshot contents may contain. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }

// ---------- outbox: commands captured on this device, replayed with the same command id (ADR-0010 §9) ----------
export const OUTBOX_STATES = ['local', 'syncing', 'synced', 'failed', 'conflict'] as const
export type OutboxState = (typeof OUTBOX_STATES)[number]
/** Full offline is Registar serviço only (ADR-0010 §1); movements are drafts, never queued commands. */
export const OUTBOX_TYPES = ['record_service'] as const
export type OutboxType = (typeof OUTBOX_TYPES)[number]

export type OutboxItem = Partition & {
  commandId: string
  deviceId: string | null           // the server binding id is not exposed to the client today: always null for now
  type: OutboxType
  payload: JsonObject               // the approved command arguments, without the command id and the capture time
  occurredAt: string                // the captured business-event time, sent as p_occurred_at
  createdAt: string
  state: OutboxState
  attempts: number
  nextAttemptAt: string | null
  lastError: string | null          // a domain code or a short failure description; never a server payload
  ack: JsonObject | null            // the server's result once synced
}
export type NewOutboxItem = Pick<OutboxItem, 'commandId' | 'type' | 'payload' | 'occurredAt'> & { deviceId?: string | null }
export type OutboxStatePatch = {
  state: OutboxState
  attempts?: number
  nextAttemptAt?: string | null
  lastError?: string | null
  ack?: JsonObject | null
}

// ---------- drafts: movements kept on the device until the online PIN confirmation (ADR-0010 §3) ----------
export const DRAFT_TYPES = ['advance', 'expense', 'purchase'] as const
export type DraftType = (typeof DRAFT_TYPES)[number]
export const DRAFT_STATES = ['draft', 'submitted'] as const
export type DraftState = (typeof DRAFT_STATES)[number]

export type Draft = Partition & {
  draftId: string
  deviceId: string | null
  type: DraftType
  payload: JsonObject               // never a PIN, a grant id or private-session state
  capturedAt: string
  state: DraftState
  createdAt: string
  updatedAt: string
}
export type NewDraft = Pick<Draft, 'draftId' | 'type' | 'payload' | 'capturedAt'> & { state?: DraftState; deviceId?: string | null }

// ---------- snapshot: previously synced public operational lists, dated (ADR-0010 §1, §6) ----------
export const SNAPSHOT_GROUPS = [
  'services', 'people', 'paymentMethods', 'expenseCategories', 'purchaseOrigins', 'products', 'unitWords', 'hojeSummary',
] as const
export type SnapshotGroup = (typeof SNAPSHOT_GROUPS)[number]

export type SnapshotRecord = Partition & {
  group: SnapshotGroup
  version: number                   // the shape version of `data`, chosen by the writer
  fetchedAt: string
  data: JsonValue                   // usually the list of items; an object for a summary
}
export type SnapshotInput = Pick<SnapshotRecord, 'version' | 'fetchedAt' | 'data'>
export type SnapshotMeta = Pick<SnapshotRecord, 'group' | 'version' | 'fetchedAt'> & { size: number | null }

// ---------- meta: per-partition values for later synchronization ----------
export type MetaValues = {
  lastSuccessfulSyncAt: string
  lastServerTimeOffsetMs: number
  storageSchemaVersion: number
  storagePersistGranted: boolean
}
export type MetaKey = keyof MetaValues
export const META_KEYS = ['lastSuccessfulSyncAt', 'lastServerTimeOffsetMs', 'storageSchemaVersion', 'storagePersistGranted'] as const satisfies readonly MetaKey[]
export type MetaRecord<K extends MetaKey = MetaKey> = Partition & { key: K; value: MetaValues[K]; updatedAt: string }
