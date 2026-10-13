// States kit (UX slice 4): three states that never look alike and are announced correctly.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { EmptyState, ErrorState, Skeleton } from './states'

describe('Skeleton', () => {
  it('is a busy status with row shapes, invisible at first (CSS delay) and never readable as content', () => {
    render(<Skeleton rows={2} headline />)
    const s = screen.getByRole('status', { name: 'A carregar' })
    expect(s.getAttribute('aria-busy')).toBe('true')
    expect(s.className).toBe('skeleton')
    expect(s.querySelectorAll('.skeleton-row')).toHaveLength(2)
    expect(s.querySelectorAll('.skeleton-headline')).toHaveLength(1)
    expect(s.textContent).toBe('')
  })
})

describe('EmptyState', () => {
  it('icon, title, one sentence and an optional action, scoped to its section', () => {
    render(<EmptyState icon="person" title="Ainda sem equipa" action={<button>Juntar</button>}>Aparecem aqui as pessoas que fazem serviços.</EmptyState>)
    const e = screen.getByRole('status')
    expect(within(e).getByText('Ainda sem equipa').className).toBe('empty-state-title')
    expect(within(e).getByText('Aparecem aqui as pessoas que fazem serviços.')).toBeTruthy()
    expect(within(e).getByRole('button', { name: 'Juntar' })).toBeTruthy()
    expect(e.querySelector('svg[aria-hidden="true"]')).toBeTruthy()
  })
})

describe('ErrorState', () => {
  it('is an alert in plain words with Retry that calls back, plus an optional extra action', () => {
    const onRetry = vi.fn()
    render(<ErrorState onRetry={onRetry} action={<button>Voltar à lista</button>}>Não foi possível carregar a lista.</ErrorState>)
    const a = screen.getByRole('alert')
    expect(a.textContent).toContain('Não foi possível carregar a lista.')
    fireEvent.click(within(a).getByRole('button', { name: 'Tentar novamente' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(within(a).getByRole('button', { name: 'Voltar à lista' })).toBeTruthy()
  })
  it('without a retry handler there is no Retry button', () => {
    render(<ErrorState>Não foi possível guardar.</ErrorState>)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
