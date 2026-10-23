import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api/errors'
import type { Settings } from '@/api/schemas/admin'
import { ErrorState, Skeleton } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/toastContext'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { TextField } from '@/components/ui/Field'
import { Switch } from '@/components/ui/Switch'
import { useAllStores, useSaveSettings, useSettings } from '@/features/admin/api'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatMoney } from '@/lib/format'
import styles from './admin.module.css'

const FLAGS: Array<{ key: string; name: string; description: string }> = [
  { key: 'v360', name: 'Vista 360° de producto', description: 'Nueva; en prueba en Android de gama baja' },
  { key: 'calc', name: 'Calculadora de materiales', description: 'Pintura, piso y taquetes' },
  { key: 'cmp', name: 'Comparador de productos', description: 'Hasta 4 productos' },
  { key: 'rev', name: 'Reseñas de producto', description: 'Con moderación antes de publicar' },
  { key: 'queue', name: 'Fila de espera en checkout', description: 'Se activa sola con mucha demanda' },
]

/** Configuración (pantalla 56): funciones activas, pasarela (sin llaves, I6), envíos, sucursales y seguridad. */
export function SettingsPage() {
  usePageTitle('Configuración · Administración')
  const settings = useSettings()

  return (
    <>
      <h1>Configuración</h1>
      {settings.isError ? (
        <ErrorState title="No pudimos cargar la configuración" onRetry={() => settings.refetch()} />
      ) : settings.isPending ? (
        <Skeleton height={420} />
      ) : (
        <>
          <Flags settings={settings.data} />
          <div className={styles.columns}>
            <Payment settings={settings.data} />
            <Shipping settings={settings.data} />
          </div>
          <div className={styles.columns}>
            <Stores />
            <Security settings={settings.data} />
          </div>
        </>
      )}
    </>
  )
}

function Flags({ settings }: { settings: Settings }) {
  const save = useSaveSettings()
  const { toast } = useToast()
  return (
    <section aria-labelledby="funciones" className={styles.card}>
      <h2 id="funciones">Funciones activas</h2>
      <p className={styles.muted}>Apaga una función nueva sin desplegar de nuevo si causa problemas.</p>
      <ul role="list" className={styles.flags}>
        {FLAGS.map((f) => (
          <li key={f.key}>
            <Switch
              label={f.name}
              description={f.description}
              checked={settings.flags[f.key] ?? false}
              disabled={save.isPending}
              onText="Activa"
              offText="Apagada"
              onChange={async (on) => {
                try {
                  await save.mutateAsync({ flags: { [f.key]: on } })
                  toast(`${f.name}: ${on ? 'activa' : 'apagada'}`, 'ok')
                } catch {
                  toast('No pudimos guardar el cambio', 'error')
                }
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function Payment({ settings }: { settings: Settings }) {
  const { payment } = settings
  return (
    <section aria-labelledby="pasarela" className={styles.card}>
      <h2 id="pasarela">Pasarela de pago</h2>
      <div className={styles.kv}>
        <span>Proveedor</span>
        <strong>{payment.provider}</strong>
      </div>
      <div className={styles.kv}>
        <span>Modo en este ambiente</span>
        <strong>{payment.mode === 'vivo' ? 'En vivo' : 'Sandbox (pruebas)'}</strong>
      </div>
      <div className={styles.kv}>
        <span>Llave pública</span>
        <span>
          {payment.key_hint} <span className={styles.muted}>· en el gestor de secretos</span>
        </span>
      </div>
      <p className={styles.muted}>
        Las llaves nunca se muestran completas ni se editan aquí. En desarrollo y pruebas se usa el modo
        sandbox. El sitio no pide datos de tarjeta: el pago se hace en la página de la pasarela.
      </p>
    </section>
  )
}

const moneySchema = z.object({
  free_from: z
    .string()
    .refine((v) => /^\$?\s*[\d,]+(\.\d{1,2})?$/.test(v.trim()), 'Escribe un monto válido, por ejemplo 1500.'),
})

function Shipping({ settings }: { settings: Settings }) {
  const save = useSaveSettings()
  const { toast } = useToast()
  const { register, handleSubmit, formState, setError } = useForm<z.infer<typeof moneySchema>>({
    resolver: zodResolver(moneySchema),
    defaultValues: { free_from: String(settings.shipping.free_from / 100) },
  })

  return (
    <section aria-labelledby="envios" className={styles.card}>
      <h2 id="envios">Envíos</h2>
      <DataTable
        caption="Tarifas de envío"
        rows={settings.shipping.rates}
        rowKey={(r) => r.zone}
        columns={[
          { key: 'zone', header: 'Zona (CP)', cell: (r) => r.zone, rowHeader: true },
          { key: 'cost', header: 'Costo', cell: (r) => formatMoney(r.cost), align: 'end' },
          { key: 'days', header: 'Días hábiles', cell: (r) => r.days },
        ]}
      />
      <form
        noValidate
        className={styles.formNarrow}
        onSubmit={handleSubmit(async ({ free_from }) => {
          const cents = Math.round(Number(free_from.replace(/[$\s,]/g, '')) * 100)
          try {
            await save.mutateAsync({ shipping: { free_from: cents } })
            toast(`Envío gratis desde ${formatMoney(cents)}`, 'ok')
          } catch (e) {
            if (e instanceof ApiError)
              setError('free_from', { message: e.fieldErrors.free_from ?? e.message })
          }
        })}
      >
        <TextField
          label="Envío gratis desde (MXN)"
          inputMode="decimal"
          error={formState.errors.free_from?.message}
          {...register('free_from')}
        />
        <Button type="submit" variant="outline" loading={save.isPending}>
          Guardar envíos
        </Button>
      </form>
    </section>
  )
}

function Stores() {
  const stores = useAllStores()
  return (
    <section aria-labelledby="sucursales" className={styles.card}>
      <h2 id="sucursales">Sucursales</h2>
      {stores.isPending ? (
        <Skeleton height={120} />
      ) : (
        <ul role="list" className={styles.lines}>
          {stores.data?.map((s) => (
            <li key={s.id} className={styles.line}>
              <span className={styles.cellMain}>
                <strong>{s.name}</strong>
                <span className={styles.sku}>{s.hours}</span>
              </span>
              <span className={styles.muted}>{s.phone}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const SECURITY = [
  { key: 'max_attempts', label: 'Intentos de inicio de sesión antes de bloquear' },
  { key: 'lock_minutes', label: 'Minutos de bloqueo' },
  { key: 'session_minutes', label: 'Duración de la sesión (minutos)' },
  { key: 'reservation_minutes', label: 'Minutos que se aparta el stock al pagar' },
] as const
type SecurityKey = (typeof SECURITY)[number]['key']

const whole = z
  .string()
  .regex(/^\d+$/, 'Escribe un número entero mayor a 0.')
  .refine((v) => Number(v) > 0, 'Escribe un número entero mayor a 0.')
const securitySchema = z.object({
  max_attempts: whole,
  lock_minutes: whole,
  session_minutes: whole,
  reservation_minutes: whole,
})

function Security({ settings }: { settings: Settings }) {
  const save = useSaveSettings()
  const { toast } = useToast()
  const [saved, setSaved] = useState(false)
  const { register, handleSubmit, formState, setError } = useForm<Record<SecurityKey, string>>({
    resolver: zodResolver(securitySchema),
    defaultValues: Object.fromEntries(
      SECURITY.map((s) => [s.key, String(settings.security[s.key])]),
    ) as Record<SecurityKey, string>,
  })

  return (
    <section aria-labelledby="seguridad" className={styles.card}>
      <h2 id="seguridad">Seguridad y reservas</h2>
      <form
        noValidate
        className={styles.formNarrow}
        onSubmit={handleSubmit(async (values) => {
          setSaved(false)
          try {
            await save.mutateAsync({
              security: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Number(v)])),
            })
            setSaved(true)
            toast('Guardamos la configuración de seguridad', 'ok')
          } catch (e) {
            if (e instanceof ApiError)
              for (const [k, msg] of Object.entries(e.fieldErrors))
                setError(k as SecurityKey, { message: msg })
          }
        })}
      >
        {SECURITY.map((s) => (
          <TextField
            key={s.key}
            label={s.label}
            inputMode="numeric"
            error={formState.errors[s.key]?.message}
            {...register(s.key, { onChange: () => setSaved(false) })}
          />
        ))}
        <Button type="submit" loading={save.isPending}>
          Guardar
        </Button>
        {saved && (
          <p role="status" className={styles.success}>
            Guardado. Aplica a los nuevos inicios de sesión y pagos.
          </p>
        )}
      </form>
    </section>
  )
}
