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
          { path: 'privado/entrar', element: <PrivateEntryPage /> },
          {
            path: 'privado',
            element: <PrivateGate />,
            children: [
              { index: true, element: <PrivateHome /> },
              { path: 'equipa', element: <EquipaPage /> },
              { path: 'situacao/:personId', element: <SituationPage /> },
            ],
          },
        ],
      },
    ],
  },
])
