import { describe, expect, it } from 'vitest'
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { renderScreen } from '../../test/router'
import { BottomSheet } from './BottomSheet'
import { useSheet } from './navigation'

function Harness({ dismissible = true }: { dismissible?: boolean }) {
  const sheet = useSheet<string>()
  return (
    <main>
      <button onClick={() => sheet.open('a')}>Abrir</button>
      {sheet.current && (
        <BottomSheet labelledBy="t" onDismiss={sheet.close} dismissible={dismissible}>
          <h2 id="t">Folha {sheet.current}</h2>
          <input aria-label="Campo" data-autofocus />
          <button onClick={sheet.close}>Fechar folha</button>
          <button onClick={() => sheet.leaveTo('/destino')}>Ir</button>
        </BottomSheet>
      )}
    </main>
  )
}
const PATH = '/teste'
const open = async () => {
  const opener = screen.getByRole('button', { name: 'Abrir' })
  opener.focus()                                                            // a tap focuses the button in Chrome; jsdom needs it explicit
  fireEvent.click(opener)
  return screen.findByRole('dialog', { name: 'Folha a' })
}

describe('BottomSheet + useSheet', () => {
  it('is a modal dialog in a portal; focus moves in, is trapped, and returns to the opener', async () => {
    renderScreen(PATH, <Harness />, { entries: ['/', PATH], index: 1 })
    const dialog = await open()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.closest('main')).toBeNull()                                 // rendered outside the screen (portal)
    expect(document.activeElement).toBe(screen.getByLabelText('Campo'))
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })                 // from the first element → wraps to the last
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ir' }))
    fireEvent.keyDown(dialog, { key: 'Tab' })                                 // from the last → back to the first
    expect(document.activeElement).toBe(screen.getByLabelText('Campo'))
    fireEvent.click(screen.getByRole('button', { name: 'Fechar folha' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Abrir' }))
  })

  it('Android/browser back closes the sheet and stays on the screen', async () => {
    const { router } = renderScreen(PATH, <Harness />, { entries: ['/', PATH], index: 1 })
    await open()
    await act(() => router.navigate(-1))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(router.state.location.pathname).toBe(PATH)
    await act(() => router.navigate(-1))                                      // the next back leaves the screen
    expect(await screen.findByText('Ecrã Hoje')).toBeTruthy()
  })

  it('closing from the sheet pops its entry: no dead back press is left behind', async () => {
    const { router } = renderScreen(PATH, <Harness />, { entries: ['/', PATH], index: 1 })
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Fechar folha' }))
    await waitFor(() => expect(router.state.location.state).toBeNull())
    await act(() => router.navigate(-1))
    expect(await screen.findByText('Ecrã Hoje')).toBeTruthy()
  })

  it('leaving from inside the sheet replaces its entry, so back returns to the screen without the sheet', async () => {
    const { router } = renderScreen(PATH, <Harness />, { entries: ['/', PATH], index: 1 })
    await open()
    fireEvent.click(screen.getByRole('button', { name: 'Ir' }))
    expect(await screen.findByText('Outro ecrã')).toBeTruthy()
    await act(() => router.navigate(-1))
    expect(await screen.findByRole('button', { name: 'Abrir' })).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Escape and the backdrop dismiss only a dismissible sheet', async () => {
    renderScreen(PATH, <Harness dismissible={false} />, { entries: ['/', PATH], index: 1 })
    const dialog = await open()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    fireEvent.click(document.querySelector('.sheet') as HTMLElement)
    expect(screen.getByRole('dialog', { name: 'Folha a' })).toBeTruthy()
  })

  it('a dismissible sheet closes on Escape', async () => {
    renderScreen(PATH, <Harness />, { entries: ['/', PATH], index: 1 })
    const dialog = await open()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
