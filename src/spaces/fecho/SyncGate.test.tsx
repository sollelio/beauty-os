// Fecho's sync status sheet, per phone (Offline 7 follow-up): which phone blocks the period, why, and what to do on it —
// in salon words, by enrollment label, never a device id; the counts summary on top; the old counts without per-device data.
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { OrganizationContext } from '../../modules/org/OrganizationContext'
import type { SyncDevice, SyncStatus } from '../../modules/period/api'
import { SyncNotice, SyncStatusSheet } from './SyncGate'

const org = { id: 'o', name: 'Salão', timezone: 'Africa/Luanda', currency_code: 'AOA', currency_exponent: 2, currency_symbol: 'Kz' }
const dev = (label: string | null, state: SyncDevice['state'], more: Partial<SyncDevice> = {}): SyncDevice =>
  ({ label, state, enrolled_at: '2026-10-14T08:00:00Z', reported_at: '2026-10-19T13:05:00Z', this_device: false, services: 0, drafts: 0, conflicts: 0, ...more })
const status = (devices: SyncDevice[], periodEnded = true): SyncStatus => ({
  ready: devices.filter((d) => d.state === 'ready').length, pending: devices.filter((d) => d.state === 'pending').length,
  silent: devices.filter((d) => d.state === 'silent').length, safe: devices.every((d) => d.state === 'ready'), period_ended: periodEnded, devices,
})
function sheet(s: SyncStatus, onRefresh = vi.fn()) {
  return render(<OrganizationContext.Provider value={org}>
    <SyncStatusSheet status={s} verb="aprovar" endsOn="2026-10-18" onDismiss={() => {}} onRefresh={onRefresh} refreshing={false} />
  </OrganizationContext.Provider>)
}
const row = (name: string) => screen.getByRole('region', { name })
const text = (name: string) => row(name).textContent ?? ''

describe('Fecho sync status per phone', () => {
  it('several phones: the count, attention first, and for each one why it blocks and what to do there', () => {
    sheet(status([
      dev('Telemóvel do salão', 'ready', { this_device: true }),
      dev('Telemóvel da Merce', 'silent', { reported_at: '2026-10-17T13:05:00Z' }),
      dev('Telemóvel antigo', 'pending', { services: 2 }),
      dev(null, 'pending', { conflicts: 1, drafts: 3 }),
    ]))
    expect(screen.getByTestId('sync-gate-summary').textContent).toBe('3 telemóveis precisam de atençãoResolva os pontos abaixo antes de aprovar este período.')
    const names = [...screen.getByTestId('sync-devices').querySelectorAll('section')].map((s) => s.getAttribute('aria-label'))
    expect(names).toEqual(['Telemóvel antigo', 'Telemóvel sem nome', 'Telemóvel da Merce', 'Telemóvel do salão'])

    expect(text('Telemóvel do salão')).toMatch(/· este telemóvel.*Sincronizado.*Este telemóvel já está pronto para o fecho\./)
    expect(text('Telemóvel antigo')).toMatch(/Registos por enviar.*Este telemóvel ainda tem 2 registos por enviar\..*Abra o Beauty OS neste telemóvel com Internet e aguarde a sincronização\./)
    const review = text('Telemóvel sem nome')
    expect(review).toMatch(/Precisa de revisão/)
    expect(review).toMatch(/Há um registo que precisa de ser revisto neste telemóvel\./)
    expect(review).toMatch(/Há 3 movimentos guardados neste telemóvel por confirmar com PIN\./)
    expect(review).toMatch(/no Hoje, toque em «para rever»/)
    expect(review).toMatch(/toque em «por confirmar com PIN» e confirme cada um/)
    const silent = text('Telemóvel da Merce')
    expect(silent).toMatch(/Sem estado recente.*Este telemóvel ainda não confirmou o seu estado depois do fim do período\./)
    expect(silent).toMatch(/Abra o Beauty OS neste telemóvel com Internet para confirmar o estado\./)
    expect(silent).toMatch(/Último contacto: 17 out às 14:05/)                                  // Luanda time
    expect(silent).toMatch(/Se este telemóvel deixou de ser usado, contacte a Sollelio para o desligar do salão\./)
    expect(text('Telemóvel antigo')).not.toMatch(/contacte a Sollelio/)
    expect(text('Telemóvel do salão')).toMatch(/Ligado ao salão desde 14 out/)
    expect(document.body.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-|IndexedDB|journal|period_device_sync/)
  })
  it('one phone: singular wording', () => {
    sheet(status([dev('Telemóvel do salão', 'ready'), dev('Telemóvel da Merce', 'pending', { services: 1 })]))
    expect(screen.getByTestId('sync-gate-summary').textContent).toMatch(/^1 telemóvel precisa de atenção/)
    expect(text('Telemóvel da Merce')).toMatch(/ainda tem 1 registo por enviar\./)
  })
  it('this phone without a check-in after the end: it needs a connection here', () => {
    sheet(status([dev('Telemóvel do salão', 'silent', { this_device: true })]))
    expect(text('Telemóvel do salão')).toMatch(/Precisa de ligação.*Ligue-o à Internet e toque em «Atualizar»\./)
    expect(text('Telemóvel do salão')).not.toMatch(/contacte a Sollelio/)
  })
  it('a period that has not ended yet: says so, and when to come back — no phone is blamed', () => {
    sheet(status([dev('Telemóvel do salão', 'silent', { this_device: true }), dev('Telemóvel da Merce', 'silent')], false))
    expect(screen.getByTestId('sync-gate-summary').textContent).toMatch(/^Este período ainda não terminou.*Volte a aprovar a partir de 19 out\./)
    expect(text('Telemóvel da Merce')).toMatch(/Aguarda o fim do período.*O período termina no fim de 18 out\..*A partir de 19 out, abra o Beauty OS neste telemóvel com Internet\./)
    expect(document.body.textContent).not.toMatch(/Sem estado recente|contacte a Sollelio/)
  })
  it('every phone ready: back to the Fecho', () => {
    sheet(status([dev('Telemóvel do salão', 'ready'), dev('Telemóvel da Merce', 'ready')]))
    expect(screen.getByTestId('sync-gate-summary').textContent).toBe('Todos os telemóveis estão sincronizadosJá pode voltar ao fecho.')
    expect([...screen.getByTestId('sync-devices').querySelectorAll('.status-chip')].map((c) => c.textContent)).toEqual(['Sincronizado', 'Sincronizado'])
  })
  it('Atualizar asks for the newest state; Fechar stays', () => {
    const onRefresh = vi.fn()
    sheet(status([dev('Telemóvel da Merce', 'pending', { services: 1 })]), onRefresh)
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeTruthy()
  })
  it('a database without the per-device read: the counts, as before', () => {
    sheet({ ready: 1, pending: 1, silent: 0, safe: false })
    expect(screen.queryByTestId('sync-devices')).toBeNull()
    expect(within(screen.getByTestId('sync-gate-status')).getAllByRole('definition').map((d) => d.textContent)).toEqual(['1 telemóvel', '1 telemóvel', '0 telemóveis'])
  })
  it('the notice on the Fecho screen: an unended period is named as such', () => {
    render(<SyncNotice status={status([dev('Telemóvel do salão', 'silent')], false)} verb="fechar" onOpen={() => {}} />)
    expect(screen.getByTestId('sync-notice').textContent).toMatch(/^Este período ainda não terminou\.Só pode fechar depois do fim do período/)
  })
})
