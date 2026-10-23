import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/States'
import { StatusBadge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { ToggleChips } from '@/components/ui/Chip'
import { Pagination } from '@/components/ui/Pagination'
import { type OrderGroup, useMyOrders } from '@/features/account/api'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatDate, formatMoney, plural } from '@/lib/format'
import styles from './account.module.css'

const GROUPS: Array<{ value: OrderGroup; label: string }> = [
  { value: 'todos', label: 'Todos' },
  { value: 'curso', label: 'En curso' },
  { value: 'fin', label: 'Terminados' },
]

/** Mis pedidos (pantallas 31 y 41). El filtro y la página viven en la URL. */
export function OrdersPage() {
  usePageTitle('Mis pedidos')
  const [params, setParams] = useSearchParams()
  const group = (GROUPS.find((g) => g.value === params.get('estado'))?.value ?? 'todos') as OrderGroup
  const page = Math.max(1, Number(params.get('page')) || 1)
  const orders = useMyOrders(group, page)

  return (
    <>
      <h1>Mis pedidos</h1>
      <ToggleChips
        label="Filtrar por estado"
        options={GROUPS}
        value={group}
        onChange={(value) => setParams(value === 'todos' ? {} : { estado: value }, { flushSync: true })}
      />
      <p className={styles.muted} aria-live="polite">
        {orders.data ? plural(orders.data.total, 'pedido') : ''}
      </p>

      {orders.isError ? (
        <ErrorState title="No pudimos cargar tus pedidos" onRetry={() => orders.refetch()} />
      ) : orders.isPending ? (
        <Skeleton height={200} />
      ) : orders.data.items.length === 0 ? (
        <EmptyState
          title={group === 'todos' ? 'Aún no tienes pedidos' : 'No hay pedidos en esta lista'}
          actions={<ButtonLink to="/">Ir a la tienda</ButtonLink>}
        />
      ) : (
        <>
          <ul role="list" className={styles.list}>
            {orders.data.items.map((o) => (
              <li key={o.id}>
                <article className={styles.row}>
                  <div className={styles.rowMain}>
                    <h2 className={styles.rowTitle}>
                      <Link to={`/cuenta/pedidos/${o.id}`}>Pedido {o.folio}</Link>
                    </h2>
                    <span className={styles.muted}>
                      {formatDate(o.created_at)} · {plural(o.item_count, 'producto')}
                    </span>
                    <span className={styles.muted}>{o.fulfillment_label}</span>
                  </div>
                  <span className={styles.rowTotal}>{formatMoney(o.total)}</span>
                  <StatusBadge status={o.status} />
                  <ButtonLink
                    to={`/cuenta/pedidos/${o.id}`}
                    variant="outline"
                    size="sm"
                    aria-label={`Ver detalle del pedido ${o.folio}`}
                  >
                    Ver detalle
                  </ButtonLink>
                </article>
              </li>
            ))}
          </ul>
          <Pagination
            page={orders.data.page}
            totalPages={Math.ceil(orders.data.total / orders.data.page_size)}
          />
        </>
      )}
    </>
  )
}
