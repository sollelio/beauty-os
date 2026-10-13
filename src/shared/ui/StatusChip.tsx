// A small semantic chip for a state that must be read at a glance (a line still without a cost, a product already in the
// purchase). Not decoration: where plain supporting text says it as clearly, use the text.
import type { ReactNode } from 'react'

export function StatusChip({ tone = 'neutral', children }: { tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'; children: ReactNode }) {
  return <span className={`status-chip status-${tone}`}>{children}</span>
}
