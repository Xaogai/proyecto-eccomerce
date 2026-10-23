import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { z } from 'zod'
import { send } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { ApiError } from '@/api/errors'
import { Button, ButtonLink } from '@/components/ui/Button'
import { FormErrorSummary, TextField } from '@/components/ui/Field'
import { PasswordField } from '@/components/ui/PasswordField'
import { usePageTitle } from '@/hooks/usePageTitle'
import styles from './account.module.css'

/**
 * Restablecer contraseña (B6; sin diseño propio, con los componentes de Login).
 * Sin token: pide el correo (EP-24). Con token (enlace del correo): pide la nueva contraseña (EP-25).
 */
export function ResetPasswordPage() {
  const { token } = useParams()
  usePageTitle('Restablecer contraseña')
  return <div className={styles.narrowCard}>{token ? <NewPassword token={token} /> : <RequestLink />}</div>
}

const emailSchema = z.object({
  email: z.string().trim().email('Escribe un correo válido, por ejemplo nombre@correo.com.'),
})

function RequestLink() {
  const request = useMutation({
    mutationFn: (email: string) => send('post', endpoints.passwordForgot, z.unknown(), { email }),
  })
  const { register, handleSubmit, formState } = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
  })

  if (request.isSuccess) {
    return (
      <section role="status" className={styles.card}>
        <h1>Revisa tu correo</h1>
        <p>
          Si existe una cuenta con <strong>{request.variables}</strong>, te enviamos un enlace para
          restablecer tu contraseña. El enlace vence en 30 minutos.
        </p>
        <ButtonLink to="/cuenta/login" variant="outline">
          Volver a iniciar sesión
        </ButtonLink>
      </section>
    )
  }

  return (
    <form
      className={styles.card}
      noValidate
      onSubmit={(e) => void handleSubmit((v) => request.mutate(v.email))(e)}
    >
      <h1>Restablecer contraseña</h1>
      <p>Escribe el correo de tu cuenta y te enviaremos un enlace para crear una contraseña nueva.</p>
      {request.isError && (
        <FormErrorSummary>No pudimos enviar el enlace. Intenta de nuevo en un momento.</FormErrorSummary>
      )}
      <TextField
        label="Correo electrónico"
        type="email"
        autoComplete="email"
        error={formState.errors.email?.message}
        {...register('email')}
      />
      <Button type="submit" size="lg" fullWidth loading={request.isPending}>
        Enviar enlace
      </Button>
      <Link to="/cuenta/login" className={styles.inlineLink}>
        Volver a iniciar sesión
      </Link>
    </form>
  )
}

const passwordSchema = z
  .object({
    password: z.string().superRefine((v, ctx) => {
      if (v.length < 8)
        ctx.addIssue({
          code: 'custom',
          message: `Tu contraseña tiene ${v.length} caracteres. Usa al menos 8.`,
        })
    }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Las contraseñas no coinciden.' })

function NewPassword({ token }: { token: string }) {
  const reset = useMutation({
    mutationFn: (password: string) => send('post', endpoints.passwordReset, z.unknown(), { token, password }),
  })
  const { register, handleSubmit, formState } = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirm: '' },
  })
  const expired = reset.error instanceof ApiError && reset.error.code === 'token_expired'

  if (reset.isSuccess) {
    return (
      <section role="status" className={styles.card}>
        <h1>Listo, cambiaste tu contraseña</h1>
        <p>Ya puedes iniciar sesión con tu contraseña nueva.</p>
        <ButtonLink to="/cuenta/login">Iniciar sesión</ButtonLink>
      </section>
    )
  }

  return (
    <form
      className={styles.card}
      noValidate
      onSubmit={(e) => void handleSubmit((v) => reset.mutate(v.password))(e)}
    >
      <h1>Crea una contraseña nueva</h1>
      {expired && (
        <FormErrorSummary>
          El enlace ya venció. <Link to="/cuenta/restablecer">Pide uno nuevo</Link>.
        </FormErrorSummary>
      )}
      {reset.isError && !expired && (
        <FormErrorSummary>No pudimos cambiar tu contraseña. Intenta de nuevo.</FormErrorSummary>
      )}
      <PasswordField
        label="Contraseña nueva"
        autoComplete="new-password"
        hint="Al menos 8 caracteres."
        error={formState.errors.password?.message}
        {...register('password')}
      />
      <PasswordField
        label="Confirma la contraseña"
        autoComplete="new-password"
        error={formState.errors.confirm?.message}
        {...register('confirm')}
      />
      <Button type="submit" size="lg" fullWidth loading={reset.isPending}>
        Guardar contraseña
      </Button>
    </form>
  )
}
