import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/app/providers/authContext'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Checkbox, TextField } from '@/components/ui/Field'
import { PasswordField } from '@/components/ui/PasswordField'
import { afterLogin, safeNext } from '@/features/account/session'
import { usePageTitle } from '@/hooks/usePageTitle'
import styles from './account.module.css'

const schema = z.object({
  email: z.string().trim().email('Escribe un correo válido, por ejemplo nombre@correo.com.'),
  password: z.string().min(1, 'Escribe tu contraseña.'),
  remember: z.boolean(),
})
type Form = z.infer<typeof schema>

/** Iniciar sesión (pantallas 28 y 39; B1, B4). */
export function LoginPage() {
  usePageTitle('Iniciar sesión')
  const { login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [alert, setAlert] = useState<{ kind: 'error' | 'bloqueada'; text: string } | null>(null)
  const alertRef = useRef<HTMLDivElement>(null)
  const { register, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', remember: false },
  })

  async function submit(values: Form) {
    setAlert(null)
    try {
      const user = await login(values.email, values.password, values.remember)
      navigate(afterLogin(user, next), { replace: true })
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.code === 'account_locked') {
        const minutes = Math.ceil((Number(error.data.retry_after_s) || 900) / 60)
        const at = new Date(Date.now() + minutes * 60_000).toLocaleTimeString('es-MX', {
          hour: '2-digit',
          minute: '2-digit',
        })
        setAlert({
          kind: 'bloqueada',
          text: `Hubo varios intentos fallidos. Podrás intentar de nuevo a las ${at}, o restablecer tu contraseña ahora con un enlace a tu correo.`,
        })
      } else if (error.code === 'invalid_credentials') {
        const left = Number(error.data.attempts_left)
        setAlert({
          kind: 'error',
          text:
            'El correo o la contraseña no coinciden.' +
            (left > 0 && left <= 3
              ? ` Te quedan ${left} intentos antes de que bloqueemos la cuenta por 15 minutos.`
              : ''),
        })
      } else {
        setAlert({ kind: 'error', text: error.message })
      }
      window.requestAnimationFrame(() => alertRef.current?.focus())
    }
  }

  const locked = alert?.kind === 'bloqueada'

  return (
    <div className={styles.authColumns}>
      <form
        className={styles.card}
        onSubmit={(e) => void handleSubmit(submit)(e)}
        noValidate
        aria-labelledby="login-titulo"
      >
        <h1 id="login-titulo">Iniciar sesión</h1>
        <div ref={alertRef} tabIndex={-1}>
          {alert && (
            <div role="alert" className={styles.alert}>
              {locked && <strong>Bloqueamos tu cuenta por seguridad. </strong>}
              {alert.text}
              {locked && (
                <>
                  {' '}
                  <Link to="/cuenta/restablecer">Restablecer contraseña</Link>
                </>
              )}
            </div>
          )}
        </div>
        <TextField
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          error={formState.errors.email?.message}
          {...register('email')}
        />
        <PasswordField
          label="Contraseña"
          autoComplete="current-password"
          disabled={locked}
          error={formState.errors.password?.message}
          {...register('password')}
        />
        <Link to="/cuenta/restablecer" className={styles.inlineLink}>
          ¿Olvidaste tu contraseña?
        </Link>
        <Checkbox label="Mantener mi sesión en este dispositivo" {...register('remember')} />
        <Button type="submit" size="lg" fullWidth loading={formState.isSubmitting} disabled={locked}>
          Entrar
        </Button>
      </form>

      <aside className={styles.side}>
        <div className={styles.card}>
          <h2>¿Primera vez?</h2>
          <p>Con tu cuenta guardas direcciones, sigues tus pedidos y usas tu lista de deseos.</p>
          <ButtonLink
            to={`/cuenta/registro${next ? `?next=${encodeURIComponent(next)}` : ''}`}
            variant="secondary"
            fullWidth
          >
            Crear cuenta
          </ButtonLink>
        </div>
        <ButtonLink to="/carrito" variant="outline" fullWidth>
          Comprar como invitado
        </ButtonLink>
        <p className={styles.muted}>
          ¿Eres personal de sucursal o administrador? Entra con tu correo de trabajo; verás tu panel según tu
          rol.
        </p>
      </aside>
    </div>
  )
}
