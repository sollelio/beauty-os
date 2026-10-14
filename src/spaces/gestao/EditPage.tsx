// Gestão · add or edit one service or product, then Confirmação necessária (catalogue.manage, one-shot PIN). The
// form keeps its values on any failure; the same intent retries with the same command_id (ADR-0006).
// On the mobile shell (UX slice 9): the form and the Confirmação are two history entries (back from Confirmação
// returns to the form with everything typed); leaving with unsaved changes asks first; after a save the editor is
// unwound back to the list, so back never reopens it. Deactivating is the same update command (active: false) — an
// explicit destructive action ending in "Desativar"; nothing is deleted, and a deactivated entry can be reactivated.
import { useState, type ReactNode } from 'react'
import { useParams } from 'react-router'
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
import { formatMoney, minorToWholeUnits, wholeUnitsToMinor } from '../../shared/money'
import { AmountField } from '../../shared/ui/AmountField'
import { AppScreen, BottomActionBar, LockIcon } from '../../shared/ui/AppShell'
import { DiscardSheet } from '../../shared/ui/DiscardSheet'
import { Field } from '../../shared/ui/Field'
import { useFlow, type Flow } from '../../shared/ui/navigation'
import { StatusChip } from '../../shared/ui/StatusChip'
import { EmptyState, ErrorState, Skeleton } from '../../shared/ui/states'
import { PrivateBar } from '../privado/PrivateBar'
import { NotManager } from './GestaoPage'
import { HISTORY_NOTE } from './copy'

const MESSAGES: Record<string, string> = {
  ...VERIFY_MESSAGES,
  NOT_AUTHORIZED: 'Esta pessoa não pode mudar o catálogo.',
  NAME_TAKEN: 'Já existe um item com este nome (pode estar nos desativados).',
  VALIDATION_FAILED: 'Verifique os valores introduzidos.',
  CROSS_TENANT_REFERENCE: 'Este item já não existe.',
}

/** What the Confirmação records: the edits as they are, or the same edits with the entry deactivated / reactivated. */
type Intent = 'save' | 'deactivate' | 'reactivate'
const FINAL: Record<Intent, { label: string; cls: string }> = {
  save: { label: 'Guardar', cls: 'btn-primary' }, deactivate: { label: 'Desativar', cls: 'btn-danger' }, reactivate: { label: 'Reativar', cls: 'btn-primary' },
}
const arrow = (before: string, after: string) => before === after ? after : `${before} → ${after}`

/** Desativar (destructive, apart at the end) or Reativar; both lead to the same Confirmação as an edit. */
function StateAction({ active, kind, disabled, onIntent }: { active: boolean; kind: 'serviço' | 'produto'; disabled: boolean; onIntent: (i: Intent) => void }) {
  return active ? (
    <section className="exceptional">
      <button type="button" className="btn btn-destructive" disabled={disabled} onClick={() => onIntent('deactivate')}>Desativar {kind}</button>
      <span className="support">Deixa de aparecer nas escolhas novas. Nada é apagado: os registos anteriores continuam iguais.</span>
    </section>
  ) : (
    <section className="exceptional">
      <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => onIntent('reactivate')}>Reativar {kind}</button>
      <span className="support">Volta a aparecer nas escolhas novas.</span>
    </section>
  )
}

function ConfirmStep<I>({ bar, run, input, intent, changes, onDone }: {
  bar: ReactNode; run: (commandId: string, grantId: string, input: I) => Promise<unknown>; input: I; intent: Intent
  changes: [string, ReactNode][]; onDone: () => void
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
  const final = FINAL[intent]
  return (
    <AppScreen bar={bar}
      actions={
        <BottomActionBar>
          <button className={`btn ${final.cls} btn-tall`} disabled={!confirmerId || !secret || command.status === 'pending'} onClick={confirm}>
            {command.status === 'pending' ? 'A guardar…' : err?.kind === 'network' ? 'Tentar novamente' : final.label}
          </button>
        </BottomActionBar>
      }>
      <section className="stack stack-loose" aria-label="Confirmação necessária">
        <h2>Confirmação necessária</h2>
        <dl className="row-group value-list" data-testid="changes">
          {changes.map(([k, v]) => <div key={k} className="row value-row"><dt>{k}</dt><dd className="num">{v}</dd></div>)}
        </dl>
        <div className="lock-note"><LockIcon /><span>Só quem gere o catálogo pode confirmar. Fica registado quem mudou e quando.</span></div>
        <ConfirmerPicker permission="catalogue.manage" confirmerId={confirmerId} onConfirmer={setConfirmerId} secret={secret} onSecret={setSecret}
          error={err} messages={MESSAGES} />
        {err?.kind === 'network' && <div className="notice notice-error" role="alert">Não foi possível ligar ao servidor. Nada mudou; tente novamente.</div>}
        {err && err.kind !== 'network' && !isPinError(err) && <div className="notice notice-error" role="alert">{(err.code && MESSAGES[err.code]) || 'Não foi possível guardar.'}</div>}
      </section>
    </AppScreen>
  )
}

/** The loading / not-found screen of an editor, inside the private bar. */
function EditorState({ title, loading, error, what, onBack, onRetry }: { title: string; loading: boolean; error: boolean; what: string; onBack: () => void; onRetry: () => void }) {
  return (
    <AppScreen bar={<PrivateBar title={title} onBack={onBack} exit={false} />}>
      {loading ? <Skeleton rows={3} />
        : error ? <ErrorState onRetry={onRetry} action={<button type="button" className="link-btn" onClick={onBack}>Voltar</button>}>Não foi possível carregar o catálogo.</ErrorState>
        : <EmptyState icon="alert" title={`Este ${what} não existe.`} action={<button type="button" className="btn btn-secondary btn-fit" onClick={onBack}>Voltar à Gestão</button>} />}
    </AppScreen>
  )
}

function Discard({ flow }: { flow: Flow }) {
  return <DiscardSheet open={flow.discard.open} title="Sair sem guardar?" detail="As alterações perdem-se. Nada mudou no catálogo." onDiscard={flow.discard.confirm} onKeep={flow.discard.cancel} />
}

export function ServiceEditPage() {
  const ctx = usePrivateContext()
  const org = useOrganization()
  const { id = 'novo' } = useParams()
  const isNew = id === 'novo'
  const services = useQuery({ queryKey: catalogueKeys.managedServices, queryFn: listManagedServices, enabled: !!ctx.catalogue_manage })
  const current = services.data?.find((s) => s.id === id)
  const [form, setForm] = useState<{ name: string; price: string } | null>(null)
  const [intent, setIntent] = useState<Intent>('save')
  const parent = '/privado/gestao'
  const base = current ? { name: current.name, price: String(minorToWholeUnits(current.default_price_minor, org)) } : { name: '', price: '' }
  const f = form ?? base
  const price = wholeUnitsToMinor(f.price, org)
  const name = f.name.trim()
  const edited = isNew ? name !== '' || f.price !== '' : !!current && (name !== current.name || price !== current.default_price_minor)
  const formOk = name.length >= 2 && price !== null
  const flow = useFlow({ steps: 2, parent, dirty: edited, reachable: () => formOk && (isNew || !!current) })
  if (!ctx.catalogue_manage) return <NotManager />
  const title = isNew ? 'Adicionar serviço' : 'Editar serviço'
  if (!isNew && !current) return <EditorState title={title} loading={services.isPending} error={services.isError} what="serviço" onBack={flow.exit} onRetry={() => services.refetch()} />

  const active = intent === 'deactivate' ? false : intent === 'reactivate' ? true : (current?.active ?? true)
  const input: ServiceInput = { id: isNew ? null : id, name, price_minor: price ?? 0, active }
  const m = (n: number) => formatMoney(n, org)
  const changes: [string, ReactNode][] = isNew
    ? [['Serviço novo', name], ['Preço', m(input.price_minor)]]
    : [['Nome', arrow(current!.name, name)], ['Preço', arrow(m(current!.default_price_minor), m(input.price_minor))],
       ['Estado', arrow(current!.active ? 'Ativo' : 'Desativado', active ? 'Ativo' : 'Desativado')]]
  const go = (i: Intent) => { setIntent(i); flow.goTo(2) }
  const bar = <PrivateBar title={title} onBack={flow.step === 2 ? () => flow.goTo(1) : flow.exit} step={{ current: flow.step, total: 2 }} exit={false} />

  if (flow.step === 2) {
    return <><ConfirmStep bar={bar} run={saveService} input={input} intent={intent} changes={changes} onDone={() => flow.finishTo(parent)} /><Discard flow={flow} /></>
  }
  return (
    <AppScreen bar={bar}
      actions={<BottomActionBar><button className="btn btn-primary btn-tall" disabled={!formOk || !edited} onClick={() => go('save')}>Continuar</button></BottomActionBar>}>
      {current && !current.active && <span className="self-start"><StatusChip>Desativado</StatusChip></span>}
      <Field label="Nome" error={form && name.length > 0 && name.length < 2 ? 'Escreva pelo menos 2 letras.' : undefined}
        hint={!isNew && name !== current!.name ? 'O nome novo aparece também nos registos anteriores deste serviço. Para um serviço diferente, adicione um novo.' : undefined}>
        <input maxLength={80} value={f.name} onChange={(e) => setForm({ ...f, name: e.target.value })} />
      </Field>
      <AmountField label="Preço atual" value={f.price} onChange={(d) => setForm({ ...f, price: d })} symbol={org.currency_symbol} hint={HISTORY_NOTE} />
      {current && <StateAction active={current.active} kind="serviço" disabled={!formOk} onIntent={go} />}
      <Discard flow={flow} />
    </AppScreen>
  )
}

export function ProductEditPage() {
  const ctx = usePrivateContext()
  const org = useOrganization()
  const { id = 'novo' } = useParams()
  const isNew = id === 'novo'
  const products = useQuery({ queryKey: catalogueKeys.managedProducts, queryFn: listManagedProducts, enabled: !!ctx.catalogue_manage })
  const units = useQuery({ queryKey: stockKeys.unitWords, queryFn: listUnitWords, enabled: !!ctx.catalogue_manage })
  const current = products.data?.find((p) => p.id === id)
  const [form, setForm] = useState<{ name: string; unit: string; price: string } | null>(null)
  const [otherUnit, setOtherUnit] = useState(false)
  const [intent, setIntent] = useState<Intent>('save')
  const parent = '/privado/gestao?t=produtos'
  const base = current
    ? { name: current.name, unit: current.unit_word, price: current.reference_price_minor === null ? '' : String(minorToWholeUnits(current.reference_price_minor, org)) }
    : { name: '', unit: '', price: '' }
  const f = form ?? base
  const name = f.name.trim(), unit = f.unit.trim()
  const price = wholeUnitsToMinor(f.price, org)
  const edited = isNew ? name !== '' || unit !== '' || f.price !== ''
    : !!current && (name !== current.name || unit !== current.unit_word || price !== current.reference_price_minor)
  const formOk = name.length >= 2 && unit.length >= 1
  const flow = useFlow({ steps: 2, parent, dirty: edited, reachable: () => formOk && (isNew || !!current) })
  if (!ctx.catalogue_manage) return <NotManager />
  const title = isNew ? 'Adicionar produto' : 'Editar produto'
  if (!isNew && !current) return <EditorState title={title} loading={products.isPending} error={products.isError} what="produto" onBack={flow.exit} onRetry={() => products.refetch()} />

  const active = intent === 'deactivate' ? false : intent === 'reactivate' ? true : (current?.active ?? true)
  const input: ProductInput = { id: isNew ? null : id, name, unit_word: unit, reference_price_minor: price, active }
  const m = (n: number | null) => n === null ? '—' : formatMoney(n, org)
  const changes: [string, ReactNode][] = isNew
    ? [['Produto novo', name], ['Unidade', unit], ['Preço de referência', m(price)]]
    : [['Nome', arrow(current!.name, name)], ['Unidade', arrow(current!.unit_word, unit)],
       ['Preço de referência', arrow(m(current!.reference_price_minor), m(price))],
       ['Estado', arrow(current!.active ? 'Ativo' : 'Desativado', active ? 'Ativo' : 'Desativado')]]
  const words = units.data ?? []
  const custom = otherUnit || (!!unit && !words.includes(unit))
  const go = (i: Intent) => { setIntent(i); flow.goTo(2) }
  const bar = <PrivateBar title={title} onBack={flow.step === 2 ? () => flow.goTo(1) : flow.exit} step={{ current: flow.step, total: 2 }} exit={false} />

  if (flow.step === 2) {
    return <><ConfirmStep bar={bar} run={saveProduct} input={input} intent={intent} changes={changes} onDone={() => flow.finishTo(parent)} /><Discard flow={flow} /></>
  }
  return (
    <AppScreen bar={bar}
      actions={<BottomActionBar><button className="btn btn-primary btn-tall" disabled={!formOk || !edited} onClick={() => go('save')}>Continuar</button></BottomActionBar>}>
      {current && !current.active && <span className="self-start"><StatusChip>Desativado</StatusChip></span>}
      <Field label="Nome" error={form && name.length > 0 && name.length < 2 ? 'Escreva pelo menos 2 letras.' : undefined}>
        <input maxLength={80} value={f.name} onChange={(e) => setForm({ ...f, name: e.target.value })} />
      </Field>
      <section className="stack">
        <span className="label" id="unit-label">Unidade de compra</span>
        {units.isPending ? <Skeleton rows={1} /> : units.isError ? <ErrorState onRetry={() => units.refetch()}>Não foi possível carregar as unidades.</ErrorState> : (
          <div className="wrap" role="group" aria-labelledby="unit-label">
            {words.map((w) => <button key={w} type="button" className="chip chip-outline" aria-pressed={!custom && unit === w} onClick={() => { setOtherUnit(false); setForm({ ...f, unit: w }) }}>{w}</button>)}
            <button type="button" className="chip chip-outline" aria-pressed={custom} onClick={() => { setOtherUnit(true); setForm({ ...f, unit: '' }) }}>Outra…</button>
          </div>
        )}
        {custom && (
          <Field label="Outra unidade" hideLabel>
            <input maxLength={30} placeholder="ex.: pacote" value={f.unit} onChange={(e) => setForm({ ...f, unit: e.target.value })} />
          </Field>
        )}
        <span className="support">As compras anteriores guardam a unidade com que foram registadas.</span>
      </section>
      <AmountField label="Preço de referência" value={f.price} onChange={(d) => setForm({ ...f, price: d })} symbol={org.currency_symbol}
        hint="Opcional. Só informação: o custo real é o que se regista em cada compra; as compras anteriores não mudam." />
      {current && <StateAction active={current.active} kind="produto" disabled={!formOk} onIntent={go} />}
      <Discard flow={flow} />
    </AppScreen>
  )
}
