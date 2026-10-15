// Offline 3 · status UI: "Sem ligação" only offline, no claim that work is kept offline, counts without content.
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import { INACTIVE_RUNTIME, OfflineRuntimeContext } from '../offline/runtime'
import type { LocalStatus } from '../offline/status'
import { pendingRows, PRIVATE_NEEDS_CONNECTION } from './offlineCopy'
import { ConnectivityBanner, NeedsConnection, SyncStatusSheet } from './OfflineStatus'

let online = true
Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online })
const go = (v: boolean) => act(() => { online = v; window.dispatchEvent(new Event(v ? 'online' : 'offline')) })
afterEach(() => { online = true })

const org = { id: 'o', name: 'Org', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const local = (over: Partial<LocalStatus> = {}): LocalStatus => ({
  schemaVersion: 1, outboxPending: 0, outboxFailed: 0, outboxConflicts: 0, draftsPending: 0, draftsReview: 0, lastSuccessfulSyncAt: null,
  foreign: { partitions: 0, unsyncedWork: 0 }, ...over,
})

describe('Sem ligação', () => {
  it('appears only while offline, calmly, without promising that work is saved offline', () => {
    render(<ConnectivityBanner />)
    expect(screen.queryByText('Sem ligação')).toBeNull()
    go(false)
    const banner = screen.getByRole('status')
    expect(banner.textContent).toBe('Sem ligaçãoAlgumas ações precisam de ligação.')
    expect(banner.textContent).not.toMatch(/guardad|telemóvel|enviad/i)
    go(true)
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('the online-only guard shows its note offline and the content online', () => {
    render(<NeedsConnection message={PRIVATE_NEEDS_CONNECTION}><p>Área privada</p></NeedsConnection>)
    expect(screen.getByText('Área privada')).toBeTruthy()
    go(false)
    expect(screen.getByRole('status').textContent).toBe('A área privada precisa de ligação.')
    expect(screen.queryByText('Área privada')).toBeNull()
  })
})

describe('local work', () => {
  it('a row only when something is pending', () => {
    const none = { send: null, confirm: null, confirmReview: null }
    expect(pendingRows(null)).toEqual(none)
    expect(pendingRows(local())).toEqual(none)
    expect(pendingRows(local({ outboxPending: 1 }))).toEqual({ ...none, send: '1 registo por enviar' })
    // never combined: services to send and movements to confirm with PIN are counted apart
    expect(pendingRows(local({ outboxPending: 3, draftsPending: 2 }))).toEqual({ send: '3 registos por enviar', confirm: '2 por confirmar com PIN', confirmReview: null })
    expect(pendingRows(local({ draftsPending: 1, draftsReview: 1 }))).toEqual({ send: null, confirm: '1 por confirmar com PIN', confirmReview: '1 precisa de revisão' })
  })
  it('the status sheet shows counts and dates only', () => {
    online = false
    render(
      <MemoryRouter><OrganizationContext.Provider value={org}>
        <OfflineRuntimeContext.Provider value={{ ...INACTIVE_RUNTIME, partitionActive: true, storage: 'ready',
          local: local({ outboxPending: 4, outboxFailed: 1, outboxConflicts: 1, draftsPending: 2, lastSuccessfulSyncAt: '2026-10-15T08:30:00.000Z' }) }}>
          <SyncStatusSheet onDismiss={() => {}} />
        </OfflineRuntimeContext.Provider>
      </OrganizationContext.Provider></MemoryRouter>,
    )
    const rows = [...screen.getByTestId('sync-status').querySelectorAll('div')].map((d) => [d.querySelector('dt')!.textContent, d.querySelector('dd')!.textContent])
    expect(rows).toEqual([['Ligação', 'Sem ligação'], ['Por enviar', '2'], ['Envio falhou', '1'], ['Por confirmar com PIN', '2'],
      ['Para rever', '1'], ['Último envio', '15 out, 09:30']])
    expect(document.body.textContent).not.toMatch(/payload|outbox|draft|sync|partition|minor/i)
  })
})

describe('Enviar agora', () => {
  const sheet = (l: LocalStatus, syncNow = vi.fn(async () => null)) => {
    render(
      <MemoryRouter><OrganizationContext.Provider value={org}>
        <OfflineRuntimeContext.Provider value={{ ...INACTIVE_RUNTIME, partitionActive: true, storage: 'ready', local: l, syncNow }}>
          <SyncStatusSheet onDismiss={() => {}} />
        </OfflineRuntimeContext.Provider>
      </OrganizationContext.Provider></MemoryRouter>,
    )
    return syncNow
  }
  it('online with work to send: one tap runs a cycle', () => {
    const syncNow = sheet(local({ outboxPending: 2 }))
    fireEvent.click(screen.getByRole('button', { name: 'Enviar agora' }))
    expect(syncNow).toHaveBeenCalledTimes(1)
  })
  it('not offered offline, nor when only reviews are left', () => {
    online = false
    sheet(local({ outboxPending: 2 }))
    expect(screen.queryByRole('button', { name: 'Enviar agora' })).toBeNull()
  })
  it('only conflicts: a review note, no send button', () => {
    sheet(local({ outboxPending: 1, outboxConflicts: 1 }))
    expect(screen.queryByRole('button', { name: 'Enviar agora' })).toBeNull()
    expect(screen.getByText(/precisam de revisão/)).toBeTruthy()
  })
})

