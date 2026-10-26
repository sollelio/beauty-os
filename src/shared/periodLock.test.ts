// Why a capture was refused because of its period, in salon words (online capture; drafts fall back to it).
import { describe, expect, it } from 'vitest'
import { AppError } from './errors'
import { captureFailure } from './periodLock'

describe('capture refused by the period model', () => {
  it('a date covered by no period (Slice 4): a calm reason, never the code', () => {
    expect(captureFailure(new AppError('domain', 'NO_PERIOD_FOR_DATE', 'NO_PERIOD_FOR_DATE'), 'x'))
      .toBe('Não existe um período aberto para esta data. Confirme a data ou fale com quem gere o salão.')
  })
  it('anything else keeps the message of the flow', () => {
    expect(captureFailure(new AppError('domain', 'VALIDATION_FAILED', 'VALIDATION_FAILED'), 'Não foi possível guardar.')).toBe('Não foi possível guardar.')
  })
})
