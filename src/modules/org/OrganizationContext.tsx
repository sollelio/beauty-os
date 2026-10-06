import { createContext, useContext } from 'react'
import type { Organization } from './api'

export const OrganizationContext = createContext<Organization | null>(null)

export function useOrganization(): Organization {
  const org = useContext(OrganizationContext)
  if (!org) throw new Error('useOrganization must be used inside a bound device context')
  return org
}
