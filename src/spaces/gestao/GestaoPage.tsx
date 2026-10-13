// Gestão · catálogo (private area, catalogue.manage): services with their current price and products with their unit
// and reference price; add, edit, deactivate. Nothing is deleted — an entry already used is deactivated and stays in
// the history. The database refuses every change without a catalogue.manage confirmation; this page only offers it.
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useOrganization } from '../../modules/org/OrganizationContext'
import { usePrivateContext } from '../../modules/org/privateContext'
import { catalogueKeys, listManagedProducts, listManagedServices } from '../../modules/catalogue/api'
import { formatMoney } from '../../shared/money'
import { HISTORY_NOTE } from './copy'

export function GestaoHeader({ title, back }: { title: string; back: () => void }) {
  return (
    <header className="flow-header-row">
      <button className="icon-btn" aria-label="Voltar" onClick={back}>←</button>
      <span className="muted" style={{ fontWeight: 600 }}>{title}</span>
      <span className="priv">Privado</span>
    </header>
  )
}

export function NotManager() {
  const navigate = useNavigate()
  return (
    <main className="app-main">
      <GestaoHeader title="Gestão" back={() => navigate('/privado')} />
      <div className="notice notice-error" role="alert">A Gestão do catálogo é só para quem tem autorização para mudar serviços, preços e produtos.</div>
      <button className="btn btn-secondary" onClick={() => navigate('/privado')}>Voltar</button>
    </main>
  )
}

export function GestaoPage() {
  const ctx = usePrivateContext()
  const org = useOrganization()
  const navigate = useNavigate()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('t') === 'produtos' ? 'produtos' : 'servicos'
  const [showInactive, setShowInactive] = useState(false)
  const services = useQuery({ queryKey: catalogueKeys.managedServices, queryFn: listManagedServices, enabled: !!ctx.catalogue_manage })
  const products = useQuery({ queryKey: catalogueKeys.managedProducts, queryFn: listManagedProducts, enabled: !!ctx.catalogue_manage })
  if (!ctx.catalogue_manage) return <NotManager />
  const m = (n: number) => formatMoney(n, org)

  const rows = tab === 'servicos'
    ? (services.data ?? []).map((s) => ({ id: s.id, active: s.active, name: s.name, sub: m(s.default_price_minor), to: `/privado/gestao/servico/${s.id}` }))
    : (products.data ?? []).map((p) => ({ id: p.id, active: p.active, name: p.name,
        sub: [p.unit_word, p.reference_price_minor === null ? null : `referência ${m(p.reference_price_minor)}`].filter(Boolean).join(' · '),
        to: `/privado/gestao/produto/${p.id}` }))
  const active = rows.filter((r) => r.active), inactive = rows.filter((r) => !r.active)
  const q = tab === 'servicos' ? services : products
  const row = (r: typeof rows[number]) => (
    <button key={r.id} className="pick" onClick={() => navigate(r.to)} data-testid="catalogue-row">
      <span className="grow"><strong style={{ display: 'block' }}>{r.name}</strong><span className="muted num" style={{ fontSize: '0.875rem' }}>{r.sub}</span></span>
      <span aria-hidden className="muted">›</span>
    </button>
  )

  return (
    <main className="app-main">
      <GestaoHeader title="Gestão" back={() => navigate('/privado')} />
      <div role="group" aria-label="Catálogo" style={{ display: 'flex', gap: '0.5rem' }}>
        <button className="seg" aria-pressed={tab === 'servicos'} onClick={() => setSp({}, { replace: true })}>Serviços</button>
        <button className="seg" aria-pressed={tab === 'produtos'} onClick={() => setSp({ t: 'produtos' }, { replace: true })}>Produtos</button>
      </div>
      <button className="btn btn-secondary btn-dashed" onClick={() => navigate(tab === 'servicos' ? '/privado/gestao/servico/novo' : '/privado/gestao/produto/novo')}>
        {tab === 'servicos' ? 'Adicionar serviço' : 'Adicionar produto'}
      </button>
      {q.isError && <div className="notice notice-error" role="alert">Não foi possível carregar o catálogo. <button className="link-btn" onClick={() => q.refetch()}>Tentar novamente</button></div>}
      {q.isPending && <p className="muted">A carregar…</p>}
      {q.data && (
        <>
          <section className="stack" aria-label={tab === 'servicos' ? 'Serviços ativos' : 'Produtos ativos'}>
            {active.length === 0 ? <p className="muted" style={{ margin: 0 }}>Nenhum {tab === 'servicos' ? 'serviço' : 'produto'} ativo.</p> : active.map(row)}
          </section>
          {inactive.length > 0 && (
            <section className="stack">
              <button className="group-toggle" aria-expanded={showInactive} onClick={() => setShowInactive(!showInactive)}>
                <span className="label">Desativados · {inactive.length}</span><span aria-hidden>{showInactive ? '▴' : '▾'}</span>
              </button>
              {showInactive && inactive.map(row)}
            </section>
          )}
        </>
      )}
      <p className="muted" style={{ margin: 0, fontSize: '0.875rem' }}>
        {tab === 'servicos' ? HISTORY_NOTE : 'O preço de referência é só informação para a gestão. O custo real é o que se regista em cada compra.'}
        {' '}Desativar tira o item das escolhas novas; os registos anteriores continuam iguais.
      </p>
    </main>
  )
}
