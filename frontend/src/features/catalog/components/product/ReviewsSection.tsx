import { useState } from 'react'
import { ButtonLink, Button } from '@/components/ui/Button'
import { LoadingStatus } from '@/components/feedback/States'
import { StarRatingDisplay } from '@/components/ui/StarRating'
import { formatDate } from '@/lib/format'
import { useReviews } from '../../api'
import styles from './product.module.css'

const STEP = 5

/** Reseñas de solo lectura (A12). Escribir una reseña es la pantalla 37, con sesión. */
export function ReviewsSection({ sku, headingId }: { sku: string; headingId?: string }) {
  const [size, setSize] = useState(STEP)
  const { data, isPending, isFetching, isError } = useReviews(sku, size, true)

  if (isPending) return <LoadingStatus label="Cargando reseñas" />
  if (isError || !data) return <p>No pudimos cargar las reseñas.</p>

  return (
    <div className={styles.reviews}>
      <div className={styles.reviewsHeader}>
        {data.summary.count > 0 ? (
          <div className={styles.reviewSummary}>
            <span className={styles.reviewAvg}>{data.summary.avg.toFixed(1)}</span>
            <span>
              <StarRatingDisplay value={data.summary.avg} />
              <span className={styles.cardDetail}>de 5 · {data.summary.count} reseñas</span>
            </span>
          </div>
        ) : (
          <p>Este producto aún no tiene reseñas.</p>
        )}
        <ButtonLink to={`/producto/${sku}/resena`} variant="outline" size="sm" aria-describedby={headingId}>
          Escribir reseña
        </ButtonLink>
      </div>

      <ul role="list" className={styles.reviewList}>
        {data.items.map((r) => (
          <li key={r.id}>
            <article className={styles.review}>
              <h3 className={styles.reviewTitle}>
                <span className="sr-only">{r.rating} de 5 estrellas: </span>
                <span aria-hidden="true">{r.rating} de 5 · </span>
                {r.title}
              </h3>
              <p>{r.body}</p>
              <p className={styles.cardDetail}>
                {r.author}
                {r.verified && ' · Compra verificada'} · {formatDate(r.created_at)}
              </p>
            </article>
          </li>
        ))}
      </ul>

      {data.items.length < data.total && (
        <Button variant="outline" loading={isFetching} onClick={() => setSize((n) => n + STEP)}>
          Ver más reseñas ({data.total - data.items.length} restantes)
        </Button>
      )}
    </div>
  )
}
