import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ErrorState, Skeleton } from '@/components/feedback/States'
import { Badge } from '@/components/ui/Badge'
import { useDashboard } from '@/features/admin/api'
import { BarChart } from '@/features/admin/BarChart'
import { usePageTitle } from '@/hooks/usePageTitle'
import { cx } from '@/lib/cx'
import { formatMoney } from '@/lib/format'
import styles from './admin.module.css'

const SEVERITY = {
  alta: { label: 'Alta', tone: 'error' },
  media: { label: 'Media', tone: 'aviso' },
  baja: { label: 'Baja', tone: 'neutro' },
} as const

const weekday = new Intl.DateTimeFormat('es-MX', { weekday: 'short' })
const today = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })

const dayLabel = (iso: string, last: boolean) => {
  if (last) return 'Hoy'
  const s = weekday.format(new Date(iso)).replace('.', '')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** "48.3": miles de pesos con un decimal, como en el prototipo. */
const thousands = (centavos: number) =>
  (centavos / 100_000).toLocaleString('es-MX', { maximumFractionDigits: 1 })

/** Resumen (pantalla 48): indicadores del día, alertas y ventas de los últimos 7 días. */
export function DashboardPage() {
  usePageTitle('Resumen · Administración')
  const dashboard = useDashboard()
  const [date] = useState(() => today.format(new Date()))

  return (
    <>
      <div className={styles.titleRow}>
        <h1>Resumen de hoy</h1>
        <span className={styles.muted}>{date.charAt(0).toUpperCase() + date.slice(1)}</span>
      </div>

      {dashboard.isError ? (
        <ErrorState title="No pudimos cargar el resumen" onRetry={() => dashboard.refetch()} />
      ) : dashboard.isPending ? (
        <Skeleton height={320} />
      ) : (
        <>
          <ul role="list" className={styles.kpis}>
            {dashboard.data.kpis.map((k) => (
              <li key={k.key} style={{ display: 'contents' }}>
                <Link to={k.link} className={cx(styles.kpi, styles[`kpi-${k.tone}`])}>
                  <span className={styles.kpiLabel}>{k.label}</span>
                  <span className={styles.kpiValue}>
                    {k.unit === 'money' ? formatMoney(k.value) : k.value}
                  </span>
                  <span className={styles.kpiNote}>{k.note}</span>
                </Link>
              </li>
            ))}
          </ul>

          <div className={cx(styles.columns, styles.columnsWide)}>
            <section aria-labelledby="atencion" className={styles.card}>
              <h2 id="atencion">Requiere atención</h2>
              {dashboard.data.alerts.length === 0 ? (
                <p className={styles.muted}>Todo en orden por ahora.</p>
              ) : (
                <ul role="list" className={styles.alerts}>
                  {dashboard.data.alerts.map((a) => (
                    <li key={a.title}>
                      <Link to={a.link} className={styles.alert}>
                        <Badge tone={SEVERITY[a.severity].tone} className={styles.sev}>
                          <span className="sr-only">Prioridad </span>
                          {SEVERITY[a.severity].label}
                        </Badge>
                        <span>
                          <span className={styles.alertTitle}>{a.title}</span>
                          <span className={styles.muted}>{a.detail}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="ventas" className={styles.card}>
              <div className={styles.cardHead}>
                <h2 id="ventas">Ventas, últimos 7 días</h2>
                <Link to="/admin/reportes">Reportes</Link>
              </div>
              <BarChart
                caption="Ventas por día"
                labelHeader="Día"
                valueHeader="Ventas"
                format={formatMoney}
                short={thousands}
                bars={dashboard.data.sales_by_day.map((d, i, all) => ({
                  label: dayLabel(d.date, i === all.length - 1),
                  value: d.total,
                  highlight: i === all.length - 1,
                }))}
              />
              <p className={styles.muted}>Miles de pesos MXN. Hoy va al corte de las 20:00.</p>
            </section>
          </div>
        </>
      )}
    </>
  )
}
