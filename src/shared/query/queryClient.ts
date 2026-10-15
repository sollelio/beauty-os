import { QueryClient } from '@tanstack/react-query'

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, refetchOnWindowFocus: false },
      // Commands are never held back for a connection (Offline 8): with the default `online` mode a command started
      // while the query library believes the device is offline is paused and then sent by itself when the connection
      // returns — an online-only action (a PIN, an approval, an annulment) would be performed later, unseen. 'always'
      // makes it fail at once with a network error, as every online-only screen expects; offline work goes to the
      // device (outbox, drafts) through its own explicit path.
      mutations: { retry: false, networkMode: 'always' },
    },
  })
}
