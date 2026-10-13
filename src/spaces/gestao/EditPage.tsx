// Gestão · add or edit one service or product, then Confirmação necessária (catalogue.manage, one-shot PIN). The
// form keeps its values on any failure; the same intent retries with the same command_id (ADR-0006).
import { LockIcon } from '../../shared/ui/AppShell'
import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { usePrivateContext } from '../../modules/org/privateContext'
import { ConfirmerPicker } from '../../modules/org/ConfirmerPicker'
import { useVerifiedCommand } from '../../modules/org/useVerifiedCommand'
import { isPinError, VERIFY_MESSAGES } from '../../modules/org/verifyMessages'
import {
  catalogueKeys, listManagedProducts, listManagedServices, saveProduct, saveService, type ProductInput, type ServiceInput,
} from '../../modules/catalogue/api'
import { listUnitWords, stockKeys } from '../../modules/stock/api'
import { AmountField } from '../../shared/ui/AmountField'
import { formatMoney, minorToWholeUnits, wholeUnitsToMinor } from '../../shared/money'
import { GestaoHeader, NotManager } from './GestaoPage'
import { HISTORY_NOTE } from './copy'

const MESSAGES: Record<string, string> = {
  ...VERIFY_MESSAGES,
  NOT_AUTHORIZED: 'Esta pessoa não pode mudar o catálogo.',
  NAME_TAKEN: 'Já existe um item com este nome (pode estar nos desativados).',
  VALIDATION_FAILED: 'Verifique os valores introduzidos.',
  CROSS_TENANT_REFERENCE: 'Este item já não existe.',
}

function ActiveToggle({ active, onChange }: { active: boolean; onChange: (a: boolean) => void }) {
  return (
    <section className="stack" style={{ gap: '0.375rem' }}>
      <span className="label">Estado</span>
      <div role="group" aria-label="Estado" style={{ display: 'flex', gap: '0.5rem' }}>
        <button className="seg" aria-pressed={active} onClick={() => onChange(true)}>Ativo</button>
        <button className="seg" aria-pressed={!active} onClick={() => onChange(false)}>Desativado</button>
      </div>
      {!active && <span className="muted" style={{ fontSize: '0.875rem' }}>Deixa de aparecer nas escolhas novas. Os registos anteriores continuam iguais.</span>}
    </section>
  )
}

function Confirm<I>({ run, input, changes, onDone }: {
  run: (commandId: string, grantId: string, input: I) => Promise<unknown>; input: I; changes: [string, ReactNode][]; onDone: () => void
}) {
  const ctx = usePrivateContext()
  const qc = useQueryClient()
  const command = useVerifiedCommand<I, unknown>(run)
  const [confirmerId, setConfirmerId] = useState<string | null>(ctx.person_id)
  const [secret, setSecret] = useState('')
  const err = command.status === 'error' ? command.error : null
  function confirm() {
    if (!confirmerId || !secret) return
    command.confirm({ input, confirmerId, secret }, {
      onSuccess: () => {
        setSecret('')
        void qc.invalidateQueries({ queryKey: ['catalogue'] })
        void qc.invalidateQueries({ queryKey: stockKeys.overview })
        void qc.invalidateQueries({ queryKey: stockKeys.products })
        onDone()
      },
    })
  }
  return (
    <>
      <section className="stack" style={{ gap: '1rem' }} aria-label="Confirmação necessária">
        <h2>Confirmação necessária</h2>
        <dl className="kv-card" data-testid="changes">{changes.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className="num">{v}</dd></div>)}</dl>
        <div className="lock-note"><LockIcon /><span>Só quem gere o catálogo pode confirmar. Fica registado quem mudou e quando.</span></div>
        <ConfirmerPicker permission="catalogue.manage" confirmerId={confirmerId} onConfirmer={setConfirmerId} secret={secret} onSecret={setSecret}
          error={err} messages={MESSAGES} />
        {err?.kind === 'network' && <div className="notice notice-error" role="alert">Não foi possível ligar ao servidor. Nada mudou; tente novamente.</div>}
        {err && err.kind !== 'network' && !isPinError(err) && <div className="notice notice-error" role="alert">{(err.code && MESSAGES[err.code]) || 'Não foi possível guardar.'}</div>}
      </section>
      <div className="footer">
        <button className="btn btn-primary btn-tall" disabled={!confirmerId || !secret || command.status === 'pending'} onClick={confirm}>
          {command.status === 'pending' ? 'A guardar…' : err?.kind === 'network' ? 'Tentar novamente' : 'Guardar'}
        </button>
      </div>
    </>
  )
}

const arrow = (before: string, after: string) => before === after ? after : `${before} → ${after}`

export function ServiceEditPage() {
  const ctx = usePrivateContext()
  const org = useOrganization()
  const navigate = useNavigate()
  const { id = 'novo' } = useParams()
  const isNew = id === 'novo'
  const services = useQuery({ queryKey: catalogueKeys.managedServices, queryFn: listManagedServices, enabled: !!ctx.catalogue_manage })
  const current = services.data?.find((s) => s.id === id)
  const [form, setForm] = useState<{ name: string; price: string; active: boolean } | null>(null)
  const [step, setStep] = useState<'edit' | 'confirm'>('edit')
  if (!ctx.catalogue_manage) return <NotManager />
  const back = () => navigate('/privado/gestao')
  if (!isNew && !current) return <main className="app-main"><GestaoHeader title="Serviço" back={back} /><p className="muted">{services.isPending ? 'A carregar…' : 'Este serviço não existe.'}</p></main>

  const f = form ?? (current ? { name: current.name, price: String(minorToWholeUnits(current.default_price_minor, org)), active: current.active } : { name: '', price: '', active: true })
  const set = (patch: Partial<typeof f>) => { setForm({ ...f, ...patch }); setStep('edit') }
  const price = wholeUnitsToMinor(f.price, org)
  const name = f.name.trim()
  const valid = name.length >= 2 && price !== null && (isNew || name !== current!.name || price !== current!.default_price_minor || f.active !== current!.active)
  const input: ServiceInput = { id: isNew ? null : id, name, price_minor: price ?? 0, active: f.active }
  const m = (n: number) => formatMoney(n, org)
  const changes: [string, ReactNode][] = isNew
    ? [['Serviço novo', name], ['Preço', m(input.price_minor)]]
    : [['Nome', arrow(current!.name, name)], ['Preço', arrow(m(current!.default_price_minor), m(input.price_minor))],
       ['Estado', arrow(current!.active ? 'Ativo' : 'Desativado', f.active ? 'Ativo' : 'Desativado')]]

  return (
    <main className="app-main">
      <GestaoHeader title={isNew ? 'Adicionar serviço' : 'Editar serviço'} back={back} />
      <section className="stack" style={{ gap: '0.375rem' }}>
        <label className="label" htmlFor="svc-name">Nome</label>
        <label className="field"><input id="svc-name" maxLength={80} value={f.name} onChange={(e) => set({ name: e.target.value })} /></label>
        {!isNew && name !== current!.name && <span className="muted" style={{ fontSize: '0.875rem' }}>O nome novo aparece também nos registos anteriores deste serviço. Para um serviço diferente, adicione um novo.</span>}
      </section>
      <section className="stack" style={{ gap: '0.375rem' }}>
        <span className="label">Preço atual</span>
        <AmountField label="Preço atual" value={f.price} onChange={(d) => set({ price: d })} symbol={org.currency_symbol} />
        <span className="muted" style={{ fontSize: '0.875rem' }}>{HISTORY_NOTE}</span>
      </section>
      {!isNew && <ActiveToggle active={f.active} onChange={(a) => set({ active: a })} />}
      {step === 'edit'
        ? <div className="footer"><button className="btn btn-primary btn-tall" disabled={!valid} onClick={() => setStep('confirm')}>Continuar</button></div>
        : <Confirm run={saveService} input={input} changes={changes} onDone={back} />}
    </main>
  )
}

export function ProductEditPage() {
  const ctx = usePrivateContext()
  const org = useOrganization()
  const navigate = useNavigate()
  const { id = 'novo' } = useParams()
  const isNew = id === 'novo'
  const products = useQuery({ queryKey: catalogueKeys.managedProducts, queryFn: listManagedProducts, enabled: !!ctx.catalogue_manage })
  const units = useQuery({ queryKey: stockKeys.unitWords, queryFn: listUnitWords, enabled: !!ctx.catalogue_manage })
  const current = products.data?.find((p) => p.id === id)
  const [form, setForm] = useState<{ name: string; unit: string; price: string; active: boolean } | null>(null)
  const [otherUnit, setOtherUnit] = useState(false)
  const [step, setStep] = useState<'edit' | 'confirm'>('edit')
  if (!ctx.catalogue_manage) return <NotManager />
  const back = () => navigate('/privado/gestao?t=produtos')
  if (!isNew && !current) return <main className="app-main"><GestaoHeader title="Produto" back={back} /><p className="muted">{products.isPending ? 'A carregar…' : 'Este produto não existe.'}</p></main>

  const f = form ?? (current
    ? { name: current.name, unit: current.unit_word, price: current.reference_price_minor === null ? '' : String(minorToWholeUnits(current.reference_price_minor, org)), active: current.active }
    : { name: '', unit: '', price: '', active: true })
  const set = (patch: Partial<typeof f>) => { setForm({ ...f, ...patch }); setStep('edit') }
  const name = f.name.trim(), unit = f.unit.trim()
  const price = wholeUnitsToMinor(f.price, org)
  const valid = name.length >= 2 && unit.length >= 1 && (isNew || name !== current!.name || unit !== current!.unit_word
    || price !== current!.reference_price_minor || f.active !== current!.active)
  const input: ProductInput = { id: isNew ? null : id, name, unit_word: unit, reference_price_minor: price, active: f.active }
  const m = (n: number | null) => n === null ? '—' : formatMoney(n, org)
  const changes: [string, ReactNode][] = isNew
    ? [['Produto novo', name], ['Unidade', unit], ['Preço de referência', m(price)]]
    : [['Nome', arrow(current!.name, name)], ['Unidade', arrow(current!.unit_word, unit)],
       ['Preço de referência', arrow(m(current!.reference_price_minor), m(price))],
       ['Estado', arrow(current!.active ? 'Ativo' : 'Desativado', f.active ? 'Ativo' : 'Desativado')]]
  const words = units.data ?? []

  return (
    <main className="app-main">
      <GestaoHeader title={isNew ? 'Adicionar produto' : 'Editar produto'} back={back} />
      <section className="stack" style={{ gap: '0.375rem' }}>
        <label className="label" htmlFor="prd-name">Nome</label>
        <label className="field"><input id="prd-name" maxLength={80} value={f.name} onChange={(e) => set({ name: e.target.value })} /></label>
      </section>
      <section className="stack" style={{ gap: '0.375rem' }}>
        <span className="label">Unidade de compra</span>
        <div role="group" aria-label="Unidade de compra" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {words.map((w) => <button key={w} className="seg" style={{ flex: '0 0 auto', padding: '0 1rem' }} aria-pressed={!otherUnit && unit === w} onClick={() => { setOtherUnit(false); set({ unit: w }) }}>{w}</button>)}
          <button className="seg" style={{ flex: '0 0 auto', padding: '0 1rem' }} aria-pressed={otherUnit || (!!unit && !words.includes(unit))} onClick={() => { setOtherUnit(true); set({ unit: '' }) }}>Outra…</button>
        </div>
        {(otherUnit || (!!unit && !words.includes(unit))) && (
          <label className="field"><input aria-label="Outra unidade" maxLength={30} placeholder="ex.: pacote" value={f.unit} onChange={(e) => set({ unit: e.target.value })} /></label>
        )}
        <span className="muted" style={{ fontSize: '0.875rem' }}>As compras anteriores guardam a unidade com que foram registadas.</span>
      </section>
      <section className="stack" style={{ gap: '0.375rem' }}>
        <span className="label">Preço de referência (opcional)</span>
        <AmountField label="Preço de referência" value={f.price} onChange={(d) => set({ price: d })} symbol={org.currency_symbol} />
        <span className="muted" style={{ fontSize: '0.875rem' }}>Só informação. O custo real é o que se regista em cada compra.</span>
      </section>
      {!isNew && <ActiveToggle active={f.active} onChange={(a) => set({ active: a })} />}
      {step === 'edit'
        ? <div className="footer"><button className="btn btn-primary btn-tall" disabled={!valid} onClick={() => setStep('confirm')}>Continuar</button></div>
        : <Confirm run={saveProduct} input={input} changes={changes} onDone={back} />}
    </main>
  )
}
