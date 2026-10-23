import { type ReactNode, useId, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api/errors'
import { useSelectedStore } from '@/app/providers/storeContext'
import { useFeatureFlag } from '@/app/featureFlags'
import { ErrorState, PageSkeleton } from '@/components/feedback/States'
import { AccordionItem } from '@/components/ui/Accordion'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { Button } from '@/components/ui/Button'
import { QuantityStepper } from '@/components/ui/QuantityStepper'
import { StarRatingDisplay } from '@/components/ui/StarRating'
import { useToggleWishlist } from '@/features/account/wishlist'
import { useAddToCart } from '@/features/cart/api'
import { useProduct } from '@/features/catalog/api'
import { type Delivery, DeliveryOptions } from '@/features/catalog/components/product/DeliveryOptions'
import { ImageGallery } from '@/features/catalog/components/product/ImageGallery'
import { ReviewsSection } from '@/features/catalog/components/product/ReviewsSection'
import { VariantSelector } from '@/features/catalog/components/product/VariantSelector'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatMoney } from '@/lib/format'
import { NotFoundPage } from '../NotFoundPage'
import styles from '@/features/catalog/components/product/product.module.css'

/** Ficha de producto (pantallas 03 y 10; HU-02 y HU-07). La vista 360° llega en la fase 4. */
export function ProductPage() {
  const { sku = '' } = useParams()
  const { store, openPicker } = useSelectedStore()
  const product = useProduct(sku, store?.id ?? null)
  const desktop = useMediaQuery('menu')
  const reviewsOn = useFeatureFlag('rev')
  const calcOn = useFeatureFlag('calc')
  const addToCart = useAddToCart()
  const wishlist = useToggleWishlist()
  const specsId = useId()

  const data = product.data
  const [picked, setPicked] = useState<string>()
  const [delivery, setDelivery] = useState<Delivery>('recoger')
  const [qty, setQty] = useState(1)
  usePageTitle(data?.name)

  if (product.isPending) return <PageSkeleton label="Cargando producto" />
  if (product.error instanceof ApiError && product.error.status === 404) return <NotFoundPage />
  if (!data) {
    return (
      <ErrorState headingLevel={1} title="No pudimos cargar el producto" onRetry={() => product.refetch()} />
    )
  }

  // Por defecto, la primera variante con stock en la sucursal.
  const variant =
    data.variants.find((v) => v.sku === picked) ??
    data.variants.find((v) => v.stock.qty > 0) ??
    data.variants[0]
  const maxQty = Math.max(1, Math.min(99, variant.stock.qty || 99))
  const saved = wishlist.isSaved(data.sku)

  const add = () => addToCart.mutate({ sku: variant.sku, qty: Math.min(qty, maxQty), name: data.name })

  const purchase = (
    <div className={styles.buyRow}>
      <QuantityStepper value={Math.min(qty, maxQty)} onChange={setQty} max={maxQty} itemName={data.name} />
      <Button size="lg" className={styles.buyButton} onClick={add} loading={addToCart.isPending}>
        Agregar al carrito
      </Button>
    </div>
  )

  const section = (title: string, content: ReactNode, open = true) =>
    desktop ? (
      <section className={styles.block} aria-labelledby={`${specsId}-${title.toLowerCase()}`}>
        <h2 id={`${specsId}-${title.toLowerCase()}`} className={styles.blockTitle}>
          {title}
        </h2>
        {content}
      </section>
    ) : (
      <AccordionItem title={title} defaultOpen={open}>
        {content}
      </AccordionItem>
    )

  const crumbs = data.category_path.map((c) => ({ label: c.name, to: `/categoria/${c.slug}` }))

  return (
    <>
      <Breadcrumbs items={[{ label: 'Inicio', to: '/' }, ...crumbs, { label: data.name }]} />

      <div className={styles.top}>
        <ImageGallery images={data.images} name={data.name} />

        <section aria-labelledby={`${specsId}-nombre`} className={styles.info}>
          <div className={styles.heading}>
            <span className={styles.brand}>{data.brand}</span>
            <h1 id={`${specsId}-nombre`} className={styles.name}>
              {data.name}
            </h1>
            <span className={styles.sku}>SKU {variant.sku}</span>
            {data.rating.count > 0 && (
              <span className={styles.ratingLink}>
                <StarRatingDisplay value={data.rating.avg} count={data.rating.count} />
              </span>
            )}
          </div>

          <div className={styles.priceBlock}>
            <span className={styles.price} aria-live="polite">
              {formatMoney(variant.price)}
            </span>
            <span className={styles.cardDetail}>IVA incluido</span>
          </div>

          <VariantSelector
            variants={data.variants}
            value={variant.sku}
            onChange={(next) => {
              setPicked(next)
              setQty(1)
            }}
          />

          <DeliveryOptions
            variant={variant}
            store={store}
            value={delivery}
            onChange={setDelivery}
            onPickStore={openPicker}
          />

          {/* En móvil la compra va en una barra fija abajo (Movil-4-Ficha) */}
          {desktop && purchase}

          <Button
            variant="outline"
            onClick={() => wishlist.toggle(data.sku)}
            loading={wishlist.isPending}
            aria-pressed={saved}
          >
            <HeartIcon filled={saved} />
            {saved ? 'Guardado en tu lista de deseos' : 'Guardar en lista de deseos'}
          </Button>

          <div className={styles.extraLinks}>
            {calcOn && <Link to="/calculadora">Calcula cuánto material necesitas</Link>}
            <Link to="/ayuda/devoluciones">Política de devoluciones</Link>
          </div>
        </section>
      </div>

      {data.description &&
        section('Descripción', <p className={styles.description}>{data.description}</p>, false)}

      {section(
        'Especificaciones',
        <div className={styles.specsWrap}>
          <table className={styles.specs}>
            <caption className="sr-only">Especificaciones de {data.name}</caption>
            <tbody>
              {data.specs.map((s) => (
                <tr key={s.k}>
                  <th scope="row">{s.k}</th>
                  <td>{s.v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )}

      {reviewsOn && section('Reseñas', <ReviewsSection sku={data.sku} />, false)}

      {!desktop && (
        <>
          <AccordionItem title="Envíos y devoluciones">
            <p>
              Recoger en sucursal no tiene costo. El envío a domicilio se calcula con tu código postal.
              Consulta los <Link to="/ayuda/envios">plazos de envío</Link> y la{' '}
              <Link to="/ayuda/devoluciones">política de devoluciones</Link>.
            </p>
          </AccordionItem>
          <div className={styles.stickyBuy}>
            <div className={styles.stickyInner}>
              <span className={styles.stickyPrice}>{formatMoney(variant.price * Math.min(qty, maxQty))}</span>
              {purchase}
            </div>
          </div>
        </>
      )}
    </>
  )
}

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </svg>
  )
}
