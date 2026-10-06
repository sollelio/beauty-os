import { createBrowserRouter } from 'react-router'
import { RootLayout } from './RootLayout'
import { HojePage } from '../spaces/hoje/HojePage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [{ index: true, element: <HojePage /> }],
  },
])
