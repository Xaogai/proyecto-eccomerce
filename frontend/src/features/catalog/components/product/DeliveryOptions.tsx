import { Link } from 'react-router-dom'
import type { Variant } from '@/api/schemas/catalog'
import type { SelectedStore } from '@/app/providers/storeContext'
import { StockLabel } from '@/components/ui/Badge'
import { cx } from '@/lib/cx'
import { formatMoney } from '@/lib/format'
import { useShippingQuote } from '../../api'
import { variantStockText } from '../../stock'
import styles from './product.module.css'

export type Delivery = 'recoger' | 'envio'

interface DeliveryOptionsProps {
  variant: Variant
  store: SelectedStore | null
  value: Delivery
  onChange: (value: Delivery) => void
  onPickStore: () => void
}

/**
 * "Cómo recibirlo" (HU-07): recoger en la sucursal elegida (gratis) o envío a domicilio
 * con costo y plazo según el CP (EP-09). La elección final se hace en el checkout.
 */
export function DeliveryOptions({ variant, store, value, onChange, onPickStore }: DeliveryOptionsProps) {
  const quote = useShippingQuote(store?.zip)
  const canPickup = !!store && variant.stock.qty > 0 && variant.stock.status !== 'ship_only'

  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Cómo recibirlo</legend>
      <div className={styles.cards}>
        <label className={cx(styles.cardOption, value === 'recoger' && canPickup && styles.cardSelected)}>
          <input
            type="radio"
            name="entrega"
            checked={value === 'recoger' && canPickup}
            disabled={!canPickup}
            onChange={() => onChange('recoger')}
          />
          <span className={styles.cardText}>
            <span className={styles.cardTitle}>
              {store ? `Recoger en ${store.name}: gratis` : 'Recoger en sucursal: gratis'}
            </span>
            <StockLabel status={variant.stock.status}>{variantStockText(variant, store?.name)}</StockLabel>
            {canPickup && <span className={styles.cardDetail}>Listo en 2 horas</span>}
          </span>
        </label>

        <label className={cx(styles.cardOption, (value === 'envio' || !canPickup) && styles.cardSelected)}>
          <input
            type="radio"
            name="entrega"
            checked={value === 'envio' || !canPickup}
            onChange={() => onChange('envio')}
          />
          <span className={styles.cardText}>
            <span className={styles.cardTitle}>
              {quote.data
                ? quote.data.available
                  ? `Envío a domicilio, CP ${quote.data.zip}: ${formatMoney(quote.data.cost)}`
                  : `Sin envío disponible al CP ${quote.data.zip}`
                : 'Envío a domicilio'}
            </span>
            <span className={styles.cardDetail}>
              {quote.data?.available
                ? `Llega en ${quote.data.eta_min_days} a ${quote.data.eta_max_days} días hábiles`
                : quote.isLoading
                  ? 'Calculando costo de envío…'
                  : 'El costo depende de tu código postal'}
            </span>
          </span>
        </label>
      </div>
      <div className={styles.deliveryLinks}>
        <button type="button" className={styles.linkButton} onClick={onPickStore}>
          {store ? 'Cambiar sucursal o código postal' : 'Elige tu sucursal para ver stock y envío'}
        </button>
        <Link to={`/sucursales?sku=${encodeURIComponent(variant.sku)}`}>Ver otras sucursales con stock</Link>
      </div>
    </fieldset>
  )
}
