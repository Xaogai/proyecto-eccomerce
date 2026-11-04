import { useState } from 'react'
import { ApiError } from '@/api/errors'
import type { Pickup } from '@/api/schemas/branch'
import { ErrorState, Skeleton } from '@/components/feedback/States'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { usePickups, usePickupStatus } from '@/features/branch/api'
import { BranchPicker } from '@/features/branch/BranchPicker'
import { usePageTitle } from '@/hooks/usePageTitle'
import { cx } from '@/lib/cx'
import { formatDateTime, plural } from '@/lib/format'
import styles from './branch.module.css'

const hour = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })

/** "hace 25 min", "hace 1 h 10 min" */
function ago(iso: string, now: number) {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000))
  if (min < 60) return `hace ${min} min`
  if (min < 24 * 60) return `hace ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`
  return `el ${formatDateTime(iso)}`
}

/** Pedidos para recoger (pantalla 58): por preparar, listos y entregados hoy. Se actualiza solo. */
export function PickupsPage() {
  usePageTitle('Pedidos para recoger · Sucursal')
  const board = usePickups()
  const status = usePickupStatus()
  const [message, setMessage] = useState('')
  // La hora de la última consulta: los "hace X min" se recalculan con cada actualización.
  const now = board.dataUpdatedAt

  const move = async (p: Pickup, to: 'en_preparacion' | 'listo_para_recoger') => {
    try {
      await status.mutateAsync({ id: p.id, to })
      setMessage(
        to === 'listo_para_recoger'
          ? `Pedido ${p.folio} listo. Enviamos aviso a ${p.customer}.`
          : `Pedido ${p.folio} en preparación.`,
      )
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'No pudimos cambiar el pedido.')
    }
  }

  const columns = board.data
    ? [
        { key: 'prep', title: 'Por preparar', items: board.data.to_prepare },
        { key: 'ready', title: 'Listos para recoger', items: board.data.ready },
        { key: 'done', title: 'Entregados hoy', items: board.data.delivered_today },
      ]
    : []

  return (
    <>
      <div className={styles.titleRow}>
        <h1>Pedidos para recoger</h1>
        {board.data && <span className={styles.muted}>{board.data.store.name}</span>}
      </div>
      <div className={styles.filters}>
        <BranchPicker />
      </div>
      <p className={styles.count} aria-live="polite">
        {message ||
          (board.data
            ? `${plural(board.data.to_prepare.length, 'pedido')} por preparar y ${board.data.ready.length} ${board.data.ready.length === 1 ? 'listo' : 'listos'}`
            : '')}
      </p>

      {board.isError ? (
        <ErrorState title="No pudimos cargar los pedidos" onRetry={() => board.refetch()} />
      ) : board.isPending ? (
        <Skeleton height={320} />
      ) : (
        <div className={styles.board}>
          {columns.map((c) => (
            <section key={c.key} aria-labelledby={`col-${c.key}`} className={styles.column}>
              <h2 id={`col-${c.key}`} className={styles.columnTitle}>
                {c.title} <span className={styles.columnCount}>{c.items.length}</span>
              </h2>
              {c.items.length === 0 ? (
                <p className={styles.muted}>Sin pedidos aquí.</p>
              ) : (
                <ul role="list" className={styles.cards}>
                  {c.items.map((p) => (
                    <li key={p.id}>
                      <article className={cx(styles.pickup, p.late && styles.late)}>
                        <div className={styles.pickupHead}>
                          <h3 className={styles.pickupTitle}>Pedido {p.folio}</h3>
                          {p.late ? <Badge tone="error">Atrasado</Badge> : <StatusBadge status={p.status} />}
                        </div>
                        <span className={cx(styles.muted, p.late && styles.lateText)}>
                          {p.delivered_at
                            ? `Entregado ${hour.format(new Date(p.delivered_at))}`
                            : p.ready_at
                              ? `Listo desde ${hour.format(new Date(p.ready_at))}`
                              : `Pagado ${ago(p.paid_at, now)}`}
                        </span>
                        <span>{p.customer}</span>
                        <span className={styles.muted}>
                          {plural(p.item_count, 'producto')}
                          {p.location && ` · ${p.location}`}
                        </span>
                        {p.allowed_transitions.includes('en_preparacion') && (
                          <Button
                            variant="outline"
                            size="sm"
                            loading={status.isPending && status.variables?.id === p.id}
                            onClick={() => move(p, 'en_preparacion')}
                            aria-label={`Empezar a preparar el pedido ${p.folio}`}
                          >
                            Empezar a preparar
                          </Button>
                        )}
                        {p.allowed_transitions.includes('listo_para_recoger') && (
                          <Button
                            size="sm"
                            loading={status.isPending && status.variables?.id === p.id}
                            onClick={() => move(p, 'listo_para_recoger')}
                            aria-label={`Marcar listo y avisar al cliente, pedido ${p.folio}`}
                          >
                            Marcar listo y avisar al cliente
                          </Button>
                        )}
                        {p.status === 'listo_para_recoger' && (
                          <ButtonLink
                            to={`/sucursal/entrega/${p.id}`}
                            size="sm"
                            aria-label={`Entregar el pedido ${p.folio}`}
                          >
                            Entregar
                          </ButtonLink>
                        )}
                      </article>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  )
}
