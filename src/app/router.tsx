import { createBrowserRouter } from 'react-router'
import { RootLayout } from './RootLayout'
import { DeviceGate } from './DeviceGate'
import { HojePage } from '../spaces/hoje/HojePage'
import { RecordServiceFlow } from '../spaces/servicos/RecordServiceFlow'
import { AdvanceFlow } from '../spaces/equipa/AdvanceFlow'
import { ExpenseFlow } from '../spaces/dinheiro/ExpenseFlow'
import { PurchaseFlow } from '../spaces/dinheiro/PurchaseFlow'

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
        ],
      },
    ],
  },
])
