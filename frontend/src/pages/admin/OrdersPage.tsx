import { Link } from 'react-router-dom'
import type { AdminOrderRow } from '@/api/schemas/admin'
import { ErrorState } from '@/components/feedback/States'
import { StatusBadge } from '@/components/ui/Badge'
import { ToggleChips } from '@/components/ui/Chip'
import { DataTable } from '@/components/ui/DataTable'
import { Select, TextField } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { useAdminOrders, useAllStores } from '@/features/admin/api'
import { useUrlFilters } from '@/features/admin/useUrlFilters'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatDateTime, formatMoney, plural } from '@/lib/format'
import styles from './admin.module.css'

const GROUPS = [
  { value: 'todos', label: 'Todos' },
  { value: 'pago', label: 'Por pagar' },
  { value: 'prep', label: 'Por preparar' },
  { value: 'listos', label: 'Listos o enviados' },
  { value: 'inc', label: 'Incidencias' },
  { value: 'fin', label: 'Terminados' },
] as const
type Group = (typeof GROUPS)[number]['value']

const PERIODS = [
  { value: '', label: 'Cualquier fecha' },
  { value: '1', label: 'Hoy' },
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
]

/** Pedidos (pantalla 52): búsqueda, sucursal, fecha y estado en la URL. */
export function OrdersPage() {
  usePageTitle('Pedidos · Administración')
  const filters = useUrlFilters()
  const group = (GROUPS.find((g) => g.value === filters.get('estado'))?.value ?? 'todos') as Group
  const stores = useAllStores()
  const orders = useAdminOrders({
    q: filters.get('q'),
    store_id: filters.get('sucursal'),
    days: Number(filters.get('dias')) || undefined,
    status_group: group === 'todos' ? undefined : group,
    page: filters.page,
  })
  const counts = orders.data?.counts

  return (
    <>
      <h1>Pedidos</h1>
      <div className={styles.filters}>
        <TextField
          label="Buscar"
          type="search"
          placeholder="Folio, cliente o correo"
          value={filters.text}
          onChange={(e) => filters.setText(e.target.value)}
        />
        <Select
          label="Sucursal de recolección"
          value={filters.get('sucursal')}
          onChange={(e) => filters.set('sucursal', e.target.value || null)}
        >
          <option value="">Todas</option>
          {stores.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          label="Fecha"
          value={filters.get('dias')}
          onChange={(e) => filters.set('dias', e.target.value || null)}
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </div>
      <ToggleChips
        label="Estado"
        value={group}
        onChange={(v) => filters.set('estado', v === 'todos' ? null : v)}
        options={GROUPS.map((g) => ({
          value: g.value,
          label: (
            <>
              {g.label}
              {counts && <span className={styles.chipCount}> {counts[g.value] ?? 0}</span>}
            </>
          ),
        }))}
      />
      <p className={styles.count} aria-live="polite">
        {orders.data ? plural(orders.data.total, 'pedido') : ''}
      </p>

      {orders.isError ? (
        <ErrorState title="No pudimos cargar los pedidos" onRetry={() => orders.refetch()} />
      ) : (
        <>
          <DataTable<AdminOrderRow>
            caption="Pedidos"
            loading={orders.isPending}
            rows={orders.data?.items ?? []}
            rowKey={(r) => r.id}
            empty="No hay pedidos con estos filtros."
            columns={[
              { key: 'folio', header: 'Folio', rowHeader: true, cell: (r) => r.folio },
              {
                key: 'customer',
                header: 'Cliente',
                cell: (r) => (
                  <span className={styles.cellMain}>
                    {r.customer}
                    <span className={styles.sku}>{r.email}</span>
                  </span>
                ),
              },
              { key: 'fulfillment', header: 'Entrega', cell: (r) => r.fulfillment_label },
              { key: 'date', header: 'Fecha', cell: (r) => formatDateTime(r.created_at) },
              { key: 'total', header: 'Total', cell: (r) => formatMoney(r.total), align: 'end' },
              { key: 'status', header: 'Estado', cell: (r) => <StatusBadge status={r.status} /> },
              {
                key: 'open',
                header: <span className="sr-only">Ver</span>,
                cell: (r) => (
                  <Link to={`/admin/pedidos/${r.id}`} aria-label={`Abrir pedido ${r.folio}`}>
                    Abrir
                  </Link>
                ),
              },
            ]}
          />
          {orders.data && (
            <Pagination
              page={orders.data.page}
              totalPages={Math.ceil(orders.data.total / orders.data.page_size)}
            />
          )}
        </>
      )}
    </>
  )
}
