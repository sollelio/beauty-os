// Offline 3 · connectivity from navigator.onLine and the online/offline events (a signal, not proof of reachability).
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getConnectivity, subscribeConnectivity, useConnectivity } from './connectivity'

let online = true
const setOnline = (v: boolean) => {
  online = v
  window.dispatchEvent(new Event(v ? 'online' : 'offline'))
}
Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => online })
afterEach(() => { online = true })

describe('connectivity', () => {
  it('starts from navigator.onLine', () => {
    expect(getConnectivity()).toBe('online')
    online = false
    expect(getConnectivity()).toBe('offline')
    expect(renderHook(() => useConnectivity()).result.current).toBe('offline')
    expect(getConnectivity({ navigator: {} } as unknown as Parameters<typeof getConnectivity>[0])).toBe('online')   // no signal never blocks
  })
  it('follows the offline and online events', () => {
    const { result } = renderHook(() => useConnectivity())
    expect(result.current).toBe('online')
    act(() => setOnline(false))
    expect(result.current).toBe('offline')
    act(() => setOnline(true))
    expect(result.current).toBe('online')
  })
  it('removes its listeners', () => {
    const add = vi.spyOn(window, 'addEventListener'), remove = vi.spyOn(window, 'removeEventListener')
    const onChange = vi.fn()
    const off = subscribeConnectivity(onChange)
    expect(add.mock.calls.map((c) => c[0]).sort()).toEqual(['offline', 'online'])
    off()
    expect(remove.mock.calls.map((c) => c[0]).sort()).toEqual(['offline', 'online'])
    setOnline(false)
    expect(onChange).not.toHaveBeenCalled()
    const { unmount } = renderHook(() => useConnectivity())
    remove.mockClear()
    unmount()
    expect(remove.mock.calls.map((c) => c[0]).sort()).toEqual(['offline', 'online'])
    vi.restoreAllMocks()
  })
})
