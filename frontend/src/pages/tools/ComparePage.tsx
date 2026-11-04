import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { get } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { compareSchema } from '@/api/schemas/catalog'
import { useFeatureFlag } from '@/app/featureFlags'
import { useSelectedStore } from '@/app/providers/storeContext'
import { EmptyState, ErrorState, PageSkeleton } from '@/components/feedback/States'
import { StockLabel } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Field'
import { Price } from '@/components/ui/Price'
import { useAddToCart } from '@/features/cart/api'
import { compareStore, useCompareList } from '@/features/compare/store'
import { usePageTitle } from '@/hooks/usePageTitle'
import { cx } from '@/lib/cx'
import styles from '@/features/compare/compare.module.css'
import { ProductImage } from '@/components/ui/ProductImage'

/**
 * Comparador (pantallas 17 y 24; A8, 28.3): tabla con encabezados de columna (productos)
 * y de fila (especificaciones), filas con diferencias resaltadas y "Mostrar solo diferencias".
 */
export function ComparePage() {
  usePageTitle('Comparar productos')
  const enabled = useFeatureFlag('cmp')
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const saved = useCompareList()
  const { store } = useSelectedStore()
  const addToCart = useAddToCart()
  const [onlyDiff, setOnlyDiff] = useState(false)
  const skus = (params.get('skus') ?? saved.map((i) => i.sku).join(','))
    .split(',')
    .filter(Boolean)
    .slice(0, 4)
  const key = skus.join(',')

  const comparison = useQuery({
    queryKey: ['catalog', 'compare', key, store?.id ?? null],
    queryFn: () =>
      get(endpoints.compare, compareSchema, { skus: key, ...(store ? { store_id: store.id } : {}) }),
    enabled: skus.length > 0,
  })

  // Lo que se compara por URL también queda en la lista (para seguir agregando desde el listado).
  useEffect(() => {
    comparison.data?.products.forEach((p) => compareStore.add({ sku: p.sku, name: p.name }))
  }, [comparison.data])

  if (!enabled) {
    return (
      <EmptyState
        headingLevel={1}
        title="El comparador no está disponible por ahora"
        actions={<ButtonLink to="/">Ir al inicio</ButtonLink>}
      />
    )
  }
  if (skus.length < 2) {
    return (
      <EmptyState
        headingLevel={1}
        title="Elige productos para comparar"
        actions={<ButtonLink to="/departamentos">Ver departamentos</ButtonLink>}
      >
        Marca "Comparar" en al menos 2 productos del listado. Puedes comparar hasta 4.
      </EmptyState>
    )
  }
  if (comparison.isPending) return <PageSkeleton label="Preparando la comparación" />
  if (comparison.isError)
    return (
      <ErrorState
        headingLevel={1}
        title="No pudimos cargar la comparación"
        onRetry={() => comparison.refetch()}
      />
    )

  const { products, rows } = comparison.data
  const visible = onlyDiff ? rows.filter((r) => r.differs) : rows

  function remove(sku: string) {
    compareStore.remove(sku)
    const next = skus.filter((s) => s !== sku)
    navigate(next.length ? `/comparar?skus=${next.join(',')}` : '/comparar', { replace: true })
  }

  return (
    <>
      <Link to="/departamentos" className={styles.toggle}>
        <span aria-hidden="true">‹&nbsp;</span>Seguir viendo productos
      </Link>
      <div className={styles.head}>
        <h1>Comparar {products.length} productos</h1>
        <Checkbox
          label="Mostrar solo diferencias"
          checked={onlyDiff}
          onChange={(e) => setOnlyDiff(e.target.checked)}
        />
      </div>

      <div className={styles.scroll} role="region" aria-label="Tabla de comparación" tabIndex={0}>
        <table className={styles.table}>
          <caption className="sr-only">
            Comparación de especificaciones de {products.length} productos
            {onlyDiff ? ', solo filas con diferencias' : ''}
          </caption>
          <thead>
            <tr>
              <td className={styles.corner} />
              {products.map((p) => (
                <th key={p.sku} scope="col">
                  <div className={styles.productCell}>
                    <ProductImage image={p.image} alt="" width={160} height={100} />
                    <Link to={`/producto/${p.sku}`} className={styles.productName}>
                      {p.name}
                    </Link>
                    <Price amount={p.price} size="linea" />
                    <StockLabel status={p.stock.status}>{p.stock.label}</StockLabel>
                    {p.variant_count === 1 && p.stock.status !== 'out' ? (
                      <Button
                        size="sm"
                        onClick={() => addToCart.mutate({ sku: p.variant_sku, qty: 1, name: p.name })}
                      >
                        Agregar al carrito
                      </Button>
                    ) : (
                      <ButtonLink to={`/producto/${p.sku}`} size="sm" variant="secondary">
                        {p.variant_count > 1 ? 'Elegir variante' : 'Ver opciones'}
                      </ButtonLink>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => remove(p.sku)}>
                      Quitar<span className="sr-only">{` ${p.name} de la comparación`}</span>
                    </Button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.key} className={cx(r.differs && styles.diff)}>
                <th scope="row">
                  {r.label}
                  {r.differs && <span className="sr-only"> (diferente)</span>}
                </th>
                {r.values.map((v, i) => (
                  <td key={`${r.key}-${products[i]?.sku}`}>{v}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.note}>
        Puedes comparar hasta 4 productos. Las filas resaltadas tienen valores distintos.
      </p>
    </>
  )
}
