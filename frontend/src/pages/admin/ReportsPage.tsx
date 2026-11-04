import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError } from '@/api/errors'
import { ErrorState, Skeleton } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/toastContext'
import { Button } from '@/components/ui/Button'
import { ToggleChips } from '@/components/ui/Chip'
import { DataTable } from '@/components/ui/DataTable'
import { downloadReportCsv, useReport } from '@/features/admin/api'
import { BarChart } from '@/features/admin/BarChart'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatDate, formatMoney } from '@/lib/format'
import styles from './admin.module.css'

const PERIODS = [
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: '90d', label: 'Trimestre' },
] as const
type Period = (typeof PERIODS)[number]['value']

const num = (n: number) => n.toLocaleString('es-MX')

/** Reportes (pantalla 55): indicadores por periodo, ventas por departamento, inventario por sucursal y CSV. */
export function ReportsPage() {
  usePageTitle('Reportes · Administración')
  const [params, setParams] = useSearchParams()
  const period = (PERIODS.find((p) => p.value === params.get('periodo'))?.value ?? '7d') as Period
  const report = useReport(period)
  const { toast } = useToast()
  const [exporting, setExporting] = useState(false)

  return (
    <>
      <div className={styles.titleRow}>
        <h1>Reportes</h1>
        <div className={styles.actions}>
          <ToggleChips
            label="Periodo"
            value={period}
            options={[...PERIODS]}
            onChange={(v) => setParams(v === '7d' ? {} : { periodo: v }, { replace: true, flushSync: true })}
          />
          <Button
            variant="outline"
            loading={exporting}
            onClick={async () => {
              setExporting(true)
              try {
                await downloadReportCsv(period)
                toast('Descargamos el reporte en CSV', 'ok')
              } catch (e) {
                toast(e instanceof ApiError ? e.message : 'No pudimos descargar el reporte', 'error')
              } finally {
                setExporting(false)
              }
            }}
          >
            Exportar CSV
          </Button>
        </div>
      </div>
      <span className={styles.muted} aria-live="polite">
        {report.data ? `Del ${formatDate(report.data.from)} al ${formatDate(report.data.to)}` : ''}
      </span>

      {report.isError ? (
        <ErrorState title="No pudimos cargar el reporte" onRetry={() => report.refetch()} />
      ) : report.isPending ? (
        <Skeleton height={360} />
      ) : (
        <>
          <ul role="list" className={styles.kpis}>
            {report.data.kpis.map((k) => (
              <li key={k.key} className={styles.kpi}>
                <span className={styles.kpiLabel}>{k.label}</span>
                <span className={styles.kpiValue}>
                  {k.unit === 'money' ? formatMoney(k.value) : num(k.value)}
                </span>
                <span className={styles.kpiNote}>{k.note}</span>
              </li>
            ))}
          </ul>

          <section aria-labelledby="departamentos" className={styles.card}>
            <h2 id="departamentos">Ventas por departamento</h2>
            {report.data.by_category.length === 0 ? (
              <p className={styles.muted}>Sin ventas en este periodo.</p>
            ) : (
              <BarChart
                orientation="horizontal"
                caption="Ventas por departamento"
                labelHeader="Departamento"
                valueHeader="Ventas"
                format={formatMoney}
                bars={report.data.by_category.map((c, i) => ({
                  label: c.name,
                  value: c.total,
                  highlight: i === 0,
                }))}
              />
            )}
          </section>

          <section aria-labelledby="inventario" className={styles.card}>
            <h2 id="inventario">Inventario por sucursal</h2>
            <DataTable
              caption="Inventario por sucursal"
              rows={report.data.branches}
              rowKey={(b) => b.store}
              columns={[
                { key: 'store', header: 'Sucursal', cell: (b) => b.store, rowHeader: true },
                { key: 'pieces', header: 'Piezas', cell: (b) => num(b.pieces), align: 'end' },
                { key: 'reserved', header: 'Reservadas', cell: (b) => num(b.reserved), align: 'end' },
                { key: 'out', header: 'Variantes agotadas', cell: (b) => num(b.out_of_stock), align: 'end' },
                {
                  key: 'pickup',
                  header: 'Pedidos de recolección',
                  cell: (b) => num(b.pickup_orders),
                  align: 'end',
                },
              ]}
            />
          </section>
        </>
      )}
    </>
  )
}
