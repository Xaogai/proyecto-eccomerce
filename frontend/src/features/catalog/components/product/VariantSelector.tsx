import type { Variant } from '@/api/schemas/catalog'
import { cx } from '@/lib/cx'
import { formatMoney } from '@/lib/format'
import styles from './product.module.css'

interface VariantSelectorProps {
  variants: Variant[]
  value: string
  onChange: (sku: string) => void
}

/** "Elige la versión" (HU-02): cada opción muestra nombre, SKU y precio; al elegir cambian precio, SKU y stock. */
export function VariantSelector({ variants, value, onChange }: VariantSelectorProps) {
  if (variants.length < 2) return null
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Elige la versión</legend>
      <div className={styles.cards}>
        {variants.map((v) => (
          <label key={v.sku} className={cx(styles.cardOption, v.sku === value && styles.cardSelected)}>
            <input type="radio" name="variante" checked={v.sku === value} onChange={() => onChange(v.sku)} />
            <span className={styles.cardText}>
              <span className={styles.cardTitle}>{v.label}</span>
              <span className={styles.cardDetail}>
                SKU {v.sku}
                {v.stock.status === 'out' && ' · Agotado aquí'}
              </span>
            </span>
            <span className={styles.cardPrice}>{formatMoney(v.price)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
