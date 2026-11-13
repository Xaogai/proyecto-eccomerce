import { useState } from 'react'
import { ApiError } from '@/api/errors'
import type { AdminUser } from '@/api/schemas/admin'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { FormErrorSummary } from '@/components/ui/Field'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { useUserActions } from '@/features/admin/api'
import styles from './admin.module.css'
import { TemporaryPassword } from './TemporaryPassword'

/**
 * Acciones de una fila de Usuarios y roles: desbloquear (cualquiera) y, solo para el personal,
 * nueva contraseña temporal y desactivar o reactivar la cuenta.
 */
export function UserActions({ user, onMessage }: { user: AdminUser; onMessage: (text: string) => void }) {
  const { unlock, disable, enable } = useUserActions()
  const [confirming, setConfirming] = useState(false)
  const [resetting, setResetting] = useState(false)

  if (user.is_self) return <span className={styles.muted}>Eres tú</span>
  const staff = user.role !== 'cliente'
  const fail = (e: unknown) => onMessage(e instanceof ApiError ? e.message : 'No pudimos guardar el cambio.')

  if (confirming) {
    return (
      <InlineConfirm
        question={`¿Desactivar a ${user.name}? No podrá entrar hasta que la reactives.`}
        confirmLabel="Desactivar"
        loading={disable.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={async () => {
          try {
            await disable.mutateAsync(user.id)
            onMessage(`Desactivamos la cuenta de ${user.name}. Su sesión abierta deja de servir.`)
          } catch (e) {
            fail(e)
          }
          setConfirming(false)
        }}
      />
    )
  }

  return (
    <div className={styles.rowActions}>
      {user.locked && (
        <Button
          variant="outline"
          size="sm"
          aria-label={`Desbloquear a ${user.name}`}
          loading={unlock.isPending && unlock.variables === user.id}
          onClick={async () => {
            await unlock.mutateAsync(user.id)
            onMessage(`Desbloqueamos la cuenta de ${user.name}.`)
          }}
        >
          Desbloquear
        </Button>
      )}
      {staff && user.active && (
        <>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Nueva contraseña temporal para ${user.name}`}
            aria-haspopup="dialog"
            onClick={() => setResetting(true)}
          >
            Nueva contraseña
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Desactivar a ${user.name}`}
            onClick={() => setConfirming(true)}
          >
            Desactivar
          </Button>
        </>
      )}
      {staff && !user.active && (
        <Button
          variant="outline"
          size="sm"
          aria-label={`Reactivar a ${user.name}`}
          loading={enable.isPending && enable.variables === user.id}
          onClick={async () => {
            try {
              await enable.mutateAsync(user.id)
              onMessage(`Reactivamos la cuenta de ${user.name}.`)
            } catch (e) {
              fail(e)
            }
          }}
        >
          Reactivar
        </Button>
      )}
      {resetting && <PasswordResetDialog user={user} onClose={() => setResetting(false)} />}
    </div>
  )
}

/** Confirma y genera otra contraseña temporal; la actual deja de servir. */
function PasswordResetDialog({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const { resetPassword } = useUserActions()
  const password = resetPassword.data?.temporary_password

  return (
    <Dialog
      open
      onClose={onClose}
      title={password ? 'Nueva contraseña temporal' : `Nueva contraseña para ${user.name}`}
      footer={
        password ? (
          <Button onClick={onClose}>Listo</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button loading={resetPassword.isPending} onClick={() => resetPassword.mutate(user.id)}>
              Generar contraseña
            </Button>
          </>
        )
      }
    >
      {password ? (
        <TemporaryPassword name={user.name} email={user.email} password={password} />
      ) : (
        <>
          <p>
            Generamos una contraseña temporal nueva para <strong>{user.name}</strong>. La que tiene ahora deja
            de servir y, al entrar, tendrá que crear la suya.
          </p>
          {resetPassword.isError && (
            <FormErrorSummary>No pudimos generar la contraseña. Intenta de nuevo.</FormErrorSummary>
          )}
        </>
      )}
    </Dialog>
  )
}
