import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/app/providers/authContext'
import { useCartCount } from '@/features/cart/api'
import { SearchCombobox } from '@/features/catalog/components/SearchCombobox'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { CartIcon, MenuIcon, SearchIcon, UserIcon } from './icons'
import { Logo } from './Logo'
import { StoreSelector } from './StoreSelector'
import styles from './Header.module.css'

/**
 * Encabezado de la tienda. Un solo componente para móvil y escritorio:
 * en móvil la búsqueda es un enlace a /buscar (Movil-2-Buscar) y la cuenta es un icono;
 * desde 769 px el buscador es un formulario y se ven los textos.
 */
export function Header() {
  const { user } = useAuth()
  const count = useCartCount()
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  // El buscador con autocompletado solo existe en escritorio; en móvil es un enlace a /buscar.
  const desktop = useMediaQuery('menu')

  const accountTo = user
    ? user.role === 'admin'
      ? '/admin'
      : user.role === 'staff'
        ? '/sucursal/inventario'
        : '/cuenta'
    : '/cuenta/login'
  const accountLabel = user ? `Mi cuenta, ${user.name}` : 'Mi cuenta'

  return (
    <header className={styles.header}>
      <div className={`contenedor ${styles.bar}`}>
        <Link
          to="/departamentos"
          className={`${styles.iconLink} ${styles.soloMovil}`}
          aria-label="Departamentos"
        >
          <MenuIcon />
        </Link>

        <Logo />

        {desktop && (
          <div className={styles.searchSlot}>
            {/* key: al llegar a /buscar?q= el campo muestra la búsqueda actual */}
            <SearchCombobox
              key={pathname === '/buscar' ? params.get('q') : 'otra'}
              variant="encabezado"
              initialQuery={pathname === '/buscar' ? (params.get('q') ?? '') : ''}
            />
          </div>
        )}

        <StoreSelector className={styles.soloEscritorio} />

        <Link to={accountTo} className={styles.textLink} aria-label={accountLabel}>
          <span className={styles.soloMovil}>
            <UserIcon />
          </span>
          <span className={styles.soloEscritorio}>Mi cuenta</span>
        </Link>

        {/* Nombre accesible = texto visible ("Carrito 3") + "productos" oculto: cumple 2.5.3 */}
        <Link to="/carrito" className={styles.cartLink}>
          <CartIcon />
          <span className={styles.cartText}>Carrito</span> <span className={styles.count}>{count}</span>{' '}
          <span className="sr-only">{count === 1 ? 'producto' : 'productos'}</span>
        </Link>
      </div>

      <div className={`contenedor ${styles.mobileRow} ${styles.soloMovil}`}>
        <Link to="/buscar" className={styles.searchLink}>
          <SearchIcon />
          Busca por producto, marca o SKU
        </Link>
        <StoreSelector variant="movil" />
      </div>
    </header>
  )
}
