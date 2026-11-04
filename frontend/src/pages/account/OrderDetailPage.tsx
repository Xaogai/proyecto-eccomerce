import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api/errors'
import type { Order } from '@/api/schemas/order'
import { ErrorState, PageSkeleton } from '@/components/feedback/States'
import { StatusBadge } from '@/components/ui/Badge'
import { useMyOrder } from '@/features/account/api'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'
import { type OrderStatus, orderStatusInfo } from '@/lib/orderStatus'
import { NotFoundPage } from '../NotFoundPage'
import styles from './account.module.css'
import { ProductImage } from '@/components/ui/ProductImage'

const PICKUP: OrderStatus[] = [
  'creado',
  'pendiente_pago',
  'pagado',
  'en_preparacion',
  'listo_para_recoger',
  'entregado',
]
const SHIP: OrderStatus[] = ['creado', 'pendiente_pago', 'pagado', 'en_preparacion', 'enviado', 'entregado']

/** Línea de tiempo: los pasos normales del pedido y, si el pedido se salió del camino, su estado real al final. */
function timelineSteps(order: Order) {
  const base = order.fulfillment.type === 'pickup' ? PICKUP : SHIP
  const at = new Map(order.timeline.map((t) => [t.status, t.at]))
  const offPath = (['cancelado', 'incidencia', 'reembolsado'] as OrderStatus[]).filter((s) => at.has(s))
  const steps = offPath.length ? [...base.filter((s) => at.has(s)), ...offPath] : base
  return steps.map((status) => ({ status, at: at.get(status) }))
}

/** Seguimiento de pedido (pantallas 32 y 42). */
export function OrderDetailPage() {
  const { id = '' } = useParams()
  const order = useMyOrder(id)
  usePageTitle(order.data ? `Pedido ${order.data.folio}` : 'Pedido')

  if (order.isPending) return <PageSkeleton label="Cargando tu pedido" />
  if (order.error instanceof ApiError && [403, 404].includes(order.error.status)) return <NotFoundPage />
  if (!order.data)
    return <ErrorState headingLevel={1} title="No pudimos cargar tu pedido" onRetry={() => order.refetch()} />

  const data = order.data
  const steps = timelineSteps(data)
  const current = steps.findIndex((s) => s.status === data.status)
  const pickup = data.fulfillment.type === 'pickup'
  const canCancelText =
    data.status === 'en_preparacion' || data.status === 'listo_para_recoger' || data.status === 'enviado'
      ? 'Ya no puedes cancelar: el pedido está preparado. Si no lo necesitas, puedes devolverlo después de recibirlo.'
      : null

  return (
    <>
      <Link to="/cuenta/pedidos" className={styles.backLink}>
        <span aria-hidden="true">‹&nbsp;</span>Mis pedidos
      </Link>
      <div className={styles.titleRow}>
        <div>
          <h1>Pedido {data.folio}</h1>
          <span className={styles.muted}>
            Hecho el {formatDate(data.created_at)}
            {data.payment_label && ` · pagado con ${data.payment_label}`}
          </span>
        </div>
        <StatusBadge status={data.status} />
      </div>

      <div className={styles.twoCols}>
        <section aria-labelledby="estado" className={styles.section}>
          <h2 id="estado">Estado</h2>
          <ol className={styles.timeline} aria-label="Estado del pedido">
            {steps.map((s, i) => (
              <li key={s.status} data-done={i <= current} aria-current={i === current ? 'step' : undefined}>
                <span className={styles.dot} aria-hidden="true" />
                <span>
                  <span>{orderStatusInfo[s.status].label}</span>
                  <br />
                  <span className={styles.muted}>{s.at ? formatDateTime(s.at) : 'Pendiente'}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className={styles.list}>
          <section aria-labelledby="entrega" className={styles.section}>
            {data.fulfillment.type === 'pickup' ? (
              <>
                <h2 id="entrega">Recoger en {data.fulfillment.store_name}</h2>
                <span className={styles.muted}>
                  Mostrador de pedidos en línea. Lleva tu folio o una identificación.
                </span>
                {data.pickup_code && data.status === 'listo_para_recoger' && (
                  <div className={styles.code}>
                    <span className={styles.muted}>Código de entrega</span>
                    <span className={styles.codeValue}>{data.pickup_code}</span>
                    <span className={styles.muted}>Muéstralo junto con tu identificación</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <h2 id="entrega">Envío a domicilio</h2>
                <span>{data.fulfillment.address_label}</span>
                {data.fulfillment.tracking && (
                  <span className={styles.muted}>Número de guía: {data.fulfillment.tracking}</span>
                )}
              </>
            )}
          </section>

          <section aria-labelledby="productos" className={styles.section}>
            <h2 id="productos">Productos</h2>
            <ul role="list">
              {data.items.map((item) => (
                <li key={item.id} className={styles.itemRow}>
                  <ProductImage image={item.image} alt="" width={56} height={42} />
                  <div>
                    <Link to={`/producto/${item.product_sku}`}>{item.name}</Link>
                    <div className={styles.muted}>
                      SKU {item.sku} · {item.qty} × {formatMoney(item.unit_price)}
                    </div>
                  </div>
                  <span>{formatMoney(item.unit_price * item.qty)}</span>
                  <div className={styles.itemLinks}>
                    <Link
                      to={`/producto/${item.product_sku}/resena?pedido=${data.id}`}
                      aria-label={`Escribir reseña de ${item.name}`}
                    >
                      Escribir reseña
                    </Link>
                    {data.return_deadline && (
                      <Link
                        to={`/cuenta/pedidos/${data.id}/devolucion?producto=${item.id}`}
                        aria-label={`Devolver ${item.name}`}
                      >
                        Devolver
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <dl className={styles.totals}>
              <div>
                <dt>Subtotal</dt>
                <dd>{formatMoney(data.totals.subtotal)}</dd>
              </div>
              <div>
                <dt>{pickup ? 'Recoger en tienda' : 'Envío'}</dt>
                <dd>{data.totals.shipping ? formatMoney(data.totals.shipping) : 'Gratis'}</dd>
              </div>
              <div className={styles.totalRow}>
                <dt>{data.payment_status === 'pagado' ? 'Total pagado' : 'Total'}</dt>
                <dd>{formatMoney(data.totals.total)}</dd>
              </div>
            </dl>
          </section>

          {data.returns.length > 0 && (
            <section aria-labelledby="devoluciones" className={styles.section}>
              <h2 id="devoluciones">Devoluciones</h2>
              <ul>
                {data.returns.map((r) => (
                  <li key={r.folio}>
                    {r.folio} · {r.status} · {formatDate(r.created_at)}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className={styles.notice}>
            {canCancelText && <p>{canCancelText}</p>}
            {data.return_deadline && (
              <p>Puedes devolver productos de este pedido hasta el {formatDate(data.return_deadline)}.</p>
            )}
            <Link to="/ayuda/devoluciones">Ayuda con este pedido</Link>
          </section>
        </div>
      </div>
    </>
  )
}
