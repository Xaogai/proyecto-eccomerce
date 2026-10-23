import { useId } from 'react'
import { cx } from '@/lib/cx'
import styles from './StarRating.module.css'

const STAR = 'M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.5l1.3-6.6L2.5 9.3l6.6-.8z'

function Star({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={STAR}
        className={cx(styles.star, filled && styles.filled)}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Calificación de solo lectura: "4.5 de 5 estrellas, 128 reseñas". */
export function StarRatingDisplay({ value, count }: { value: number; count?: number }) {
  const rounded = Math.round(value)
  return (
    <span className={styles.display}>
      <span className="sr-only">
        {value.toFixed(1)} de 5 estrellas{count !== undefined && `, ${count} reseñas`}
      </span>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} filled={n <= rounded} size={16} />
      ))}
      {count !== undefined && (
        <span className={styles.count} aria-hidden="true">
          ({count})
        </span>
      )}
    </span>
  )
}

const WORDS = ['Muy malo', 'Malo', 'Regular', 'Bueno', 'Excelente']

interface StarRatingInputProps {
  value: number
  onChange: (value: number) => void
  legend?: string
  error?: string
}

/** Calificación editable como grupo de radios (pantalla 37): flechas cambian el valor. */
export function StarRatingInput({
  value,
  onChange,
  legend = 'Tu calificación',
  error,
}: StarRatingInputProps) {
  const name = useId()
  return (
    <fieldset className={styles.fieldset} aria-describedby={error ? `${name}-err` : undefined}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.inputs}>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} className={styles.option}>
            <input
              type="radio"
              name={name}
              value={n}
              checked={value === n}
              onChange={() => onChange(n)}
              className="sr-only"
            />
            <Star filled={n <= value} size={34} />
            <span className="sr-only">
              {n} de 5 estrellas, {WORDS[n - 1]}
            </span>
          </label>
        ))}
        {value > 0 && (
          <span className={styles.word} aria-hidden="true">
            {WORDS[value - 1]}
          </span>
        )}
      </div>
      {error && (
        <span id={`${name}-err`} className={styles.error}>
          {error}
        </span>
      )}
    </fieldset>
  )
}
