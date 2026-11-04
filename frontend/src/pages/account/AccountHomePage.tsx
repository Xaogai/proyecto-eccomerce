import { Link } from 'react-router-dom'
import { useAuth } from '@/app/providers/authContext'
import { ErrorState, Skeleton } from '@/components/feedback/States'
import { StatusBadge } from '@/components/ui/Badge'
import { ButtonLink } from '@/components/ui/Button'
import { useAddressBook, useMyOrders } from '@/features/account/api'
import { useWishlist } from '@/features/account/wishlist'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatDate, formatMoney, plural } from '@/lib/format'
import { orderStatusInfo } from '@/lib/orderStatus'
import styles from './account.module.css'

/** Mi cuenta · Resumen (pantallas 30 y 40). */
export function AccountHomePage() {
  usePageTitle('Mi cuenta')
  const { user } = useAuth()
  const recent = useMyOrders('todos', 1, 3)
  const active = useMyOrders('curso', 1, 1)
  const addresses = useAddressBook()
  const wishlist = useWishlist()
  const firstName = user?.name.split(' ')[0] ?? ''

  const current = active.data?.items[0]
  const mainAddress = addresses.data?.find((a) => a.is_default)
  const drops = wishlist.data?.filter((p) => p.saved_price && p.saved_price > p.price).length ?? 0

  return (
    <>
      <h1>Hola, {firstName}</h1>

      {current && (
        <section aria-labelledby="pedido-en-curso" className={styles.highlight}>
          <div>
            <span className={styles.kicker}>Pedido en curso</span>
            <h2 id="pedido-en-curso">
              Pedido {current.folio} · {orderStatusInfo[current.status].label}
            </h2>
            <span className={styles.highlightText}>{current.fulfillment_label}</span>
          </div>
          <ButtonLink to={`/cuenta/pedidos/${current.id}`}>Ver seguimiento</ButtonLink>
        </section>
      )}

      <nav aria-label="Secciones de tu cuenta" className={styles.tiles}>
        <Link to="/cuenta/pedidos" className={styles.tile}>
          <span className={styles.tileTitle}>Mis pedidos</span>
          <span className={styles.muted}>
            {recent.data
              ? `${plural(recent.data.total, 'pedido')} · ${active.data?.total ?? 0} en curso`
              : 'Cargando…'}
          </span>
        </Link>
        <Link to="/cuenta/direcciones" className={styles.tile}>
          <span className={styles.tileTitle}>Direcciones</span>
          <span className={styles.muted}>
            {addresses.data
              ? addresses.data.length
                ? `${plural(addresses.data.length, 'guardada')}${mainAddress ? ` · ${mainAddress.alias} es la principal` : ''}`
                : 'Aún no guardas direcciones'
              : 'Cargando…'}
          </span>
        </Link>
        <Link to="/cuenta/deseos" className={styles.tile}>
          <span className={styles.tileTitle}>Lista de deseos</span>
          <span className={styles.muted}>
            {wishlist.data
              ? `${plural(wishlist.data.length, 'producto')}${drops ? ` · ${drops} bajó de precio` : ''}`
              : 'Cargando…'}
          </span>
        </Link>
        <Link to="/cuenta/datos" className={styles.tile}>
          <span className={styles.tileTitle}>Datos y privacidad</span>
          <span className={styles.muted}>Ver, corregir o eliminar tus datos</span>
        </Link>
      </nav>

      <section aria-labelledby="recientes" className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 id="recientes">Pedidos recientes</h2>
          <Link to="/cuenta/pedidos">Ver todos</Link>
        </div>
        {recent.isError ? (
          <ErrorState title="No pudimos cargar tus pedidos" onRetry={() => recent.refetch()} />
        ) : recent.isPending ? (
          <Skeleton height={60} />
        ) : recent.data.items.length === 0 ? (
          <p>Aún no tienes pedidos. Cuando compres, aquí los verás.</p>
        ) : (
          <ul role="list" className={styles.list}>
            {recent.data.items.map((o) => (
              <li key={o.id}>
                <Link to={`/cuenta/pedidos/${o.id}`} className={styles.row}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>Pedido {o.folio}</span>
                    <span className={styles.muted}>{formatDate(o.created_at)}</span>
                  </span>
                  <span className={styles.rowTotal}>{formatMoney(o.total)}</span>
                  <StatusBadge status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
