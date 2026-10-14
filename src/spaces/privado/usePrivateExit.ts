import { useNavigate } from 'react-router'

/** Sair da área privada: go to Hoje (this entry replaced). Leaving the gate's routes is what ends the context —
 *  PrivateGate's unmount runs exitPrivateContext (cache dropped, grant ended server-side; 07 §8).
 *  Not ended here first: navigations commit in a React transition, so marking the context closed before the private
 *  screens have unmounted lets the gate redirect to "A área privada terminou" instead of Hoje. */
export function usePrivateExit() {
  const navigate = useNavigate()
  return () => navigate('/', { replace: true })
}
