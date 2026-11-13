import { useState } from 'react'
import type { User } from '@/api/schemas/auth'
import { useAuth } from '@/app/providers/authContext'
import { Button, ButtonLink } from '@/components/ui/Button'
import { afterLogin, ROLE_LABEL } from '@/features/account/session'
import { usePageTitle } from '@/hooks/usePageTitle'
import styles from './account.module.css'

/** En login o registro con una sesión ya abierta: seguir con esa cuenta o cerrarla para entrar con otra. */
export function ActiveSessionNotice({ user, next }: { user: User; next: string | null }) {
  usePageTitle('Ya iniciaste sesión')
  const { logout } = useAuth()
  const [leaving, setLeaving] = useState(false)
  const firstName = user.name.split(' ')[0]

  return (
    <section className={`${styles.card} ${styles.sessionCard}`} aria-labelledby="sesion-abierta">
      <h1 id="sesion-abierta">Ya iniciaste sesión</h1>
      <p>
        En este navegador está abierta la cuenta de <strong>{user.name}</strong> ({user.email}),{' '}
        {ROLE_LABEL[user.role].toLowerCase()}.
      </p>
      <div className={styles.actions}>
        <ButtonLink to={afterLogin(user, next)}>Continuar como {firstName}</ButtonLink>
        <Button
          variant="outline"
          loading={leaving}
          onClick={async () => {
            setLeaving(true)
            await logout()
          }}
        >
          Cerrar sesión y entrar con otra cuenta
        </Button>
      </div>
    </section>
  )
}
