import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api/errors'
import type { Profile } from '@/api/schemas/auth'
import { useAuth } from '@/app/providers/authContext'
import { ErrorState, Skeleton } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/toastContext'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { FormErrorSummary, TextField } from '@/components/ui/Field'
import { PasswordField } from '@/components/ui/PasswordField'
import { Switch } from '@/components/ui/Switch'
import {
  useArcoRequest,
  useChangePassword,
  useConsents,
  useDeleteAccount,
  useProfile,
  useUpdateConsents,
  useUpdateProfile,
} from '@/features/account/api'
import { type PasswordChange, passwordChangeSchema } from '@/features/account/session'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatDate } from '@/lib/format'
import { orderStatusInfo, type OrderStatus } from '@/lib/orderStatus'
import styles from './account.module.css'

/** Datos y privacidad (pantallas 35 y 45; derechos ARCO, 4.5 LFPDPPP). */
export function PrivacyPage() {
  usePageTitle('Datos y privacidad')
  const profile = useProfile()

  return (
    <>
      <h1>Datos y privacidad</h1>
      <p>
        Aquí ejerces tus derechos de Acceso, Rectificación, Cancelación y Oposición (ARCO) sobre tus datos
        personales. Consulta el <Link to="/ayuda/privacidad">aviso de privacidad</Link>.
      </p>
      {profile.isError ? (
        <ErrorState title="No pudimos cargar tus datos" onRetry={() => profile.refetch()} />
      ) : profile.isPending ? (
        <Skeleton height={200} />
      ) : (
        <ProfileSection profile={profile.data} />
      )}
      <ConsentsSection />
      <CopySection />
      <DeleteSection />
    </>
  )
}

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Escribe tu nombre completo.'),
  phone: z.string().refine((v) => !v || v.replace(/\D/g, '').length === 10, 'El teléfono tiene 10 dígitos.'),
})

/** Rectificación */
function ProfileSection({ profile }: { profile: Profile }) {
  const update = useUpdateProfile()
  const { toast } = useToast()
  const [passwordOpen, setPasswordOpen] = useState(false)
  const { register, handleSubmit, formState } = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: profile.name, phone: profile.phone },
  })

  return (
    <section aria-labelledby="tus-datos" className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 id="tus-datos">Tus datos</h2>
        <span className={styles.tag}>Rectificación</span>
      </div>
      <form
        noValidate
        className={styles.list}
        onSubmit={(e) =>
          void handleSubmit((v) => update.mutate(v, { onSuccess: () => toast('Guardamos tus datos', 'ok') }))(
            e,
          )
        }
      >
        <div className={styles.grid2}>
          <TextField
            label="Nombre completo"
            autoComplete="name"
            error={formState.errors.name?.message}
            {...register('name')}
          />
          <TextField
            label="Teléfono"
            type="tel"
            autoComplete="tel"
            error={formState.errors.phone?.message}
            {...register('phone')}
          />
          <TextField
            label="Correo"
            type="email"
            value={profile.email}
            readOnly
            fieldClassName={styles.span2}
            hint="Para cambiar tu correo escríbenos desde el aviso de privacidad; lo verificamos antes de cambiarlo."
          />
        </div>
        {update.isError && (
          <FormErrorSummary>No pudimos guardar tus datos. Intenta de nuevo.</FormErrorSummary>
        )}
        <div className={styles.actions}>
          <Button type="submit" loading={update.isPending}>
            Guardar cambios
          </Button>
          <Button variant="outline" onClick={() => setPasswordOpen(true)} aria-haspopup="dialog">
            Cambiar contraseña
          </Button>
        </div>
      </form>
      <ChangePasswordDialog open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </section>
  )
}

function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const change = useChangePassword()
  const { toast } = useToast()
  const { register, handleSubmit, formState, setError, reset } = useForm<PasswordChange>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { current: '', password: '', confirm: '' },
  })
  const close = () => {
    reset()
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Cambiar contraseña"
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" form="cambiar-contrasena" loading={change.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="cambiar-contrasena"
        noValidate
        className={styles.list}
        onSubmit={(e) =>
          void handleSubmit(async ({ current, password }) => {
            try {
              await change.mutateAsync({ current, password })
              toast('Cambiaste tu contraseña', 'ok')
              close()
            } catch (error) {
              if (error instanceof ApiError && error.fieldErrors.current)
                setError('current', { message: error.fieldErrors.current })
            }
          })(e)
        }
      >
        <PasswordField
          label="Contraseña actual"
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
      </form>
    </Dialog>
  )
}

/** Oposición: cada cambio se guarda al momento. */
function ConsentsSection() {
  const consents = useConsents()
  const update = useUpdateConsents()
  const { toast } = useToast()
  const set = (key: 'marketing' | 'personalization', value: boolean) =>
    update.mutate({ [key]: value }, { onSuccess: () => toast('Guardamos tu preferencia', 'ok') })

  return (
    <section aria-labelledby="uso-datos" className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 id="uso-datos">Uso de tus datos</h2>
        <span className={styles.tag}>Oposición</span>
      </div>
      {consents.data ? (
        <>
          <Switch
            label="Recibir ofertas y promociones por correo"
            checked={consents.data.marketing}
            onChange={(v) => set('marketing', v)}
            onText="Sí"
            offText="No"
          />
          <Switch
            label="Avisos de mis pedidos por correo"
            description="Necesarios para recoger y entregar tus pedidos; no se pueden desactivar."
            checked
            disabled
            onChange={() => {}}
            onText="Sí"
          />
          <Switch
            label="Usar mi historial para recomendarme productos"
            checked={consents.data.personalization}
            onChange={(v) => set('personalization', v)}
            onText="Sí"
            offText="No"
          />
        </>
      ) : (
        <Skeleton height={100} />
      )}
    </section>
  )
}

/** Acceso */
function CopySection() {
  const arco = useArcoRequest()
  const { user } = useAuth()
  return (
    <section aria-labelledby="copia" className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 id="copia">Copia de tus datos</h2>
        <span className={styles.tag}>Acceso</span>
      </div>
      <p>
        Te enviamos por correo un archivo con tus datos, pedidos y direcciones. Lo recibes en un máximo de 20
        días hábiles.
      </p>
      <div>
        <Button
          variant="outline"
          onClick={() => arco.mutate({ type: 'acceso' })}
          loading={arco.isPending}
          disabled={arco.isSuccess}
        >
          Solicitar copia de mis datos
        </Button>
      </div>
      <p aria-live="polite" className={styles.muted}>
        {arco.data &&
          `Solicitud registrada con folio ${arco.data.folio}. Te avisaremos a ${user?.email} a más tardar el ${formatDate(arco.data.due_date)}.`}
        {arco.isError && 'No pudimos registrar tu solicitud. Intenta de nuevo.'}
      </p>
    </section>
  )
}

/** Cancelación */
function DeleteSection() {
  const remove = useDeleteAccount()
  const { logout } = useAuth()
  const { toast } = useToast()
  const navigate = useNavigate()
  const [step, setStep] = useState<'cerrado' | 'confirmar'>('cerrado')
  const [password, setPassword] = useState('')
  const blocking = remove.error instanceof ApiError && remove.error.code === 'active_orders'
  const activeOrders = blocking
    ? ((remove.error as ApiError).data.orders as Array<{ id: string; folio: string; status: OrderStatus }>)
    : []
  const passwordError = remove.error instanceof ApiError ? remove.error.fieldErrors.password : undefined

  return (
    <section aria-labelledby="eliminar" className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 id="eliminar">Eliminar mi cuenta</h2>
        <span className={styles.tag}>Cancelación</span>
      </div>
      <p>
        Borramos tus datos personales. Conservamos solo lo que la ley exige para facturas y garantías. No
        puedes eliminarla si tienes un pedido en curso.
      </p>

      {blocking ? (
        <div role="alert" className={styles.alert}>
          <strong>
            {activeOrders
              .map((o) => `Tienes el pedido ${o.folio} ${orderStatusInfo[o.status].label.toLowerCase()}`)
              .join('. ')}
            .
          </strong>{' '}
          Recógelo o cancélalo antes de eliminar tu cuenta. Después podrás hacerlo desde aquí.
          <div className={styles.actions}>
            {activeOrders[0] && (
              <ButtonLink to={`/cuenta/pedidos/${activeOrders[0].id}`} size="sm" variant="outline">
                Ver pedido
              </ButtonLink>
            )}
            <Button size="sm" variant="ghost" onClick={() => remove.reset()}>
              Cerrar
            </Button>
          </div>
        </div>
      ) : step === 'cerrado' ? (
        <div>
          <Button variant="danger" onClick={() => setStep('confirmar')}>
            Quiero eliminar mi cuenta
          </Button>
        </div>
      ) : (
        <form
          className={styles.list}
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            remove.mutate(password, {
              onSuccess: async () => {
                await logout()
                toast('Eliminamos tu cuenta. Gracias por comprar con nosotros.', 'ok')
                navigate('/', { replace: true })
              },
            })
          }}
        >
          <PasswordField
            label="Escribe tu contraseña para confirmar"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError}
          />
          <div className={styles.actions}>
            <Button type="submit" variant="danger" loading={remove.isPending}>
              Sí, eliminar mi cuenta
            </Button>
            <Button variant="outline" onClick={() => setStep('cerrado')}>
              No, conservarla
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}
