import { Link } from 'react-router-dom'
import type { ProductSummary } from '@/api/schemas/catalog'
import { StockLabel } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Price } from '@/components/ui/Price'
import { useAddToCart } from '@/features/cart/api'
import { plural } from '@/lib/format'
import styles from './ProductCard.module.css'

interface ProductCardProps {
  product: ProductSummary
  /** "completa" (listado) o "simple" (inicio: solo "Ver producto") */
  variant?: 'completa' | 'simple'
}

/**
 * Tarjeta de producto (prototipo Escritorio-1-Listado). La acción depende del producto:
 * varias variantes → "Elegir variante"; agotado en la sucursal → "Ver envío a domicilio";
 * en otro caso → "Agregar al carrito".
 */
export function ProductCard({ product, variant = 'completa' }: ProductCardProps) {
  const addToCart = useAddToCart()
  const to = `/producto/${product.sku}`

  let action = (
    <Button
      fullWidth
      loading={addToCart.isPending}
      onClick={() => addToCart.mutate({ sku: product.variant_sku, qty: 1, name: product.name })}
      aria-label={`Agregar al carrito: ${product.name}`}
    >
      Agregar al carrito
    </Button>
  )
  if (variant === 'simple') {
    action = (
      <ButtonLink to={to} variant="secondary" fullWidth aria-label={`Ver producto: ${product.name}`}>
        Ver producto
      </ButtonLink>
    )
  } else if (product.variant_count > 1) {
    action = (
      <ButtonLink to={to} variant="secondary" fullWidth aria-label={`Elegir variante: ${product.name}`}>
        Elegir variante
      </ButtonLink>
    )
  } else if (product.stock.status === 'out') {
    action = (
      <ButtonLink to={to} variant="ghost" fullWidth aria-label={`Ver envío a domicilio: ${product.name}`}>
        Ver envío a domicilio
      </ButtonLink>
    )
  }

  return (
    <article className={styles.card}>
      <div className={styles.media}>
        <img
          src={product.image.url}
          alt={product.image.alt}
          loading="lazy"
          width={240}
          height={180}
          className={styles.img}
        />
        {variant === 'completa' && <span className={styles.brand}>{product.brand}</span>}
      </div>
      <div className={styles.body}>
        <h3 className={styles.name}>
          <Link to={to}>{product.name}</Link>
        </h3>
        {variant === 'completa' && (
          <span className={styles.meta}>
            SKU {product.sku} · {plural(product.variant_count, 'variante')}
          </span>
        )}
        <Price amount={product.price} />
        <StockLabel status={product.stock.status}>{product.stock.label}</StockLabel>
        <div className={styles.action}>{action}</div>
      </div>
    </article>
  )
}
