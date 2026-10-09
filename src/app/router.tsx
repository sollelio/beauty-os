import { createBrowserRouter } from 'react-router'
import { RootLayout } from './RootLayout'
import { DeviceGate } from './DeviceGate'
import { HojePage } from '../spaces/hoje/HojePage'
import { RecordServiceFlow } from '../spaces/servicos/RecordServiceFlow'
import { AdvanceFlow } from '../spaces/equipa/AdvanceFlow'
import { ExpenseFlow } from '../spaces/dinheiro/ExpenseFlow'
import { PurchaseFlow } from '../spaces/dinheiro/PurchaseFlow'
import { PrivateGate, PrivateHome } from './PrivateGate'
import { PrivateEntryPage } from '../spaces/privado/PrivateEntryPage'
import { EquipaPage } from '../spaces/privado/EquipaPage'
import { SituationPage } from '../spaces/privado/SituationPage'
import { StockPage } from '../spaces/stock/StockPage'
import { ListPage } from '../spaces/stock/ListPage'
import { HandoffPage, MarketPage } from '../spaces/stock/MarketPage'
import { ReviewPage } from '../spaces/stock/ReviewPage'
import { FechoHome } from '../spaces/fecho/FechoHome'
import { ProfessionalsPage } from '../spaces/fecho/ProfessionalsPage'
import { RuleFlow } from '../spaces/fecho/RuleFlow'
import { MoneyPage, ReserveFlow } from '../spaces/fecho/MoneyPage'
import { PositionPage } from '../spaces/fecho/PositionPage'
import { ApprovePage } from '../spaces/fecho/ApprovePage'
import { PaymentsPage } from '../spaces/fecho/PaymentsPage'
import { ClosePage, HistoryPage } from '../spaces/fecho/ClosePage'
import { ReopenPage } from '../spaces/fecho/ReopenPage'
import { CancelRecordFlow } from '../spaces/registos/CancelRecordFlow'
import { OverviewPage } from '../spaces/negocio/OverviewPage'
import { TeamPage } from '../spaces/negocio/TeamPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      {
        element: <DeviceGate />,
        children: [
          { index: true, element: <HojePage /> },
          { path: 'servicos/registar', element: <RecordServiceFlow /> },
          { path: 'equipa/adiantamento', element: <AdvanceFlow /> },
          { path: 'dinheiro/despesa', element: <ExpenseFlow /> },
          { path: 'dinheiro/compra', element: <PurchaseFlow /> },
          { path: 'stock', element: <StockPage /> },
          { path: 'stock/lista', element: <ListPage /> },
          { path: 'stock/mercado', element: <MarketPage /> },
          { path: 'stock/passagem', element: <HandoffPage /> },
          { path: 'stock/rever', element: <ReviewPage /> },
          { path: 'registos/anular/:kind/:recordId', element: <CancelRecordFlow /> },
          { path: 'privado/entrar', element: <PrivateEntryPage /> },
          {
            path: 'privado',
            element: <PrivateGate />,
            children: [
              { index: true, element: <PrivateHome /> },
              { path: 'equipa', element: <EquipaPage /> },
              { path: 'situacao/:personId', element: <SituationPage /> },
              { path: 'fecho', element: <FechoHome /> },
              { path: 'fecho/profissionais', element: <ProfessionalsPage /> },
              { path: 'fecho/regra/:personId', element: <RuleFlow /> },
              { path: 'fecho/dinheiro', element: <MoneyPage /> },
              { path: 'fecho/reserva/:mode', element: <ReserveFlow /> },
              { path: 'fecho/posicao', element: <PositionPage /> },
              { path: 'fecho/aprovar', element: <ApprovePage /> },
              { path: 'fecho/pagamentos', element: <PaymentsPage /> },
              { path: 'fecho/fechar', element: <ClosePage /> },
              { path: 'fecho/historico', element: <HistoryPage /> },
              { path: 'fecho/reabrir', element: <ReopenPage /> },
              { path: 'negocio', element: <OverviewPage /> },
              { path: 'negocio/equipa', element: <TeamPage /> },
            ],
          },
        ],
      },
    ],
  },
])
