import { createBrowserRouter } from 'react-router'
import { RootLayout } from './RootLayout'
import { DeviceGate } from './DeviceGate'
import { HojePage } from '../spaces/hoje/HojePage'
import { RecordServiceFlow } from '../spaces/servicos/RecordServiceFlow'

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
        ],
      },
    ],
  },
])
