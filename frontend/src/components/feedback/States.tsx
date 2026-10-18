import { type ReactNode, useId } from 'react'
import { cx } from '@/lib/cx'
import styles from './States.module.css'

/** Bloque gris de carga. Se oculta a lectores; el anuncio lo da LoadingStatus. */
export function Skeleton({ width, height = 14, className }: { width?: string | number; height?: number; className?: string }) {
  return <span aria-hidden="true" className={cx(styles.skeleton, className)} style={{ width, height }} />
}

/** "Cargando productos" solo para lectores de pantalla. */
export function LoadingStatus({ label = 'Cargando' }: { label?: string }) {
  return (
    <span className="sr-only" role="status">
      {label}
    </span>
  )
}

/** Tarjeta de producto en carga (Escritorio-7-Estados, estado 3). */
export function ProductCardSkeleton() {
  return (
    <div aria-hidden="true" className={styles.cardSkeleton}>
      <span className={styles.cardImage} />
      <Skeleton className={styles.inset} />
      <Skeleton className={styles.inset} width="60%" />
      <Skeleton className={styles.inset} width="40%" height={28} />
      <Skeleton className={styles.inset} height={46} />
    </div>
  )
}

export function PageSkeleton({ label = 'Cargando página' }: { label?: string }) {
  return (
    <div className={styles.page}>
      <LoadingStatus label={label} />
      <Skeleton width="40%" height={40} />
      <Skeleton width="100%" height={16} />
      <Skeleton width="80%" height={16} />
      <Skeleton width="100%" height={180} />
    </div>
  )
}

interface EmptyStateProps {
  title: ReactNode
  children?: ReactNode
  actions?: ReactNode
  headingLevel?: 1 | 2
  icon?: ReactNode
}

/** Sin resultados / lista vacía. */
export function EmptyState({ title, children, actions, headingLevel = 2, icon }: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const
  return (
    <section className={styles.box}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <Heading className={styles.title}>{title}</Heading>
      {children && <div className={styles.text}>{children}</div>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </section>
  )
}

interface ErrorStateProps {
  title?: ReactNode
  children?: ReactNode
  onRetry?: () => void
  actions?: ReactNode
  headingLevel?: 1 | 2
}

/** Error de conexión con "Reintentar" (Escritorio-7-Estados, estado 2). */
export function ErrorState({
  title = 'No pudimos cargar esta información',
  children = 'Revisa tu conexión a internet y vuelve a intentarlo.',
  onRetry,
  actions,
  headingLevel = 2,
}: ErrorStateProps) {
  const Heading = `h${headingLevel}` as const
  return (
    <section role="alert" className={cx(styles.box, styles.error)}>
      <Heading className={styles.title}>{title}</Heading>
      <div className={styles.text}>{children}</div>
      {(onRetry || actions) && (
        <div className={styles.actions}>
          {onRetry && (
            <button type="button" className={styles.retry} onClick={onRetry}>
              Reintentar
            </button>
          )}
          {actions}
        </div>
      )}
    </section>
  )
}

/** Fila de espera del checkout con mucha demanda (flag "queue", sec. 24.3). */
export function QueueState({ position, progress }: { position: number; progress: number }) {
  const titleId = useId()
  return (
    <section className={styles.box} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.title}>
        Hay muchas personas comprando ahora
      </h2>
      <p className={styles.text}>
        Estás en la fila para entrar al checkout. Lugar aproximado: {position}. No cierres esta página; tus productos
        siguen apartados.
      </p>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-label="Avance en la fila"
        className={styles.bar}
      >
        <div className={styles.barFill} style={{ width: `${progress}%` }} />
      </div>
    </section>
  )
}
