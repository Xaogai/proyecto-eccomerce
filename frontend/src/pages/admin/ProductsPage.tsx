import { Link } from 'react-router-dom'
import type { AdminProductRow } from '@/api/schemas/admin'
import { ErrorState } from '@/components/feedback/States'
import { ProductStatusBadge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { ToggleChips } from '@/components/ui/Chip'
import { DataTable } from '@/components/ui/DataTable'
import { Select, TextField } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { useAdminCategories, useAdminProducts } from '@/features/admin/api'
import { flattenCategories } from '@/features/admin/categories'
import { useUrlFilters } from '@/features/admin/useUrlFilters'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatMoney, plural } from '@/lib/format'
import styles from './admin.module.css'

const STATUSES = [
  { value: 'todos', label: 'Todos' },
  { value: 'publicado', label: 'Publicados' },
  { value: 'borrador', label: 'Borradores' },
  { value: 'agotado', label: 'Agotados' },
] as const
type StatusFilter = (typeof STATUSES)[number]['value']

/** Productos (pantalla 49): búsqueda, categoría y estado en la URL; tabla con enlace a editar. */
export function ProductsPage() {
  usePageTitle('Productos · Administración')
  const filters = useUrlFilters()
  const status = (STATUSES.find((s) => s.value === filters.get('estado'))?.value ?? 'todos') as StatusFilter
  const category = filters.get('categoria')
  const categories = useAdminCategories()
  const products = useAdminProducts({
    q: filters.get('q'),
    category,
    status: status === 'todos' ? undefined : status,
    page: filters.page,
  })
  const counts = products.data?.counts

  return (
    <>
      <div className={styles.titleRow}>
        <h1>Productos</h1>
        <ButtonLink to="/admin/productos/nuevo">Nuevo producto</ButtonLink>
      </div>

      <div className={styles.filters}>
        <TextField
          label="Buscar"
          type="search"
          placeholder="Nombre o SKU"
          value={filters.text}
          onChange={(e) => filters.setText(e.target.value)}
        />
        <Select
          label="Categoría"
          value={category}
          onChange={(e) => filters.set('categoria', e.target.value || null)}
        >
          <option value="">Todas</option>
          {flattenCategories(categories.data ?? []).map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>
      <ToggleChips
        label="Estado"
        value={status}
        onChange={(v) => filters.set('estado', v === 'todos' ? null : v)}
        options={STATUSES.map((s) => ({
          value: s.value,
          label: (
            <>
              {s.label}
              {counts && <span className={styles.chipCount}> {counts[s.value] ?? 0}</span>}
            </>
          ),
        }))}
      />
      <p className={styles.count} aria-live="polite">
        {products.data ? plural(products.data.total, 'producto') : ''}
      </p>

      {products.isError ? (
        <ErrorState title="No pudimos cargar los productos" onRetry={() => products.refetch()} />
      ) : (
        <>
          <DataTable<AdminProductRow>
            caption="Productos"
            loading={products.isPending}
            rows={products.data?.items ?? []}
            rowKey={(r) => r.id}
            empty="No hay productos con estos filtros."
            columns={[
              {
                key: 'name',
                header: 'Producto',
                rowHeader: true,
                cell: (r) => (
                  <span className={styles.cellMain}>
                    <Link to={`/admin/productos/${r.id}`}>{r.name}</Link>
                    <span className={styles.sku}>SKU {r.sku}</span>
                  </span>
                ),
              },
              { key: 'category', header: 'Categoría', cell: (r) => r.category_label },
              { key: 'variants', header: 'Variantes', cell: (r) => r.variant_count, align: 'end' },
              {
                key: 'price',
                header: 'Precio desde',
                cell: (r) => (r.price_from === null ? 'Sin precio' : formatMoney(r.price_from)),
                align: 'end',
              },
              {
                key: 'stock',
                header: 'Stock total',
                cell: (r) => r.stock_total.toLocaleString('es-MX'),
                align: 'end',
              },
              { key: 'status', header: 'Estado', cell: (r) => <ProductStatusBadge status={r.status} /> },
              {
                key: 'actions',
                header: <span className="sr-only">Acciones</span>,
                cell: (r) => (
                  <Link to={`/admin/productos/${r.id}`} aria-label={`Editar ${r.name}`}>
                    Editar
                  </Link>
                ),
              },
            ]}
          />
          {products.data && (
            <Pagination
              page={products.data.page}
              totalPages={Math.ceil(products.data.total / products.data.page_size)}
            />
          )}
        </>
      )}
    </>
  )
}
