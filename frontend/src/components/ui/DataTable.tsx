import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'
import styles from './DataTable.module.css'

export interface Column<T> {
  key: string
  header: ReactNode
  cell: (row: T) => ReactNode
  /** Si se puede ordenar por esta columna */
  sortable?: boolean
  align?: 'start' | 'end'
  /** La celda de esta columna es el encabezado de la fila (th scope="row") */
  rowHeader?: boolean
}

export interface SortState {
  key: string
  dir: 'asc' | 'desc'
}

interface DataTableProps<T> {
  caption: string
  /** Mostrar el caption (por defecto solo para lectores de pantalla) */
  showCaption?: boolean
  columns: Array<Column<T>>
  rows: T[]
  rowKey: (row: T) => string
  sort?: SortState
  onSortChange?: (sort: SortState) => void
  loading?: boolean
  empty?: ReactNode
  rowClassName?: (row: T) => string | undefined
}

/**
 * Tabla semántica (th scope, aria-sort). En pantallas angostas hace scroll horizontal
 * dentro de una región con foco y nombre, para que se pueda recorrer con teclado.
 */
export function DataTable<T>({
  caption,
  showCaption,
  columns,
  rows,
  rowKey,
  sort,
  onSortChange,
  loading,
  empty = 'No hay resultados.',
  rowClassName,
}: DataTableProps<T>) {
  return (
    <div className={styles.scroll} role="region" aria-label={caption} tabIndex={0}>
      <table className={styles.table} aria-busy={loading || undefined}>
        <caption className={showCaption ? styles.caption : 'sr-only'}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key
              const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : c.sortable ? 'none' : undefined
              return (
                <th key={c.key} scope="col" aria-sort={ariaSort} className={cx(c.align === 'end' && styles.end)}>
                  {c.sortable && onSortChange ? (
                    <button
                      type="button"
                      className={styles.sortBtn}
                      onClick={() => onSortChange({ key: c.key, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}
                    >
                      {c.header}
                      <span aria-hidden="true">{active ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ' ↕'}</span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 5 }, (_, i) => (
              <tr key={`sk-${i}`} aria-hidden="true">
                {columns.map((c) => (
                  <td key={c.key}>
                    <span className={styles.skeleton} />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className={rowClassName?.(row)}>
                {columns.map((c) => {
                  const Cell = c.rowHeader ? 'th' : 'td'
                  return (
                    <Cell key={c.key} scope={c.rowHeader ? 'row' : undefined} className={cx(c.align === 'end' && styles.end)}>
                      {c.cell(row)}
                    </Cell>
                  )
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
