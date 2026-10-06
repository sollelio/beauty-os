// command_id is separate from any entity id (ADR-0006).
export function newCommandId(): string {
  return crypto.randomUUID()
}
