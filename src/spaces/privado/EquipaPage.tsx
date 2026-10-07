// Team list inside the private context (B4). Slice 04 leaves the Equipa list undesigned: names and capabilities
// only, as the entry to each person's situation; no figures here.
import { useNavigate } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { listTeamPeople, situationKeys } from '../../modules/team/situation'
import { exitPrivateContext } from '../../modules/org/privateContext'

export function EquipaPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const team = useQuery({ queryKey: situationKeys.team, queryFn: listTeamPeople })
  return (
    <main className="app-main">
      <header className="flow-header-row">
        <button className="icon-btn" aria-label="Voltar a Hoje" onClick={() => navigate('/')}>←</button>
        <span className="muted" style={{ fontWeight: 600 }}>Equipa</span>
        <span className="priv">Privado</span>
      </header>
      <div className="stack">
        {team.data?.map((p) => (
          <button key={p.id} className="pick" onClick={() => navigate(`/privado/situacao/${p.id}`)}>
            <span><strong style={{ display: 'block' }}>{p.display_name}</strong><span className="muted" style={{ fontSize: '0.875rem' }}>{p.capabilities.join(' · ')}</span></span>
            <span aria-hidden className="muted">›</span>
          </button>
        ))}
      </div>
      <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={async () => { await exitPrivateContext(qc); navigate('/') }}>Sair da área privada</button>
    </main>
  )
}
