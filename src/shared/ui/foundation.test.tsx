// Visual foundation (UX slice 3): what the shared primitives guarantee beyond looks — association, roles, decorative
// icons, the stacked segmented control for long tenant labels, and the row contract.
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { AmountField } from './AmountField'
import { Field } from './Field'
import { Icon } from './Icon'
import { ListGroup, ListRow, RowIcon } from './ListRow'
import { LONG_LABEL, SegmentedControl } from './SegmentedControl'
import { StatusChip } from './StatusChip'

describe('Icon', () => {
  it('is decorative: hidden from assistive tech, not focusable, currentColor on a 24-unit grid', () => {
    const { container } = render(<Icon name="trash" size={18} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.getAttribute('focusable')).toBe('false')
    expect([svg.getAttribute('viewBox'), svg.getAttribute('stroke'), svg.getAttribute('width')]).toEqual(['0 0 24 24', 'currentColor', '18'])
  })
  it('a control that holds an icon is named by its own label, never by the icon', () => {
    render(<button aria-label="Remover Shampoo"><Icon name="trash" /></button>)
    expect(screen.getByRole('button', { name: 'Remover Shampoo' })).toBeTruthy()
  })
})

describe('Field', () => {
  it('ties the visible label to the input and describes it by its hint', () => {
    render(<Field label="Nota (opcional)" hint="Até 60 caracteres."><input /></Field>)
    const input = screen.getByLabelText('Nota (opcional)') as HTMLInputElement
    expect(input.tagName).toBe('INPUT')
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe('Até 60 caracteres.')
    expect(input.getAttribute('aria-invalid')).toBeNull()
  })
  it('an error replaces the hint, marks the input invalid and the box', () => {
    render(<Field label="Valor" hint="dica" error="Indique o valor."><input /></Field>)
    const input = screen.getByLabelText('Valor')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toBe('Indique o valor.')
    expect(screen.queryByText('dica')).toBeNull()
    expect(input.closest('.field')?.className).toContain('field-invalid')
  })
  it('a hidden label still names the input (the screen already shows the name)', () => {
    render(<Field label="Procurar serviço" hideLabel><input type="search" /></Field>)
    const input = screen.getByLabelText('Procurar serviço') as HTMLInputElement
    expect(input.labels?.[0]?.className).toBe('sr-only')
  })
  it('AmountField: numeric keyboard, digits only, live grouping, the symbol as an affix', () => {
    function Harness() { const [v, setV] = useState(''); return <AmountField label="Valor pago" value={v} onChange={setV} symbol="Kz" /> }
    render(<Harness />)
    const input = screen.getByLabelText('Valor pago') as HTMLInputElement
    expect([input.inputMode, input.autocomplete]).toEqual(['numeric', 'off'])
    fireEvent.change(input, { target: { value: '12a3456789012' } })
    expect(input.value).toBe('123.456.789')
    expect(input.closest('.field')?.textContent).toBe('Kz')
  })
})

describe('SegmentedControl', () => {
  const short = [{ id: 'a', label: 'Numerário' }, { id: 'b', label: 'Dinheiro' }, { id: 'c', label: 'Misto' }]
  it('short labels sit side by side as pressed/unpressed buttons in a named group', () => {
    const onChange = vi.fn()
    render(<SegmentedControl label="Forma de pagamento" options={short} value="b" onChange={onChange} />)
    const group = screen.getByRole('group', { name: 'Forma de pagamento' })
    expect(group.className).toBe('segmented')
    expect(within(group).getAllByRole('button').map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    fireEvent.click(within(group).getByRole('button', { name: 'Misto' }))
    expect(onChange).toHaveBeenCalledWith('c')
  })
  it('a long tenant label (Multicaixa Express, Transferência) stacks the same buttons into full-width rows', () => {
    const long = [{ id: 'd', label: 'Dinheiro' }, { id: 'm', label: 'Multicaixa Express' }, { id: 'x', label: 'Misto' }]
    render(<SegmentedControl label="Forma de pagamento" options={long} value="m" onChange={() => {}} />)
    const group = screen.getByRole('group', { name: 'Forma de pagamento' })
    expect(group.className).toBe('segmented segmented-stack')
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Dinheiro', 'Multicaixa Express', 'Misto'])
    expect(within(group).getByRole('button', { name: 'Multicaixa Express' }).getAttribute('aria-pressed')).toBe('true')
    expect('Transferência'.length).toBeGreaterThan(LONG_LABEL)
  })
  it('more than three options also stack', () => {
    render(<SegmentedControl label="Onde" options={[...short, { id: 'd', label: 'Loja' }]} value={null} onChange={() => {}} />)
    expect(screen.getByRole('group', { name: 'Onde' }).className).toContain('segmented-stack')
  })
})

describe('ListRow / ListGroup', () => {
  it('a button row is the whole control, named by its title and subtitle, with a decorative chevron', () => {
    const onClick = vi.fn()
    render(<ListGroup><ListRow as="button" onClick={onClick} leading={<RowIcon name="card" />} title="Adiantamento" subtitle="por conta do que vai receber" chevron /></ListGroup>)
    const row = screen.getByRole('button', { name: /Adiantamento/ })
    expect(row.textContent).toBe('Adiantamentopor conta do que vai receber')      // title + subtitle name the control
    expect(row.className).toBe('row row-with-subtitle row-tappable')
    expect(row.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2)      // the leading icon and the chevron
    fireEvent.click(within(row).getByText('Adiantamento'))                        // a tap anywhere on the row
    expect(onClick).toHaveBeenCalledTimes(1)
  })
  it('a link row navigates with state; a static row is not tappable; the current row is marked', () => {
    render(<MemoryRouter><ListGroup>
      <ListRow as="link" to="/stock" state={{ from: '/' }} title="Stock" chevron />
      <ListRow title="Corte" trailing={<span className="row-value num">5.000 Kz</span>} current />
    </ListGroup></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Stock' }).getAttribute('href')).toBe('/stock')
    const current = screen.getByText('Corte').closest('.row')!
    expect(current.className).toBe('row')
    expect(current.getAttribute('aria-current')).toBe('true')
    expect(current.textContent).toBe('Corte5.000 Kz')
  })
})

describe('StatusChip', () => {
  it('is a small semantic mark with one tone class', () => {
    render(<StatusChip tone="warning">custo por introduzir</StatusChip>)
    expect(screen.getByText('custo por introduzir').className).toBe('status-chip status-warning')
  })
})
