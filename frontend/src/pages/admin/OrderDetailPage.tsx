import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api/errors'
import type { AdminOrder } from '@/api/schemas/admin'
import { ErrorState, Skeleton } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/toastContext'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { Select, TextField } from '@/components/ui/Field'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { useAdminOrder, useChangeOrderStatus } from '@/features/admin/api'
import { usePageTitle } from '@/hooks/usePageTitle'
import { cx } from '@/lib/cx'
import { formatDateTime, formatMoney } from '@/lib/format'
import { type OrderStatus, orderStatusInfo, paymentStatusInfo } from '@/lib/orderStatus'
import styles from './admin.module.css'

/** Estos cambios no se pueden deshacer: se piden confirmar. */
const FINAL: OrderStatus[] = ['cancelado', 'reembolsado']

const time = new Intl.DateTimeFormat('es-MX', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
})

/** Detalle de pedido (pantalla 53): cambio de estado solo a los permitidos (I3), pago, avisos de la pasarela y registro. */
export function OrderDetailPage() {
  const { id = '' } = useParams()
  const order = useAdminOrder(id)
  usePageTitle(order.data ? `Pedido ${order.data.folio} · Administración` : 'Pedido · Administración')

  return (
    <>
      <Link to="/admin/pedidos" className={styles.backLink}>
        ‹ Pedidos
      </Link>
      {order.isPending ? (
        <Skeleton height={420} />
      ) : order.isError ? (
        <ErrorState
          headingLevel={1}
          title={
            order.error instanceof ApiError && order.error.status === 404
              ? 'No encontramos este pedido'
              : 'No pudimos cargar el pedido'
          }
          onRetry={() => order.refetch()}
        />
      ) : (
        <OrderView order={order.data} />
      )}
    </>
  )
}

function OrderView({ order }: { order: AdminOrder }) {
  const f = order.fulfillment
  const payment = paymentStatusInfo[order.payment_status]

  return (
    <>
      <div className={styles.titleRow}>
        <h1>
          Pedido {order.folio}
          <span aria-live="polite">
            <StatusBadge status={order.status} />
          </span>
        </h1>
        <span className={styles.muted}>
          {formatDateTime(order.created_at)} ·{' '}
          {f.type === 'pickup' ? `Recoger en ${f.store_name}` : 'Envío a domicilio'}
        </span>
      </div>

      <StatusChange order={order} />

      <div className={styles.columns}>
        <section aria-labelledby="productos" className={styles.card}>
          <h2 id="productos">Productos</h2>
          <ul role="list" className={styles.lines}>
            {order.items.map((i) => (
              <li key={i.id} className={styles.line}>
                <span className={styles.cellMain}>
                  {i.name}
                  <span className={styles.sku}>
                    SKU {i.sku} · {i.variant_label} · {i.qty} × {formatMoney(i.unit_price)}
                  </span>
                </span>
                <span>{formatMoney(i.unit_price * i.qty)}</span>
              </li>
            ))}
            <li className={styles.line}>
              <span>{f.type === 'pickup' ? 'Recoger en sucursal' : 'Envío'}</span>
              <span>{order.totals.shipping ? formatMoney(order.totals.shipping) : 'Sin costo'}</span>
            </li>
            <li className={cx(styles.line, styles.lineTotal)}>
              <span>Total</span>
              <span>{formatMoney(order.totals.total)}</span>
            </li>
          </ul>
          {order.returns.length > 0 && (
            <p className={styles.muted}>
              Devoluciones: {order.returns.map((r) => `${r.folio} (${r.status})`).join(', ')}
            </p>
          )}
        </section>

        <section aria-labelledby="cliente" className={styles.card}>
          <h2 id="cliente">Cliente</h2>
          <dl className={styles.dl}>
            <dt className="sr-only">Nombre</dt>
            <dd>
              <strong>{order.contact.name}</strong>
            </dd>
            <dt className="sr-only">Contacto</dt>
            <dd className={styles.muted}>
              {order.contact.email} · {order.contact.phone}
            </dd>
            <dt className="sr-only">Entrega</dt>
            <dd>{f.type === 'pickup' ? `Recoger en ${f.store_name}` : f.address_label}</dd>
            {f.type === 'ship' && f.tracking && (
              <>
                <dt className="sr-only">Guía</dt>
                <dd className={styles.muted}>Guía {f.tracking}</dd>
              </>
            )}
          </dl>
        </section>
      </div>

      <section aria-labelledby="pago" className={styles.card}>
        <div className={styles.cardHead}>
          <h2 id="pago">Pago</h2>
          <Badge tone={payment.tone}>{payment.label}</Badge>
        </div>
        <p>
          {order.payment_label
            ? order.payment_label.charAt(0).toUpperCase() + order.payment_label.slice(1)
            : 'La pasarela aún no informa el medio de pago.'}
        </p>
        <DataTable
          caption="Avisos de la pasarela"
          showCaption
          rows={order.webhook_log}
          rowKey={(w) => `${w.at}-${w.event}`}
          empty="Sin avisos de la pasarela."
          columns={[
            { key: 'event', header: 'Aviso', cell: (w) => w.event, rowHeader: true },
            { key: 'at', header: 'Hora', cell: (w) => time.format(new Date(w.at)) },
            { key: 'result', header: 'Resultado', cell: (w) => w.result },
          ]}
        />
      </section>

      <section aria-labelledby="registro" className={styles.card}>
        <h2 id="registro">Registro de cambios</h2>
        <ol role="list" className={styles.log}>
          {order.audit_log.map((a) => (
            <li key={`${a.at}-${a.to}`}>
              <span className={styles.muted}>{formatDateTime(a.at)}</span>
              <span>
                {a.from ? `${orderStatusInfo[a.from].label} → ` : ''}
                <strong>{orderStatusInfo[a.to].label}</strong>
                {a.note && <span className={styles.muted}> · {a.note}</span>}
              </span>
              <span className={styles.muted}>{a.actor}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}

function StatusChange({ order }: { order: AdminOrder }) {
  const change = useChangeOrderStatus(order.id)
  const { toast } = useToast()
  const [to, setTo] = useState<OrderStatus | ''>('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string>()
  const [confirming, setConfirming] = useState(false)
  const current = orderStatusInfo[order.status].label

  const apply = async () => {
    if (!to) return setError('Elige el nuevo estado.')
    setError(undefined)
    try {
      await change.mutateAsync({ to, note: note.trim() || undefined })
      toast(`El pedido pasó a "${orderStatusInfo[to].label}"`, 'ok')
      setTo('')
      setNote('')
    } catch (e) {
      // 409 invalid_transition: otra persona lo cambió antes; se recarga para ver el estado real.
      if (e instanceof ApiError) setError(e.message)
    } finally {
      setConfirming(false)
    }
  }

  return (
    <section aria-labelledby="estado" className={styles.card}>
      <h2 id="estado">Cambiar estado</h2>
      {order.allowed_transitions.length === 0 ? (
        <p className={styles.muted}>"{current}" es un estado final: el pedido ya no cambia.</p>
      ) : (
        <>
          <form
            noValidate
            className={styles.statusForm}
            onSubmit={(e) => {
              e.preventDefault()
              if (to && FINAL.includes(to)) setConfirming(true)
              else apply()
            }}
          >
            <Select
              label="Nuevo estado"
              value={to}
              error={error}
              onChange={(e) => {
                setTo(e.target.value as OrderStatus)
                setConfirming(false)
              }}
            >
              <option value="">Elige un estado</option>
              {order.allowed_transitions.map((s) => (
                <option key={s} value={s}>
                  {orderStatusInfo[s].label}
                </option>
              ))}
            </Select>
            <TextField
              label="Nota para el registro"
              optional
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <Button type="submit" loading={change.isPending && !confirming}>
              Aplicar
            </Button>
          </form>
          {confirming && to && (
            <InlineConfirm
              question={`¿Pasar el pedido a "${orderStatusInfo[to].label}"? No se puede deshacer.`}
              confirmLabel="Sí, cambiar"
              loading={change.isPending}
              onConfirm={apply}
              onCancel={() => setConfirming(false)}
            />
          )}
          <p className={styles.muted}>
            Solo se muestran los estados válidos desde "{current}" según el ciclo de vida del pedido.
          </p>
        </>
      )}
    </section>
  )
}
