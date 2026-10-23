import { EmptyState } from '@/components/feedback/States'
import { ButtonLink } from '@/components/ui/Button'
import { usePageTitle } from '@/hooks/usePageTitle'

export function ForbiddenPage() {
  usePageTitle('Sin acceso')
  return (
    <EmptyState
      headingLevel={1}
      title="No tienes acceso a esta sección"
      actions={<ButtonLink to="/">Ir al inicio</ButtonLink>}
    >
      Tu cuenta no tiene permiso para ver esta página. Si crees que es un error, pide acceso a un
      administrador.
    </EmptyState>
  )
}
