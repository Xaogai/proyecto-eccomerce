import { cx } from '@/lib/cx'
import { formatMoney } from '@/lib/format'
import styles from './Price.module.css'

interface PriceProps {
  /** Centavos MXN */
  amount: number
  size?: 'tarjeta' | 'ficha' | 'linea'
  /** Precio anterior tachado */
  before?: number
  /** "Desde $1,299" cuando hay variantes con distinto precio */
  from?: boolean
  className?: string
}

export function Price({ amount, size = 'tarjeta', before, from, className }: PriceProps) {
  return (
    <span className={cx(styles.wrap, className)}>
      {from && <span className={styles.from}>Desde </span>}
      <span className={cx(styles.price, styles[size])}>{formatMoney(amount)}</span>
      {before !== undefined && before > amount && (
        <s className={styles.before}>
          <span className="sr-only">Antes</span> {formatMoney(before)}
        </s>
      )}
    </span>
  )
}
