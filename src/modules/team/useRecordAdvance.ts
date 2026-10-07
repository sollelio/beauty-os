import { useVerifiedCommand } from '../org/useVerifiedCommand'
import { recordAdvance, type RecordAdvanceInput, type RecordAdvanceResult } from './api'

export type { VerifiedArgs as ConfirmArgs } from '../org/useVerifiedCommand'

export function useRecordAdvance() {
  return useVerifiedCommand<RecordAdvanceInput, RecordAdvanceResult>(recordAdvance)
}
