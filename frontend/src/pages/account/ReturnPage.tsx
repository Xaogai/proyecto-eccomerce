import { type FormEvent, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/errors'
import { ErrorState, PageSkeleton } from '@/components/feedback/States'
import { Button, ButtonLink } from '@/components/ui/Button'
import { FieldError, FormErrorSummary, Textarea } from '@/components/ui/Field'
import { useAddressBook, useCreateReturn, useMyOrder } from '@/features/account/api'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatDate, formatMoney, plural } from '@/lib/format'
import styles from './account.module.css'

const REASONS = [
  { value: 'no_necesito', label: 'Ya no lo necesito' },
  { value: 'danado', label: 'Llegó dañado o no funciona' },
  { value: 'no_es', label: 'No es lo que pedí' },
  { value: 'faltan_piezas', label: 'Le faltan piezas' },
  { value: 'otro', label: 'Otro motivo' },
]
const NEEDS_PHOTO = new Set(['danado', 'faltan_piezas'])

/** Solicitar devolución (pantallas 36 y 46). */
export function ReturnPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const order = useMyOrder(id)
  const addresses = useAddressBook()
  const create = useCreateReturn(id)
  usePageTitle('Solicitar devolución')

  const [selected, setSelected] = useState<Set<string> | null>(null)
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [method, setMethod] = useState<'tienda' | 'recoleccion'>('tienda')
  const [photo, setPhoto] = useState<File>()
  const [errors, setErrors] = useState<Record<string, string>>({})
  const summaryRef = useRef<HTMLDivElement>(null)

  if (order.isPending) return <PageSkeleton label="Cargando tu pedido" />
  if (!order.data)
    return <ErrorState headingLevel={1} title="No pudimos cargar tu pedido" onRetry={() => order.refetch()} />
  const data = order.data
  const picked = selected ?? new Set(params.get('producto') ? [params.get('producto')!] : [])
  const home = addresses.data?.find((a) => a.is_default)

  if (create.data) {
    return (
      <section role="status" className={styles.success}>
        <span className={styles.successKicker}>Solicitud enviada</span>
        <h1>Devolución {create.data.folio} en revisión</h1>
        <p>
          {create.data.instructions} Reembolso estimado: {formatMoney(create.data.refund)}
          {data.payment_label && ` a tu ${data.payment_label}`}.
        </p>
        <div>
          <ButtonLink to="/cuenta/pedidos">Volver a mis pedidos</ButtonLink>
        </div>
      </section>
    )
  }

  if (!data.return_deadline) {
    return (
      <ErrorState
        headingLevel={1}
        title="Este pedido ya no se puede devolver"
        actions={<ButtonLink to={`/cuenta/pedidos/${id}`}>Volver al pedido</ButtonLink>}
      >
        Las devoluciones se piden hasta 30 días después de recibir el pedido. Si tienes un problema con un
        producto, revisa la <Link to="/ayuda/devoluciones">política de devoluciones</Link>.
      </ErrorState>
    )
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (picked.size === 0) next.items = 'Elige al menos un producto.'
    if (!reason) next.reason = 'Elige el motivo.'
    if (NEEDS_PHOTO.has(reason) && !photo) next.photo = 'Agrega una foto del problema.'
    setErrors(next)
    if (Object.keys(next).length) {
      window.requestAnimationFrame(() => summaryRef.current?.focus())
      return
    }
    create.mutate(
      {
        items: data.items.filter((i) => picked.has(i.id)).map((i) => ({ item_id: i.id, qty: i.qty })),
        reason,
        comment: comment || undefined,
        method,
        photo,
      },
      {
        onError: (error) => {
          if (error instanceof ApiError) setErrors(error.fieldErrors)
          window.requestAnimationFrame(() => summaryRef.current?.focus())
        },
      },
    )
  }

  const errorCount = Object.keys(errors).length

  return (
    <>
      <Link to={`/cuenta/pedidos/${id}`} className={styles.backLink}>
        <span aria-hidden="true">‹&nbsp;</span>Pedido {data.folio}
      </Link>
      <h1>Solicitar devolución</h1>
      <form className={styles.section} noValidate onSubmit={submit}>
        <div ref={summaryRef} tabIndex={-1}>
          {errorCount > 0 && (
            <FormErrorSummary>Revisa {plural(errorCount, 'campo')} antes de continuar.</FormErrorSummary>
          )}
          {create.isError &&
            !(create.error instanceof ApiError && Object.keys(create.error.fieldErrors).length) && (
              <FormErrorSummary>
                {create.error instanceof ApiError ? create.error.message : 'No pudimos enviar tu solicitud.'}
              </FormErrorSummary>
            )}
        </div>
        <div className={styles.notice}>
          Tienes hasta el {formatDate(data.return_deadline)} para devolver productos de este pedido.{' '}
          <Link to="/ayuda/devoluciones">Ver política de devoluciones</Link>
        </div>

        <fieldset className={styles.fieldset} aria-describedby={errors.items ? 'err-items' : undefined}>
          <legend className={styles.legend}>1. ¿Qué quieres devolver?</legend>
          {data.items.map((item) => (
            <label key={item.id} className={styles.option}>
              <input
                type="checkbox"
                checked={picked.has(item.id)}
                onChange={(e) => {
                  const next = new Set(picked)
                  if (e.target.checked) next.add(item.id)
                  else next.delete(item.id)
                  setSelected(next)
                }}
              />
              <span>
                <strong>{item.name}</strong>
                <br />
                <span className={styles.muted}>
                  SKU {item.sku} · {plural(item.qty, 'pieza')} · {formatMoney(item.unit_price)} c/u
                </span>
              </span>
            </label>
          ))}
          {errors.items && <FieldError id="err-items">{errors.items}</FieldError>}
        </fieldset>

        <fieldset className={styles.fieldset} aria-describedby={errors.reason ? 'err-reason' : undefined}>
          <legend className={styles.legend}>2. Motivo</legend>
          {REASONS.map((r) => (
            <label key={r.value} className={styles.option}>
              <input
                type="radio"
                name="motivo"
                checked={reason === r.value}
                onChange={() => setReason(r.value)}
              />
              <span>{r.label}</span>
            </label>
          ))}
          {errors.reason && <FieldError id="err-reason">{errors.reason}</FieldError>}
          {NEEDS_PHOTO.has(reason) && (
            <div className={styles.fieldset}>
              <label htmlFor="foto-devolucion">
                <strong>Foto del problema</strong> (obligatoria para productos dañados o incompletos)
              </label>
              <input
                id="foto-devolucion"
                type="file"
                accept="image/*"
                aria-invalid={errors.photo ? true : undefined}
                aria-describedby={errors.photo ? 'err-photo' : undefined}
                onChange={(e) => setPhoto(e.target.files?.[0])}
              />
              {errors.photo && <FieldError id="err-photo">{errors.photo}</FieldError>}
            </div>
          )}
          <Textarea
            label="Cuéntanos más"
            optional
            rows={3}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>3. Cómo lo entregas</legend>
          <label className={styles.option}>
            <input
              type="radio"
              name="entrega"
              checked={method === 'tienda'}
              onChange={() => setMethod('tienda')}
            />
            <span>
              <strong>Llevarlo a una sucursal</strong>
              <br />
              <span className={styles.muted}>
                Gratis ·{' '}
                {data.fulfillment.type === 'pickup'
                  ? `${data.fulfillment.store_name} o cualquier otra`
                  : 'cualquier sucursal'}
              </span>
            </span>
          </label>
          <label className={styles.option}>
            <input
              type="radio"
              name="entrega"
              checked={method === 'recoleccion'}
              onChange={() => setMethod('recoleccion')}
            />
            <span>
              <strong>Recolección a domicilio</strong>
              <br />
              <span className={styles.muted}>
                {home ? `${home.street} ${home.ext}, ${home.colony} · ` : ''}costo según tu CP
              </span>
            </span>
          </label>
          <p className={styles.muted}>
            El reembolso se hace al mismo medio de pago{data.payment_label ? `: ${data.payment_label}` : ''}.
          </p>
        </fieldset>

        <div>
          <Button type="submit" size="lg" loading={create.isPending}>
            Enviar solicitud
          </Button>
        </div>
      </form>
    </>
  )
}
