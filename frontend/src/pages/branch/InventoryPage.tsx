import { useState } from 'react'
import { ApiError } from '@/api/errors'
import type { InventoryRow } from '@/api/schemas/branch'
import { ErrorState } from '@/components/feedback/States'
import { Button } from '@/components/ui/Button'
import { ToggleChips } from '@/components/ui/Chip'
import { DataTable } from '@/components/ui/DataTable'
import { TextField } from '@/components/ui/Field'
import { Pagination } from '@/components/ui/Pagination'
import { ADJUST_REASONS, useAdjustStock, useInventory } from '@/features/branch/api'
import { BranchPicker } from '@/features/branch/BranchPicker'
import { usePageTitle } from '@/hooks/usePageTitle'
import { useUrlFilters } from '@/hooks/useUrlFilters'
import { cx } from '@/lib/cx'
import { plural } from '@/lib/format'
import styles from './branch.module.css'

const STATUSES = [
  { value: 'todos', label: 'Todos' },
  { value: 'low', label: 'Pocas piezas' },
  { value: 'out', label: 'Agotados' },
] as const
type StatusFilter = (typeof STATUSES)[number]['value']

/** Inventario de la sucursal (pantalla 57): ajustes con motivo obligatorio; nunca por debajo de lo apartado. */
export function InventoryPage() {
  usePageTitle('Inventario · Sucursal')
  const filters = useUrlFilters()
  const status = (STATUSES.find((s) => s.value === filters.get('estado'))?.value ?? 'todos') as StatusFilter
  const inventory = useInventory({
    q: filters.get('q'),
    status: status === 'todos' ? undefined : status,
    page: filters.page,
  })
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const counts = inventory.data?.counts

  return (
    <>
      <div className={styles.titleRow}>
        <h1>Inventario de la sucursal</h1>
        {inventory.data && <span className={styles.muted}>{inventory.data.store.name}</span>}
      </div>
      <div className={styles.filters}>
        <TextField
          label="Buscar"
          type="search"
          placeholder="Producto, SKU o pasillo"
          value={filters.text}
          onChange={(e) => filters.setText(e.target.value)}
        />
        <BranchPicker />
      </div>
      <ToggleChips
        label="Existencias"
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
      <p className={cx(styles.count, message?.tone === 'error' && styles.countError)} aria-live="polite">
        {message?.text ?? (inventory.data ? plural(inventory.data.total, 'variante') : '')}
      </p>

      {inventory.isError ? (
        <ErrorState title="No pudimos cargar el inventario" onRetry={() => inventory.refetch()} />
      ) : (
        <>
          <DataTable<InventoryRow>
            caption="Inventario"
            loading={inventory.isPending}
            rows={inventory.data?.items ?? []}
            rowKey={(r) => r.sku}
            rowClassName={(r) => (r.status === 'out' ? styles.rowOut : undefined)}
            empty="No hay productos con estos filtros."
            columns={[
              {
                key: 'name',
                header: 'Producto',
                rowHeader: true,
                cell: (r) => (
                  <span className={styles.cellMain}>
                    <strong>{r.name}</strong>
                    <span className={styles.sku}>SKU {r.sku}</span>
                  </span>
                ),
              },
              { key: 'aisle', header: 'Pasillo', cell: (r) => r.aisle },
              {
                key: 'qty',
                header: 'Disponible',
                align: 'end',
                cell: (r) => (
                  <span className={cx(styles.qty, styles[`qty-${r.status}`])}>
                    {r.qty}
                    {r.status !== 'ok' && (
                      <span className={styles.qtyNote}>
                        {r.status === 'out' ? 'Agotado' : 'Pocas piezas'}
                      </span>
                    )}
                  </span>
                ),
              },
              { key: 'reserved', header: 'Apartado', align: 'end', cell: (r) => r.reserved },
              {
                key: 'adjust',
                header: 'Ajuste',
                cell: (r) => <AdjustCell key={`${r.sku}-${r.qty}`} row={r} onDone={setMessage} />,
              },
            ]}
          />
          {inventory.data && (
            <Pagination
              page={inventory.data.page}
              totalPages={Math.ceil(inventory.data.total / inventory.data.page_size)}
            />
          )}
        </>
      )}
      <p className={styles.muted}>
        "Apartado" son piezas reservadas por pedidos pagados que aún no se entregan; no se pueden vender ni
        quitar. Cada ajuste queda registrado con tu nombre y el motivo.
      </p>
    </>
  )
}

/** Ajuste de una fila: −/+ piezas, motivo y guardar. La llave de la fila lo reinicia al cambiar el stock. */
function AdjustCell({
  row,
  onDone,
}: {
  row: InventoryRow
  onDone: (message: { tone: 'ok' | 'error'; text: string }) => void
}) {
  const adjust = useAdjustStock()
  const [delta, setDelta] = useState(0)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState(false)
  const min = row.reserved - row.qty
  const signed = `${delta > 0 ? '+' : ''}${delta}`

  const save = async () => {
    if (!reason) return setReasonError(true)
    try {
      await adjust.mutateAsync({ sku: row.sku, delta, reason })
      onDone({
        tone: 'ok',
        text: `Guardamos el ajuste de ${row.name}: ${signed} ${delta === 1 || delta === -1 ? 'pieza' : 'piezas'}.`,
      })
    } catch (e) {
      onDone({ tone: 'error', text: e instanceof ApiError ? e.message : 'No pudimos guardar el ajuste.' })
    }
  }

  return (
    <div className={styles.adjust}>
      <div role="group" aria-label={`Ajuste de ${row.name}`} className={styles.stepper}>
        <button
          type="button"
          className={styles.stepBtn}
          aria-label="Restar una pieza"
          disabled={delta <= min}
          onClick={() => setDelta((d) => d - 1)}
        >
          −
        </button>
        <output className={styles.delta} aria-live="polite">
          {signed}
        </output>
        <button
          type="button"
          className={styles.stepBtn}
          aria-label="Sumar una pieza"
          onClick={() => setDelta((d) => d + 1)}
        >
          +
        </button>
      </div>
      {delta !== 0 && (
        <>
          <select
            className={styles.reason}
            aria-label={`Motivo del ajuste de ${row.name}`}
            aria-invalid={reasonError || undefined}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              setReasonError(false)
            }}
          >
            <option value="">Motivo…</option>
            {ADJUST_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={save}
            loading={adjust.isPending}
            aria-label={`Guardar ajuste de ${row.name}`}
          >
            Guardar
          </Button>
          {reasonError && (
            <span role="alert" className={styles.inlineError}>
              Elige el motivo.
            </span>
          )}
        </>
      )}
    </div>
  )
}
