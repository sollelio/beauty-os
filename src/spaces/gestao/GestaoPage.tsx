// Gestão · catálogo (private area, catalogue.manage): services with their current price and products with their unit
// and reference price; add, edit, deactivate. Nothing is deleted — an entry already used is deactivated and stays in
// the history. The database refuses every change without a catalogue.manage confirmation; this page only offers it.
// On the mobile shell (UX slice 9): the private bar (← back inside the private area), Serviços / Produtos as one
// switch, whole rows (the price in money type on the right), the deactivated entries collapsed below, the shared
// loading / empty / error states.
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { usePrivateContext } from '../../modules/org/privateContext'
import { catalogueKeys, listManagedProducts, listManagedServices } from '../../modules/catalogue/api'
import { formatMoney } from '../../shared/money'
import { AppScreen } from '../../shared/ui/AppShell'
import { Icon } from '../../shared/ui/Icon'
import { ListGroup, ListRow } from '../../shared/ui/ListRow'
import { useAppBack } from '../../shared/ui/navigation'
import { SegmentedControl } from '../../shared/ui/SegmentedControl'
import { StatusChip } from '../../shared/ui/StatusChip'
import { EmptyState, ErrorState, Skeleton } from '../../shared/ui/states'
import { PrivateBar } from '../privado/PrivateBar'
import { HISTORY_NOTE } from './copy'

/** Without catalogue.manage: the page says so (the database refuses the commands anyway). */
export function NotManager() {
  const back = useAppBack('/privado')
  return (
    <AppScreen bar={<PrivateBar title="Gestão" onBack={back} />}>
      <ErrorState action={<button type="button" className="link-btn" onClick={back}>Voltar</button>}>
        A Gestão do catálogo é só para quem tem autorização para mudar serviços, preços e produtos.
      </ErrorState>
    </AppScreen>
  )
}

export function GestaoPage() {
  const ctx = usePrivateContext()
  const org = useOrganization()
  const navigate = useNavigate()
  const back = useAppBack('/privado')
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('t') === 'produtos' ? 'produtos' : 'servicos'
  const [showInactive, setShowInactive] = useState(false)
  const services = useQuery({ queryKey: catalogueKeys.managedServices, queryFn: listManagedServices, enabled: !!ctx.catalogue_manage })
  const products = useQuery({ queryKey: catalogueKeys.managedProducts, queryFn: listManagedProducts, enabled: !!ctx.catalogue_manage })
  if (!ctx.catalogue_manage) return <NotManager />
  const m = (n: number) => formatMoney(n, org)
  const isServices = tab === 'servicos'

  const rows = isServices
    ? (services.data ?? []).map((s) => ({ id: s.id, active: s.active, name: s.name, sub: null as string | null, value: m(s.default_price_minor), to: `/privado/gestao/servico/${s.id}` }))
    : (products.data ?? []).map((p) => ({ id: p.id, active: p.active, name: p.name, sub: p.unit_word,
        value: p.reference_price_minor === null ? null : `referência ${m(p.reference_price_minor)}`, to: `/privado/gestao/produto/${p.id}` }))
  const active = rows.filter((r) => r.active), inactive = rows.filter((r) => !r.active)
  const q = isServices ? services : products
  const row = (r: typeof rows[number]) => (
    <div key={r.id} className="row-line" data-testid="catalogue-row">
      <ListRow as="button" onClick={() => navigate(r.to)} chevron title={<strong>{r.name}</strong>}
        subtitle={r.sub ? <span>{[r.sub, isServices ? null : r.value].filter(Boolean).join(' · ')}</span> : undefined}
        trailing={<>
          {!r.active && <StatusChip>Desativado</StatusChip>}
          {isServices && <span className="row-value num">{r.value}</span>}
        </>} />
    </div>
  )

  return (
    <AppScreen bar={<PrivateBar title="Gestão" onBack={back} />}>
      <SegmentedControl label="Catálogo" hideLabel value={tab} onChange={(t) => setSp(t === 'produtos' ? { t: 'produtos' } : {}, { replace: true })}
        options={[{ id: 'servicos', label: 'Serviços' }, { id: 'produtos', label: 'Produtos' }]} />
      <ListGroup>
        <ListRow as="button" onClick={() => navigate(isServices ? '/privado/gestao/servico/novo' : '/privado/gestao/produto/novo')}
          leading={<span className="row-icon"><Icon name="plus" /></span>} title={<span className="row-accent">{isServices ? 'Adicionar serviço' : 'Adicionar produto'}</span>} />
      </ListGroup>

      {q.isPending && <Skeleton rows={4} />}
      {q.isError && <ErrorState onRetry={() => q.refetch()}>Não foi possível carregar o catálogo.</ErrorState>}
      {q.data && (
        <>
          <section className="stack" aria-label={isServices ? 'Serviços ativos' : 'Produtos ativos'}>
            <span className="label">{isServices ? 'Serviços ativos' : 'Produtos ativos'}</span>
            {active.length === 0
              ? <EmptyState icon={isServices ? 'receipt' : 'box'} title={`Nenhum ${isServices ? 'serviço' : 'produto'} ativo.`} />
              : <ListGroup>{active.map(row)}</ListGroup>}
          </section>
          {inactive.length > 0 && (
            <section className="stack">
              <button className="group-toggle" aria-expanded={showInactive} onClick={() => setShowInactive(!showInactive)}>
                <span className="label">Desativados · {inactive.length}</span>
                <span className="toggle-chevron" data-open={showInactive}><Icon name="chevronDown" /></span>
              </button>
              {showInactive && <ListGroup>{inactive.map(row)}</ListGroup>}
            </section>
          )}
        </>
      )}
      <p className="note support">
        {isServices ? HISTORY_NOTE : 'O preço de referência é só informação para a gestão. O custo real é o que se regista em cada compra.'}
        {' '}Desativar tira o item das escolhas novas; os registos anteriores continuam iguais.
      </p>
    </AppScreen>
  )
}
