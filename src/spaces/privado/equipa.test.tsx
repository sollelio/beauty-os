// Equipa (private team list): loading, error and genuinely empty are three different screens.
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, fireEvent, screen, within } from '@testing-library/react'
import { Outlet } from 'react-router'
import { renderScreen } from '../../test/router'

vi.mock('../../modules/team/situation', async (orig) => ({
  ...(await orig<typeof import('../../modules/team/situation')>()),
  listTeamPeople: vi.fn(),
}))
import { listTeamPeople } from '../../modules/team/situation'
import { EquipaPage } from './EquipaPage'

const ctx = { active: true, person_id: 'm1', display_name: 'Mercy', view: 'manager', business_health: false, catalogue_manage: false, expires_at: '2099-01-01T00:00:00Z' }
const renderIt = () => renderScreen('/x', <p />, {
  entries: ['/privado/equipa'],
  routes: [{ path: '/privado', element: <Outlet context={ctx} />, children: [{ path: 'equipa', element: <EquipaPage /> }] }],
})
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}
beforeEach(() => vi.mocked(listTeamPeople).mockReset())

describe('Equipa states', () => {
  it('loading: a skeleton and nothing else; then the people', async () => {
    const d = deferred<{ id: string; display_name: string; capabilities: string[] }[]>()
    vi.mocked(listTeamPeople).mockReturnValueOnce(d.promise)
    renderIt()
    expect(await screen.findByRole('status', { name: 'A carregar' })).toBeTruthy()
    expect(screen.queryByText('Ainda sem equipa')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    await act(async () => { d.resolve([{ id: 'n', display_name: 'Nádia', capabilities: ['Cabelo'] }]) })
    expect(await screen.findByText('Nádia')).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'A carregar' })).toBeNull()
  })
  it('error: an alert with Retry, not an empty list; the retry loads the people', async () => {
    vi.mocked(listTeamPeople).mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce([{ id: 'n', display_name: 'Nádia', capabilities: [] }])
    renderIt()
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Não foi possível carregar a equipa.')
    expect(screen.queryByText('Ainda sem equipa')).toBeNull()
    fireEvent.click(within(alert).getByRole('button', { name: 'Tentar novamente' }))
    expect(await screen.findByText('Nádia')).toBeTruthy()
  })
  it('genuinely empty: its own state, with the private entries still there', async () => {
    vi.mocked(listTeamPeople).mockResolvedValueOnce([])
    renderIt()
    expect(await screen.findByText('Ainda sem equipa')).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('button', { name: /Fecho do período/ })).toBeTruthy()
  })
})
