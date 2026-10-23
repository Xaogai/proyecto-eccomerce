import { isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { ErrorState } from '@/components/feedback/States'
import { ButtonLink } from '@/components/ui/Button'
import { usePageTitle } from '@/hooks/usePageTitle'
import { NotFoundPage } from './NotFoundPage'
import styles from './pages.module.css'

/**
 * errorElement: un fallo de render o de carga no deja la pantalla en blanco.
 * Dentro de un layout se pinta en su <main>; con `standalone` (ruta raíz) pone su propio <main>.
 */
export function RouteErrorPage({ standalone }: { standalone?: boolean }) {
  const error = useRouteError()
  usePageTitle('Ocurrió un error')

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />
  if (import.meta.env.DEV) console.error(error)

  const content = (
    <ErrorState
      headingLevel={1}
      title="Algo salió mal"
      onRetry={() => window.location.reload()}
      actions={
        <ButtonLink to="/" variant="outline">
          Ir al inicio
        </ButtonLink>
      }
    >
      Tuvimos un problema al mostrar esta página. Tu carrito sigue guardado.
    </ErrorState>
  )

  return standalone ? (
    <main id="contenido" className={`contenedor ${styles.errorMain}`}>
      {content}
    </main>
  ) : (
    content
  )
}
