// Tenant Identity T2 · what the screens draw for the bound organization's logo (TenantLogoProvider fills it), or null:
// the name only.
import { createContext, useContext } from 'react'
import type { TenantLogo } from './api'

/** The 32, 64 and 512 px files, and the brand moment's geometry for this emblem. */
export type TenantMark = { src32: string; src64: string; src512: string; ring?: TenantLogo['ring']; iris?: number }

export const TenantMarkContext = createContext<TenantMark | null>(null)
export const useTenantMark = (): TenantMark | null => useContext(TenantMarkContext)
