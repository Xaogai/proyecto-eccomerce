import { Link } from 'react-router-dom'
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/States'
import { StockLabel } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Price } from '@/components/ui/Price'
import { useWishlist, useToggleWishlist } from '@/features/account/wishlist'
import { useAddToCart } from '@/features/cart/api'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatMoney, plural } from '@/lib/format'
import styles from './account.module.css'

/** Lista de deseos (pantallas 34 y 44). */
export function WishlistPage() {
  usePageTitle('Lista de deseos')
  const list = useWishlist()
  const toggle = useToggleWishlist()
  const addToCart = useAddToCart()

  return (
    <>
      <h1>Lista de deseos</h1>
      <p className={styles.muted} aria-live="polite">
        {list.data ? plural(list.data.length, 'producto guardado', 'productos guardados') : ''}
      </p>

      {list.isError ? (
        <ErrorState title="No pudimos cargar tu lista" onRetry={() => list.refetch()} />
      ) : list.isPending ? (
        <Skeleton height={160} />
      ) : list.data.length === 0 ? (
        <EmptyState title="Tu lista está vacía" actions={<ButtonLink to="/">Explorar productos</ButtonLink>}>
          Guarda productos desde su ficha con "Guardar en lista de deseos".
        </EmptyState>
      ) : (
        <ul role="list" className={styles.list}>
          {list.data.map((p) => {
            const dropped = p.saved_price && p.saved_price > p.price
            const canAdd = p.variant_count === 1 && p.stock.status !== 'out'
            return (
              <li key={p.sku}>
                <article className={styles.wishCard}>
                  <img src={p.image.url} alt={p.image.alt} width={96} height={72} />
                  <div className={styles.wishInfo}>
                    <h2 className={styles.rowTitle}>
                      <Link to={`/producto/${p.sku}`}>{p.name}</Link>
                    </h2>
                    <div className={styles.priceRow}>
                      <Price amount={p.price} size="linea" before={dropped ? p.saved_price : undefined} />
                      {dropped && (
                        <span className={styles.drop}>Bajó {formatMoney(p.saved_price! - p.price)}</span>
                      )}
                    </div>
                    <StockLabel status={p.stock.status}>{p.stock.label}</StockLabel>
                    <div className={styles.actions}>
                      {canAdd ? (
                        <Button
                          size="sm"
                          loading={addToCart.isPending && addToCart.variables?.sku === p.variant_sku}
                          onClick={() => addToCart.mutate({ sku: p.variant_sku, qty: 1, name: p.name })}
                        >
                          Agregar al carrito
                        </Button>
                      ) : (
                        <ButtonLink to={`/producto/${p.sku}`} size="sm" variant="secondary">
                          {p.variant_count > 1 ? 'Elegir variante' : 'Ver opciones de entrega'}
                        </ButtonLink>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => toggle.toggle(p.sku)}>
                        Quitar de la lista <span className="sr-only">{p.name}</span>
                      </Button>
                    </div>
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
