import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import styles from './admin.module.css'

/** Contraseña temporal que el admin ve una sola vez, con botón para copiarla. */
export function TemporaryPassword({
  name,
  email,
  password,
}: {
  name: string
  email: string
  password: string
}) {
  const [copied, setCopied] = useState(false)
  return (
    <>
      <p>
        <strong>{name}</strong> entra con <strong>{email}</strong> y esta contraseña temporal:
      </p>
      <p className={styles.secret}>{password}</p>
      <div className={styles.actions}>
        <Button
          variant="outline"
          onClick={async () => {
            await navigator.clipboard?.writeText(password)
            setCopied(true)
          }}
        >
          {copied ? 'Copiada' : 'Copiar contraseña'}
        </Button>
      </div>
      <p className={styles.muted} role="status">
        Es la única vez que la verás. Entrégala en persona o por un canal seguro; al entrar,{' '}
        {name.split(' ')[0]} tendrá que cambiarla por una propia.
      </p>
    </>
  )
}
