import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/errors'
import type { Order } from '@/api/schemas/order'
import { ErrorState, PageSkeleton } from '@/components/feedback/States'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Stepper } from '@/components/ui/Stepper'
import { guestToken, useOrder, useRetryPayment } from '@/features/checkout/api'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatMoney, plural } from '@/lib/format'
import { orderStatusInfo, type OrderStatus } from '@/lib/orderStatus'
import styles from './checkout.module.css'

const PICKUP_STEPS: OrderStatus[] = [
  'creado',
  'pendiente_pago',
  'pagado',
  'en_preparacion',
  'listo_para_recoger',
  'entregado',
]
const SHIP_STEPS: OrderStatus[] = [
  'creado',
  'pendiente_pago',
  'pagado',
  'en_preparacion',
  'enviado',
  'entregado',
]

const COPY = {
  pendiente: {
    tone: 'aviso',
    eyebrow: 'Pago en proceso',
    title: 'Estamos confirmando tu pago',
    text: 'Tu pedido ya está apartado. En cuanto la pasarela confirme el pago te avisamos por correo; normalmente tarda menos de un minuto. No vuelvas a pagar.',
  },
  pagado: {
    tone: 'ok',
    eyebrow: 'Pago confirmado',
    title: 'Gracias, tu pedido está pagado',
    text: '',
  },
  rechazado: {
    tone: 'error',
    eyebrow: 'Pago rechazado',
    title: 'Tu banco no aprobó el pago',
    text: 'No se hizo ningún cargo. Tus productos siguen apartados 30 minutos: puedes intentar con otra tarjeta o revisar tu carrito.',
  },
} as const

/** Confirmación (pantallas 06 y 13): pendiente, pagado o rechazado. Consulta el pedido hasta que se confirme. */
export function ConfirmationPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const token = params.get('token') ?? guestToken(id)
  const [startedAt] = useState(() => Date.now())
  const order = useOrder(id, token, startedAt)
  const retry = useRetryPayment(id, token)
  usePageTitle(order.data ? COPY[order.data.payment_status].title : 'Tu pedido')

  if (order.isPending) return <PageSkeleton label="Cargando tu pedido" />
  if (order.isError || !order.data) {
    const notAllowed = order.error instanceof ApiError && [401, 403, 404].includes(order.error.status)
    return (
      <ErrorState
        headingLevel={1}
        title={notAllowed ? 'No encontramos este pedido' : 'No pudimos cargar tu pedido'}
        onRetry={notAllowed ? undefined : () => order.refetch()}
        actions={
          <ButtonLink to="/" variant="outline">
            Ir al inicio
          </ButtonLink>
        }
      >
        {notAllowed
          ? 'Revisa el enlace del correo de confirmación o inicia sesión con la cuenta con la que compraste.'
          : 'Tu pedido está guardado. Revisa tu conexión e intenta de nuevo.'}
      </ErrorState>
    )
  }

  const data = order.data
  const copy = COPY[data.payment_status]
  const pickup = data.fulfillment.type === 'pickup'
  const where =
    data.fulfillment.type === 'pickup' ? data.fulfillment.store_name : data.fulfillment.address_label
  const pieces = data.items.reduce((n, i) => n + i.qty, 0)
  // El polling se detiene a los 90 s (useOrder): si sigue pendiente, se avisa que llegará por correo.
  const stillWaiting = data.payment_status === 'pendiente' && order.dataUpdatedAt - startedAt >= 88_000

  return (
    <>
      <section role="status" aria-live="polite" className={styles.statusBox} data-tone={copy.tone}>
        <span className={styles.eyebrow}>{copy.eyebrow}</span>
        <h1>{copy.title}</h1>
        <p className={styles.statusText}>
          {data.payment_status === 'pagado'
            ? pickup
              ? `Te avisaremos por correo cuando esté listo para recoger en ${where}.`
              : 'Te avisaremos por correo cuando salga a entrega con su número de guía.'
            : copy.text}
          {stillWaiting && ' La confirmación está tardando más de lo normal; te avisaremos por correo.'}
        </p>
        {data.payment_status === 'rechazado' && (
          <div className={styles.actions}>
            <Button onClick={() => retry.mutate()} loading={retry.isPending}>
              Reintentar el pago
            </Button>
            <ButtonLink to="/carrito" variant="outline">
              Revisar carrito
            </ButtonLink>
          </div>
        )}
      </section>

      {data.payment_status !== 'rechazado' && (
        <OrderSummary order={data} pieces={pieces} where={where} hasToken={!!token} />
      )}
    </>
  )
}

function OrderSummary({
  order,
  pieces,
  where,
  hasToken,
}: {
  order: Order
  pieces: number
  where: string
  hasToken: boolean
}) {
  const pickup = order.fulfillment.type === 'pickup'
  const steps = pickup ? PICKUP_STEPS : SHIP_STEPS
  const current = Math.max(0, steps.indexOf(order.status))

  return (
    <section aria-labelledby="pedido-titulo" className={styles.orderCard}>
      <div className={styles.orderHead}>
        <h2 id="pedido-titulo">Pedido {order.folio}</h2>
        <span className={styles.muted}>Enviamos el detalle a {order.contact.email}</span>
      </div>
      <Stepper
        label="Estado del pedido"
        steps={steps.map((s) => orderStatusInfo[s].label)}
        current={current}
      />
      <div className={styles.facts}>
        <div className={styles.fact}>
          <span className={styles.muted}>{pickup ? 'Recoger en' : 'Enviar a'}</span>
          <span className={styles.factValue}>{where}</span>
          {pickup && (
            <span className={styles.muted}>
              Lleva tu folio{order.pickup_code ? ` y el código ${order.pickup_code}` : ''} o una
              identificación.
            </span>
          )}
        </div>
        <div className={styles.fact}>
          <span className={styles.muted}>Total</span>
          <span className={styles.factValue}>{formatMoney(order.totals.total)}</span>
          <span className={styles.muted}>
            {plural(order.items.length, 'producto')} · {plural(pieces, 'pieza')}
          </span>
        </div>
      </div>
      <div className={styles.actions}>
        {!hasToken && <ButtonLink to={`/cuenta/pedidos/${order.id}`}>Ver seguimiento del pedido</ButtonLink>}
        <ButtonLink to="/" variant="outline">
          Seguir comprando
        </ButtonLink>
      </div>
    </section>
  )
}
