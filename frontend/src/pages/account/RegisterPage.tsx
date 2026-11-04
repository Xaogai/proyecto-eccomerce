import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/app/providers/authContext'
import { Button } from '@/components/ui/Button'
import { Checkbox, FormErrorSummary, TextField } from '@/components/ui/Field'
import { PasswordField } from '@/components/ui/PasswordField'
import { homeFor, safeNext } from '@/features/account/session'
import { usePageTitle } from '@/hooks/usePageTitle'
import { plural } from '@/lib/format'
import styles from './account.module.css'

const schema = z.object({
  firstName: z.string().trim().min(1, 'Escribe tu nombre.'),
  lastName: z.string().trim().min(1, 'Escribe tus apellidos.'),
  email: z.string().trim().email('Escribe un correo válido, por ejemplo nombre@correo.com.'),
  // HU-03: mínimo 8 caracteres; el mensaje dice cuántos lleva (prototipo Escritorio-13-Registro).
  password: z.string().superRefine((v, ctx) => {
    if (v.length < 8)
      ctx.addIssue({ code: 'custom', message: `Tu contraseña tiene ${v.length} caracteres. Usa al menos 8.` })
  }),
  privacy: z.boolean().refine((v) => v, 'Para crear tu cuenta necesitas aceptar el aviso de privacidad.'),
  marketing: z.boolean(),
})
type Form = z.infer<typeof schema>

/** Crear cuenta (pantallas 14 y 29; HU-03, B2, 4.5 aviso de privacidad). */
export function RegisterPage() {
  usePageTitle('Crear cuenta')
  const { register: signUp } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [serverError, setServerError] = useState<string>()
  const summaryRef = useRef<HTMLDivElement>(null)
  const { register, handleSubmit, formState, setError } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '', privacy: false, marketing: false },
  })
  const errors = formState.errors
  const focusSummary = () => window.requestAnimationFrame(() => summaryRef.current?.focus())

  async function submit(values: Form) {
    setServerError(undefined)
    try {
      const user = await signUp({
        name: `${values.firstName} ${values.lastName}`,
        email: values.email,
        password: values.password,
        privacy_accepted: values.privacy,
        marketing_opt_in: values.marketing,
      })
      navigate(safeNext(params.get('next')) ?? homeFor(user), { replace: true })
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.fieldErrors.email) setError('email', { message: error.fieldErrors.email })
      if (error.fieldErrors.password) setError('password', { message: error.fieldErrors.password })
      setServerError(error.code === 'email_taken' ? undefined : error.message)
      if (error.code === 'email_taken') setError('email', { message: error.message })
      focusSummary()
    }
  }

  const count = Object.keys(errors).length

  return (
    <div className={styles.authColumns}>
      <form
        className={styles.card}
        onSubmit={(e) => void handleSubmit(submit, focusSummary)(e)}
        noValidate
        aria-labelledby="registro-titulo"
      >
        <h1 id="registro-titulo">Crea tu cuenta</h1>
        <div ref={summaryRef} tabIndex={-1}>
          {count > 0 && (
            <FormErrorSummary>Revisa {plural(count, 'campo')} antes de continuar.</FormErrorSummary>
          )}
          {serverError && <FormErrorSummary>{serverError}</FormErrorSummary>}
        </div>
        <div className={styles.grid2}>
          <TextField
            label="Nombre"
            autoComplete="given-name"
            error={errors.firstName?.message}
            {...register('firstName')}
          />
          <TextField
            label="Apellidos"
            autoComplete="family-name"
            error={errors.lastName?.message}
            {...register('lastName')}
          />
        </div>
        <TextField
          label="Correo electrónico"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <PasswordField
          label="Contraseña"
          autoComplete="new-password"
          hint="Al menos 8 caracteres."
          error={errors.password?.message}
          {...register('password')}
        />
        <Checkbox
          error={errors.privacy?.message}
          label={
            <>
              He leído y acepto el <Link to="/ayuda/privacidad">aviso de privacidad</Link>, que explica cómo
              usamos y protegemos mis datos personales.
            </>
          }
          {...register('privacy')}
        />
        <Checkbox label="Quiero recibir ofertas por correo (opcional)." {...register('marketing')} />
        <Button type="submit" size="lg" fullWidth loading={formState.isSubmitting}>
          Crear cuenta
        </Button>
        <p className={styles.center}>
          ¿Ya tienes cuenta? <Link to="/cuenta/login">Inicia sesión</Link>
        </p>
      </form>
      <aside className={`${styles.card} ${styles.dark}`}>
        <h2>Con tu cuenta</h2>
        <ul>
          <li>Sigues tus pedidos y recolecciones.</li>
          <li>Guardas direcciones para pagar más rápido.</li>
          <li>Usas tu lista de deseos.</li>
          <li>Ves, corriges o eliminas tus datos cuando quieras.</li>
        </ul>
      </aside>
    </div>
  )
}
