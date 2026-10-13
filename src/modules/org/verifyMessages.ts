export const VERIFY_MESSAGES: Record<string, string> = {
  INVALID: 'PIN incorreto.',
  LOCKED: 'Demasiadas tentativas. Tente mais tarde.',
  NOT_AUTHORIZED: 'Esta pessoa não pode confirmar este registo.',
  VERIFICATION_REQUIRED: 'É necessária a confirmação de uma pessoa autorizada.',
}

/** A failure of the person/PIN verification itself — shown at the PIN control (PinConfirm), not as a page notice. */
export const isPinError = (err: { kind?: string; code?: string | null } | null | undefined) =>
  Boolean(err && err.kind === 'domain' && err.code && err.code in VERIFY_MESSAGES)
