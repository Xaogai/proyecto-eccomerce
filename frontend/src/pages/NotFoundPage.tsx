import { EmptyState } from '@/components/feedback/States'
import { ButtonLink } from '@/components/ui/Button'
import { usePageTitle } from '@/hooks/usePageTitle'

export function NotFoundPage() {
  usePageTitle('Página no encontrada')
  return (
    <EmptyState
      headingLevel={1}
      title="No encontramos esta página"
      actions={
        <>
          <ButtonLink to="/">Ir al inicio</ButtonLink>
          <ButtonLink to="/departamentos" variant="outline">
            Ver departamentos
          </ButtonLink>
        </>
      }
    >
      Puede que el enlace esté mal escrito o que la página ya no exista.
    </EmptyState>
  )
}
