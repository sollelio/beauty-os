// L4a · the Registar serviço screens as props-only parts: they render without any provider (no router, organization,
// query client or offline runtime), report the person's actions through callbacks, and touch no server, IndexedDB or
// storage — so the Interactive Guide (L4b) can render them with synthetic data. The production flow's behaviour is
// covered, unchanged, by RecordServiceFlow.test.tsx and RecordServiceFlow.offline.test.tsx.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../shared/supabase/client', () => ({
  getSupabase: vi.fn(() => { throw new Error('the screens must not use Supabase') }),
  authStorageKey: vi.fn(() => { throw new Error('the screens must not read the session') }),
}))
import { getSupabase } from '../../shared/supabase/client'
import { PersonStep, ServiceConfirmBar, ServiceOutcomeActions, ServicePicker, ServiceRecorded, ServiceSavedOnDevice, ValuePaymentStep } from './RecordServiceViews'

const fmt = { currency_exponent: 2, currency_symbol: '€', timezone: 'Europe/Lisbon' }
const ana = { id: 'p1', display_name: 'Joana', capabilities: ['Cabelo', 'Unhas'] }
const corte = { id: 's1', name: 'Corte', default_price_minor: 2000 }, cor = { id: 's2', name: 'Coloração', default_price_minor: 4500 }
const methods = [{ id: 'm1', code: 'a', label: 'Numerário' }, { id: 'm2', code: 'b', label: 'Transferência' }]

let idbOpen: ReturnType<typeof vi.fn>
let getItem: ReturnType<typeof vi.spyOn>, setItem: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  idbOpen = vi.fn(); vi.stubGlobal('indexedDB', { open: idbOpen })
  getItem = vi.spyOn(Storage.prototype, 'getItem'); setItem = vi.spyOn(Storage.prototype, 'setItem')
})
afterEach(() => {
  expect(getSupabase).not.toHaveBeenCalled()
  expect(idbOpen).not.toHaveBeenCalled()
  expect(getItem).not.toHaveBeenCalled()
  expect(setItem).not.toHaveBeenCalled()
  getItem.mockRestore(); setItem.mockRestore(); vi.unstubAllGlobals()
})

describe('PersonStep', () => {
  it('shows the people, marks the chosen one and reports a pick; the caller\'s notices go above', () => {
    const onPick = vi.fn()
    render(<PersonStep people={[ana, { id: 'p2', display_name: 'Rita', capabilities: [] }]} selectedId="p1" onPick={onPick}><p>Aviso</p></PersonStep>)
    expect(screen.getByRole('heading', { name: 'Quem fez o serviço?' })).toBeTruthy()
    expect(screen.getByText('Aviso').compareDocumentPosition(screen.getByText('Joana')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const joana = screen.getByRole('button', { name: /Joana/ })
    expect(joana.getAttribute('aria-current')).toBe('true')
    expect(joana.textContent).toContain('Cabelo · Unhas')
    expect(screen.getByRole('button', { name: /Rita/ }).getAttribute('aria-current')).toBeNull()
    fireEvent.click(joana)
    expect(onPick).toHaveBeenCalledWith(ana)
  })
})

describe('ServicePicker', () => {
  const props = { person: ana, selectedId: null, draftValue: null, catalogue: [corte, cor], loadError: false, format: fmt, onChangePerson: vi.fn(), onPick: vi.fn() }
  it('frequent services first, then the full catalogue on request; search over the catalogue; the person chip', () => {
    const onChangePerson = vi.fn(), onPick = vi.fn()
    render(<ServicePicker {...props} frequent={[corte]} onChangePerson={onChangePerson} onPick={onPick} />)
    expect(screen.getByText('Frequentes de Joana')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Coloração/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ver o catálogo completo' }))
    expect(screen.getByRole('button', { name: /Coloração/ })).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Procurar serviço'), { target: { value: 'zz' } })
    expect(screen.getByText('Sem resultados para «zz».')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('Procurar serviço'), { target: { value: 'COLOR' } })
    fireEvent.click(screen.getByRole('button', { name: /Coloração/ }))
    expect(onPick).toHaveBeenCalledWith(cor)
    fireEvent.click(screen.getByRole('button', { name: 'Mudar profissional: Joana' }))
    expect(onChangePerson).toHaveBeenCalled()
  })
  it('without a frequent list: the catalogue with prices in the given currency; an edited value shows on its row', () => {
    render(<ServicePicker {...props} frequent={null} selectedId="s1" draftValue={2500} loadError />)
    expect(screen.queryByText(/Frequentes de/)).toBeNull()
    expect(screen.getByRole('alert').textContent).toBe('Não foi possível carregar o catálogo.')
    expect(screen.getByRole('button', { name: /Corte/ }).textContent).toContain('25 € · Habitual: 20 €')
    expect(screen.getByRole('button', { name: /Coloração/ }).textContent).toContain('45 €')
  })
})

describe('ValuePaymentStep', () => {
  const base = { defaultPriceMinor: 2000, editing: false, priceDigits: '', valueMinor: 2000, format: fmt, onEdit: vi.fn(), onReset: vi.fn(),
    onPriceDigits: vi.fn(), methods, methodsError: false, choice: 'm1', onChoice: vi.fn(), mixed: ['', ''] as [string, string], onMixed: vi.fn(), sentence: null }
  it('the habitual value with «Editar»; a method choice is reported', () => {
    const onEdit = vi.fn(), onChoice = vi.fn()
    render(<ValuePaymentStep {...base} onEdit={onEdit} onChoice={onChoice} />)
    expect(screen.getByText('20 €')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }))
    expect(onEdit).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Transferência' }))
    expect(onChoice).toHaveBeenCalledWith('m2')
    expect(screen.getByRole('button', { name: 'Misto' })).toBeTruthy()          // exactly two methods
  })
  it('editing: the field, «Habitual», «Repor», the different-value note — and the zero warning', () => {
    const onReset = vi.fn(), onPriceDigits = vi.fn()
    const { rerender } = render(<ValuePaymentStep {...base} editing priceDigits="25" valueMinor={2500} onReset={onReset} onPriceDigits={onPriceDigits} />)
    fireEvent.change(screen.getByLabelText('Valor'), { target: { value: '30' } })
    expect(onPriceDigits).toHaveBeenCalledWith('30')
    expect(screen.getByText('Habitual: 20 €')).toBeTruthy()
    expect(screen.getByText('Valor diferente do habitual. Fica registado no histórico.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Repor' }))
    expect(onReset).toHaveBeenCalled()
    rerender(<ValuePaymentStep {...base} editing priceDigits="0" valueMinor={0} />)
    expect(screen.getByText('Valor zero. Confirme que este serviço não foi cobrado.')).toBeTruthy()
  })
  it('Misto: the two fields and the given sentence; a methods error', () => {
    render(<ValuePaymentStep {...base} choice="mixed" sentence="Soma 30 €. Faltam 5 € para chegar aos 35 €." methodsError />)
    expect(screen.getByLabelText('Numerário')).toBeTruthy()
    expect(screen.getByLabelText('Transferência')).toBeTruthy()
    expect(screen.getByTestId('mixed-sentence').textContent).toBe('Soma 30 €. Faltam 5 € para chegar aos 35 €.')
    expect(screen.getByRole('alert').textContent).toBe('Não foi possível carregar as formas de pagamento.')
  })
})

describe('ServiceConfirmBar', () => {
  const base = { serviceName: 'Corte', personName: 'Joana', valueMinor: 2000, format: fmt, canConfirm: true, onConfirm: vi.fn(), onExit: vi.fn() }
  it('ready, pending and retry', () => {
    const onConfirm = vi.fn(), onExit = vi.fn()
    const { rerender } = render(<ServiceConfirmBar {...base} state="ready" onConfirm={onConfirm} onExit={onExit} />)
    expect(screen.getByText('Corte · Joana · 20 €')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar serviço' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    rerender(<ServiceConfirmBar {...base} state="ready" canConfirm={false} />)
    expect((screen.getByRole('button', { name: 'Confirmar serviço' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<ServiceConfirmBar {...base} state="pending" />)
    expect((screen.getByRole('button', { name: 'A guardar…' }) as HTMLButtonElement).disabled).toBe(true)
    rerender(<ServiceConfirmBar {...base} state="retry" onConfirm={onConfirm} onExit={onExit} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sair sem guardar' }))
    expect(onConfirm).toHaveBeenCalledTimes(2)
    expect(onExit).toHaveBeenCalledTimes(1)
    rerender(<ServiceConfirmBar {...base} state="ready" valueMinor={null} />)
    expect(screen.getByText('Corte · Joana · —')).toBeTruthy()
  })
})

describe('outcomes', () => {
  it('registered: summary, time in the given timezone, «Corrigir este registo»; the two actions', () => {
    const onCorrect = vi.fn(), onAnother = vi.fn(), onLeave = vi.fn()
    render(<>
      <ServiceRecorded serviceName="Corte" personName="Joana" methodLabel="Transferência" occurredAt="2026-10-16T09:42:00Z" format={fmt} onCorrect={onCorrect} />
      <ServiceOutcomeActions onAnother={onAnother} onLeave={onLeave} />
    </>)
    expect(screen.getByRole('heading', { name: 'Serviço registado com sucesso.' })).toBeTruthy()
    expect(screen.getByText('Corte · Joana · Transferência')).toBeTruthy()
    expect(screen.getByText('Hoje às 10:42')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Corrigir este registo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Registar outro serviço' }))
    fireEvent.click(screen.getByRole('button', { name: 'Voltar a Hoje' }))
    expect([onCorrect, onAnother, onLeave].map((f) => f.mock.calls.length)).toEqual([1, 1, 1])
  })
  it('saved on this phone: never presented as registered', () => {
    render(<ServiceSavedOnDevice serviceName="Corte" personName="Joana" methodLabel="Numerário" valueMinor={2000} occurredAt="2026-10-16T09:42:00Z" format={fmt} />)
    const saved = screen.getByTestId('saved-on-device')
    expect(within(saved).getByRole('heading').textContent).toBe('Guardado neste telemóvel')
    expect(saved.textContent).toContain('Será enviado quando houver ligação.')
    expect(saved.textContent).toContain('20 € · às 10:42')
    expect(saved.textContent).not.toMatch(/registado/)
  })
})

describe('isolation', () => {
  it('runtime imports: React, the shared UI primitives and the pure money/time helpers only — domain shapes as types', () => {
    const src = Object.values(import.meta.glob('./RecordServiceViews.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[0]!
    const runtime = [...src.matchAll(/^import (?!type )[^'\n]*'([^']+)'/gm)].map((m) => m[1]!)
    for (const from of runtime) expect(from).toMatch(/^(react|\.\.\/\.\.\/shared\/ui\/[A-Za-z]+|\.\.\/\.\.\/shared\/(money|time))$/)
    expect(src).not.toMatch(/use(Query|Mutation|Organization|CaptureData|RecordService|Flow|Navigate)\b|supabase|indexedDB|localStorage|sessionStorage/)
  })
})
