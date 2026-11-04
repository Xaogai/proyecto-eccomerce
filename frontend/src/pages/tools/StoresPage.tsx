import { useQuery } from '@tanstack/react-query'
import { type FormEvent, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { get } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { type Store, storeSchema } from '@/api/schemas/store'
import { useSelectedStore } from '@/app/providers/storeContext'
import { ErrorState, Skeleton } from '@/components/feedback/States'
import { StockLabel } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox, TextField } from '@/components/ui/Field'
import { useCart } from '@/features/cart/api'
import { usePageTitle } from '@/hooks/usePageTitle'
import { cx } from '@/lib/cx'
import { plural } from '@/lib/format'
import styles from './tools.module.css'

/**
 * Sucursales (pantallas 20 y 27; A11). La lista tiene toda la información; el mapa es solo
 * un apoyo visual (aria-hidden). Con ?sku= muestra el stock de ese producto en cada sucursal.
 */
export function StoresPage() {
  usePageTitle('Sucursales')
  const [params, setParams] = useSearchParams()
  const { store, setStore } = useSelectedStore()
  const cart = useCart()
  const q = params.get('q') ?? store?.zip ?? ''
  const sku = params.get('sku')
  const [text, setText] = useState(q)
  const [withCart, setWithCart] = useState(false)
  const cartSkus = (cart.data?.items ?? []).map((i) => `${i.sku}:${i.qty}`).join(',')
  const cartCount = cart.data?.items.length ?? 0

  const stores = useQuery({
    queryKey: ['catalog', 'stores-locator', q, sku, withCart ? cartSkus : null],
    queryFn: () =>
      get(endpoints.stores, z.array(storeSchema), {
        ...(q ? { q } : {}),
        ...(sku ? { sku } : {}),
        ...(withCart && cartSkus ? { skus: cartSkus } : {}),
      }),
  })

  function search(e: FormEvent) {
    e.preventDefault()
    const next = new URLSearchParams(params)
    if (text.trim()) next.set('q', text.trim())
    else next.delete('q')
    setParams(next)
  }

  const list = stores.data ?? []
  const isZip = /^\d{5}$/.test(q)
  const heading = stores.data
    ? `${plural(list.length, 'sucursal', 'sucursales')}${q ? (isZip ? ` cerca de CP ${q}, ordenadas por distancia` : ` para "${q}"`) : ''}`
    : 'Sucursales'

  return (
    <>
      <h1>Sucursales</h1>
      <form role="search" aria-label="Buscar sucursales" className={styles.storeSearch} onSubmit={search}>
        <TextField
          label="Código postal o ciudad"
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          fieldClassName={styles.grow}
        />
        <Button type="submit">Buscar sucursales</Button>
        {cartCount > 0 && (
          <Checkbox
            label={`Con stock de mi carrito (${plural(cartCount, 'producto')})`}
            checked={withCart}
            onChange={(e) => setWithCart(e.target.checked)}
          />
        )}
      </form>

      <div className={styles.storesLayout}>
        <section aria-labelledby="lista-sucursales" className={styles.storeList}>
          <h2 id="lista-sucursales" className={styles.listTitle} aria-live="polite">
            {heading}
          </h2>
          {stores.isError ? (
            <ErrorState title="No pudimos cargar las sucursales" onRetry={() => stores.refetch()} />
          ) : stores.isPending ? (
            <Skeleton height={300} />
          ) : list.length === 0 ? (
            <p>No encontramos sucursales con esa búsqueda. Prueba con tu código postal.</p>
          ) : (
            <ol className={styles.stores} aria-label="Sucursales encontradas">
              {list.map((s, i) => (
                <li key={s.id}>
                  <StoreCard
                    store={s}
                    n={i + 1}
                    mine={store?.id === s.id}
                    cartCount={withCart ? cartCount : 0}
                    onPick={() => setStore({ id: s.id, name: s.name, zip: isZip ? q : s.zip })}
                  />
                </li>
              ))}
            </ol>
          )}
        </section>
        {list.length > 0 && <StoreMap stores={list} selectedId={store?.id} />}
      </div>
    </>
  )
}

function StoreCard({
  store: s,
  n,
  mine,
  cartCount,
  onPick,
}: {
  store: Store
  n: number
  mine: boolean
  cartCount: number
  onPick: () => void
}) {
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`
  return (
    <article className={cx(styles.storeCard, mine && styles.storeMine)}>
      <div className={styles.storeHead}>
        <h3>
          {n}. {s.name}
        </h3>
        {s.distance_km !== undefined && <span>{s.distance_km.toFixed(1)} km</span>}
      </div>
      <span>{s.address}</span>
      <span className={styles.muted}>
        {s.hours} · Tel. {s.phone}
      </span>
      {s.stock && (
        <StockLabel status={s.stock.status}>
          {s.stock.qty > 0 ? `${s.stock.qty} disponibles de este producto` : 'Sin stock de este producto'}
        </StockLabel>
      )}
      {cartCount > 0 && s.available_count !== undefined && (
        <StockLabel status={s.all_available ? 'ok' : s.available_count > 0 ? 'low' : 'out'}>
          {s.all_available ? 'Tiene todo tu carrito' : `Tiene ${s.available_count} de ${cartCount} productos`}
        </StockLabel>
      )}
      <span className={styles.muted}>Servicios: {s.services.join(', ')}</span>
      <div className={styles.actionsRow}>
        <Button variant={mine ? 'secondary' : 'primary'} size="sm" onClick={onPick} aria-pressed={mine}>
          {mine ? 'Es tu sucursal' : 'Elegir como mi sucursal'}
        </Button>
        <a href={directions} target="_blank" rel="noreferrer" className={styles.link}>
          Cómo llegar<span className="sr-only"> a {s.name} (abre Google Maps en otra pestaña)</span>
        </a>
      </div>
    </article>
  )
}

/** Mapa complementario: pines ubicados por latitud y longitud. Oculto para lectores (la lista lo dice todo). */
function StoreMap({ stores, selectedId }: { stores: Store[]; selectedId?: string }) {
  const lats = stores.map((s) => s.lat)
  const lngs = stores.map((s) => s.lng)
  const [minLat, maxLat, minLng, maxLng] = [
    Math.min(...lats),
    Math.max(...lats),
    Math.min(...lngs),
    Math.max(...lngs),
  ]
  const pos = (v: number, min: number, max: number) =>
    max === min ? 50 : 12 + ((v - min) / (max - min)) * 76

  return (
    <div className={styles.map} aria-hidden="true">
      {stores.map((s, i) => (
        <span
          key={s.id}
          className={cx(styles.pin, s.id === selectedId && styles.pinMine)}
          style={{ left: `${pos(s.lng, minLng, maxLng)}%`, top: `${100 - pos(s.lat, minLat, maxLat)}%` }}
        >
          <span>{i + 1}</span>
        </span>
      ))}
      <span className={styles.mapNote}>Mapa complementario. La lista tiene toda la información.</span>
    </div>
  )
}
