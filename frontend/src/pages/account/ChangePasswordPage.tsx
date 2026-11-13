import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/app/providers/authContext'
import { useToast } from '@/components/feedback/toastContext'
import { Button } from '@/components/ui/Button'
import { FormErrorSummary } from '@/components/ui/Field'
import { PasswordField } from '@/components/ui/PasswordField'
import { useChangePassword } from '@/features/account/api'
import { homeFor, type PasswordChange, passwordChangeSchema } from '@/features/account/session'
import { usePageTitle } from '@/hooks/usePageTitle'
import styles from './account.module.css'

/** Primera entrada de una cuenta que dio de alta un admin: cambia la contraseña temporal por una propia. */
export function ChangePasswordPage() {
  usePageTitle('Crea tu contraseña')
  const { user, updateUser, logout } = useAuth()
  const navigate = useNavigate()
  const { toast } = useToast()
  const change = useChangePassword()
  const { register, handleSubmit, formState, setError } = useForm<PasswordChange>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { current: '', password: '', confirm: '' },
  })

  if (user && !user.must_change_password) return <Navigate to={homeFor(user)} replace />

  return (
    <form
      noValidate
      aria-labelledby="crear-contrasena"
      className={`${styles.card} ${styles.sessionCard}`}
      onSubmit={(e) =>
        void handleSubmit(async ({ current, password }) => {
          try {
            await change.mutateAsync({ current, password })
          } catch (error) {
            if (error instanceof ApiError && error.fieldErrors.current)
              setError('current', { message: error.fieldErrors.current })
            return
          }
          if (!user) return
          updateUser({ must_change_password: false })
          toast('Listo, ya tienes tu propia contraseña', 'ok')
          navigate(homeFor({ ...user, must_change_password: false }), { replace: true })
        })(e)
      }
    >
      <h1 id="crear-contrasena">Crea tu contraseña</h1>
      <p>
        Un administrador creó tu cuenta con una contraseña temporal. Para entrar a tu panel, cámbiala por una
        que solo tú conozcas.
      </p>
      <PasswordField
        label="Contraseña temporal"
        autoComplete="current-password"
        error={formState.errors.current?.message}
        {...register('current')}
      />
      <PasswordField
        label="Contraseña nueva"
        autoComplete="new-password"
        hint="Al menos 8 caracteres."
        error={formState.errors.password?.message}
        {...register('password')}
      />
      <PasswordField
        label="Confirma la contraseña nueva"
        autoComplete="new-password"
        error={formState.errors.confirm?.message}
        {...register('confirm')}
      />
      {change.isError && !(change.error instanceof ApiError && change.error.fieldErrors.current) && (
        <FormErrorSummary>No pudimos guardar tu contraseña. Intenta de nuevo.</FormErrorSummary>
      )}
      <div className={styles.actions}>
        <Button type="submit" loading={change.isPending}>
          Guardar y continuar
        </Button>
        <Button variant="outline" onClick={() => void logout()}>
          Cerrar sesión
        </Button>
      </div>
    </form>
  )
}
