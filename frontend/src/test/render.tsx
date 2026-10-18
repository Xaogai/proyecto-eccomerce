/* oxlint-disable react/only-export-components -- helper de pruebas, no participa en fast refresh */
import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { createMemoryRouter, type RouteObject, RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/app/providers/AuthProvider'
import { StoreProvider } from '@/app/providers/StoreProvider'
import { createQueryClient } from '@/app/queryClient'
import { routes as appRoutes } from '@/app/router'
import { ToastProvider } from '@/components/feedback/ToastProvider'

function Providers({ children }: { children: ReactElement }) {
  const client = createQueryClient()
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } })
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <AuthProvider>
          <StoreProvider>{children}</StoreProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}

/** Monta la app completa (o unas rutas) en una URL, con todos los proveedores y MSW. */
export function renderRoute(url: string, routes: RouteObject[] = appRoutes) {
  const router = createMemoryRouter(routes, { initialEntries: [url] })
  return { router, ...render(<Providers><RouterProvider router={router} /></Providers>) }
}

/** Monta un componente suelto dentro de un router de una sola ruta. */
export function renderWithProviders(ui: ReactElement, url = '/') {
  return renderRoute(url, [{ path: '*', element: ui }])
}
