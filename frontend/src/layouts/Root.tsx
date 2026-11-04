import { Outlet, ScrollRestoration } from 'react-router-dom'

/** Raíz de todas las rutas: restaura el scroll al navegar. */
export function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}
