import { Link } from 'react-router-dom'
import type { CartItem } from '@/api/schemas/cart'
import { useSelectedStore } from '@/app/providers/storeContext'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/feedback/States'
import { Button, ButtonLink } from '@/components/ui/Button'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { useCart, useDeliveryMode, useRemoveCartItem, useUpdateCartItem } from '@/features/cart/api'
import { usePageTitle } from '@/hooks/usePageTitle'
import { cx } from '@/lib/cx'
import { formatDate, formatMoney, plural } from '@/lib/format'
import styles from './checkout.module.css'

/** Carrito (pantallas 04 y 11; HU-04). No hace falta cuenta para comprar. */
export function CartPage() {
  usePageTitle('Carrito')
  const { store } = useSelectedStore()
  const cart = useCart()
  const update = useUpdateCartItem()
  const remove = useRemoveCartItem()
  const [mode, setMode] = useDeliveryMode()

  if (cart.isPending) return <PageSkeleton label="Cargando tu carrito" />
  if (cart.isError || !cart.data) {
    return <ErrorState headingLevel={1} title="No pudimos cargar tu carrito" onRetry={() => cart.refetch()} />
  }

  const items = cart.data.items
  if (items.length === 0) {
    return (
      <EmptyState
        headingLevel={1}
        title="Tu carrito está vacío"
        actions={
          <>
            <ButtonLink to="/">Ir al inicio</ButtonLink>
            <ButtonLink to="/departamentos" variant="outline">
              Ver departamentos
            </ButtonLink>
          </>
        }
      >
        Agrega productos para verlos aquí. No necesitas cuenta para comprar.
      </EmptyState>
    )
  }

  // Si se recoge en tienda, lo agotado en la sucursal no se suma (Escritorio-3-Carrito).
  const unavailable = (i: CartItem) => mode === 'recoger' && !!i.store_stock && i.store_stock.qty < i.qty
  const counted = items.filter((i) => !unavailable(i))
  const pieces = counted.reduce((n, i) => n + i.qty, 0)
  const subtotal = counted.reduce((n, i) => n + i.unit_price * i.qty, 0)
  const validUntil = items.map((i) => i.price_valid_until).sort()[0]

  return (
    <>
      <div className={styles.titleRow}>
        <h1>Carrito ({pieces})</h1>
        <span className={styles.muted}>No necesitas cuenta para comprar</span>
      </div>

      <div className={styles.columns}>
        <section aria-label="Productos en el carrito" className={styles.main}>
          <ul role="list" className={styles.items}>
            {items.map((item) => {
              const out = unavailable(item)
              return (
                <li key={item.id}>
                  <article
                    className={cx(styles.item, out && styles.itemOut)}
                    aria-busy={update.isPending || undefined}
                  >
                    <img
                      src={item.image.url}
                      alt={item.image.alt}
                      width={96}
                      height={72}
                      className={styles.itemImg}
                    />
                    <div className={styles.itemInfo}>
                      <h2 className={styles.itemName}>
                        <Link to={`/producto/${item.product_sku}`}>{item.name}</Link>
                      </h2>
                      <span className={styles.muted}>
                        {item.variant_label !== 'Única' && `${item.variant_label} · `}SKU {item.sku} ·{' '}
                        {formatMoney(item.unit_price)} c/u
                      </span>
                      <ItemNote item={item} out={out} storeName={store?.name} mode={mode} />
                      {out && (
                        <div className={styles.inlineActions}>
                          <Button variant="outline" size="sm" onClick={() => setMode('envio')}>
                            Cambiar a envío a domicilio
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => remove.mutate({ id: item.id, name: item.name })}
                          >
                            Eliminar
                          </Button>
                        </div>
                      )}
                    </div>
                    {!out && (
                      <div className={styles.itemSide}>
                        <span className={styles.lineTotal}>{formatMoney(item.unit_price * item.qty)}</span>
                        <QuantityStepper
                          value={item.qty}
                          max={item.max_qty}
                          itemName={item.name}
                          disabled={update.isPending && update.variables?.id === item.id}
                          onChange={(qty) => qty !== item.qty && update.mutate({ id: item.id, qty })}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => remove.mutate({ id: item.id, name: item.name })}
                        >
                          Eliminar <span className="sr-only">{item.name}</span>
                        </Button>
                      </div>
                    )}
                  </article>
                </li>
              )
            })}
          </ul>
          <p className={styles.muted}>
            Precios vigentes hasta el {formatDate(validUntil)}. Si un precio cambia antes de pagar, te
            avisamos en el checkout.
          </p>
        </section>

        <aside aria-labelledby="resumen" className={styles.summary}>
          <h2 id="resumen" className={styles.summaryTitle}>
            Resumen
          </h2>
          <dl className={styles.totals}>
            <div>
              <dt>Subtotal ({plural(pieces, 'producto')})</dt>
              <dd>{formatMoney(subtotal)}</dd>
            </div>
            <div>
              <dt>{mode === 'envio' ? 'Envío a domicilio' : 'Envío o recolección'}</dt>
              <dd>Se calcula en el checkout</dd>
            </div>
            <div className={styles.totalRow}>
              <dt>Total estimado</dt>
              <dd aria-live="polite">{formatMoney(subtotal)}</dd>
            </div>
          </dl>
          {pieces > 0 ? (
            <ButtonLink to="/checkout" size="lg" fullWidth>
              Continuar al pago
            </ButtonLink>
          ) : (
            <Button size="lg" fullWidth disabled>
              Continuar al pago
            </Button>
          )}
          {mode === 'envio' && store && (
            <Button variant="ghost" size="sm" onClick={() => setMode('recoger')}>
              Mejor recoger en {store.name}
            </Button>
          )}
          <ButtonLink to="/" variant="outline" fullWidth>
            Seguir comprando
          </ButtonLink>
          <p className={styles.muted}>
            Recoger en tienda es gratis. El envío a domicilio se calcula con tu código postal.
          </p>
        </aside>
      </div>
    </>
  )
}

function ItemNote({
  item,
  out,
  storeName,
  mode,
}: {
  item: CartItem
  out: boolean
  storeName?: string
  mode: string
}) {
  if (out) {
    return (
      <span className={styles.noteError}>
        {item.store_stock?.qty
          ? `Solo hay ${item.store_stock.qty} en ${storeName}.`
          : `Agotado en ${storeName}.`}{' '}
        No se suma al total.
      </span>
    )
  }
  if (mode === 'envio') return <span className={styles.noteOk}>Con envío a domicilio</span>
  if (item.store_stock && storeName) {
    return (
      <span className={item.store_stock.status === 'low' ? styles.noteWarn : styles.noteOk}>
        {item.store_stock.status === 'low'
          ? `Quedan ${item.store_stock.qty}`
          : `${item.store_stock.qty} disponibles`}{' '}
        en {storeName}
      </span>
    )
  }
  return null
}
