import { useState } from 'react'
import { DataTable } from '@/components/ui/DataTable'
import { cx } from '@/lib/cx'
import styles from './BarChart.module.css'

export interface Bar {
  label: string
  value: number
  /** Barra resaltada en naranja (hoy, el departamento que más vende) */
  highlight?: boolean
}

interface BarChartProps {
  /** Nombre de la serie: título de la tabla y del resumen para lectores de pantalla */
  caption: string
  bars: Bar[]
  /** Valor completo ("$48,320") para la tabla y el aviso al pasar el puntero */
  format: (n: number) => string
  /** Etiqueta corta sobre la barra ("48.3"); por defecto, la completa */
  short?: (n: number) => string
  orientation?: 'vertical' | 'horizontal'
  /** Encabezado de la columna de etiquetas en la vista de tabla */
  labelHeader: string
  valueHeader: string
}

/**
 * Gráfica de barras de una sola serie (pantallas 48 y 55): el título la nombra, así que no lleva leyenda.
 * Cada barra lleva su valor escrito; la gráfica se resume en aria-label y hay vista de tabla.
 */
export function BarChart({
  caption,
  bars,
  format,
  short = format,
  orientation = 'vertical',
  labelHeader,
  valueHeader,
}: BarChartProps) {
  const [asTable, setAsTable] = useState(false)
  const max = Math.max(1, ...bars.map((b) => b.value))
  const summary = `${caption}: ${bars.map((b) => `${b.label} ${format(b.value)}`).join(', ')}`

  return (
    <div className={styles.wrap}>
      <button
        type="button"
        className={styles.toggle}
        aria-pressed={asTable}
        onClick={() => setAsTable((v) => !v)}
      >
        Ver como tabla
      </button>
      {asTable ? (
        <DataTable
          caption={caption}
          columns={[
            { key: 'label', header: labelHeader, cell: (b) => b.label, rowHeader: true },
            { key: 'value', header: valueHeader, cell: (b) => format(b.value), align: 'end' },
          ]}
          rows={bars}
          rowKey={(b) => b.label}
        />
      ) : orientation === 'vertical' ? (
        <div role="img" aria-label={summary} className={styles.vertical}>
          {bars.map((b) => (
            <div key={b.label} className={styles.col}>
              <span className={styles.value} aria-hidden="true">
                {short(b.value)}
              </span>
              <span className={styles.track} aria-hidden="true">
                <span
                  className={cx(styles.bar, b.highlight && styles.highlight)}
                  style={{ height: `${(b.value / max) * 100}%` }}
                  data-tip={`${b.label}: ${format(b.value)}`}
                />
              </span>
              <span className={styles.label} aria-hidden="true">
                {b.label}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div role="img" aria-label={summary} className={styles.horizontal}>
          {bars.map((b) => (
            <div key={b.label} className={styles.row} aria-hidden="true">
              <span className={styles.rowLabel}>{b.label}</span>
              <span className={styles.rowTrack}>
                <span
                  className={cx(styles.bar, b.highlight && styles.highlight)}
                  style={{ width: `${(b.value / max) * 100}%` }}
                  data-tip={`${b.label}: ${format(b.value)}`}
                />
              </span>
              <span className={styles.rowValue}>{short(b.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
