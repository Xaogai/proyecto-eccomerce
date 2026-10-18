import { type FormEvent, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/app/providers/authContext'
import { useCartCount } from '@/features/cart/api'
import { plural } from '@/lib/format'
import { CartIcon, MenuIcon, SearchIcon, UserIcon } from './icons'
import { Logo } from './Logo'
import { StoreSelector } from './StoreSelector'
import styles from './Header.module.css'

/**
 * Encabezado de la tienda. Un solo componente para móvil y escritorio:
 * en móvil la búsqueda es un enlace a /buscar (Movil-2-Buscar) y la cuenta es un icono;
 * desde 769 px el buscador es un formulario y se ven los textos.
 * El autocompletado (SearchCombobox) llega en la fase 1.
 */
export function Header() {
  const { user } = useAuth()
  const count = useCartCount()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')

  const accountTo = user ? (user.role === 'admin' ? '/admin' : user.role === 'staff' ? '/sucursal/inventario' : '/cuenta') : '/cuenta/login'
  const accountLabel = user ? `Mi cuenta, ${user.name}` : 'Mi cuenta'

  function onSearch(e: FormEvent) {
    e.preventDefault()
    const term = q.trim()
    if (term) navigate(`/buscar?q=${encodeURIComponent(term)}`)
  }

  return (
    <header className={styles.header}>
      <div className={`contenedor ${styles.bar}`}>
        <Link to="/departamentos" className={`${styles.iconLink} ${styles.soloMovil}`} aria-label="Departamentos">
          <MenuIcon />
        </Link>

        <Logo />

        <form role="search" className={`${styles.search} ${styles.soloEscritorio}`} onSubmit={onSearch}>
          <label htmlFor="busqueda" className="sr-only">
            Buscar productos
          </label>
          <input
            id="busqueda"
            type="search"
            className={styles.searchInput}
            placeholder="Busca por producto, marca o SKU"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit" className={styles.searchBtn}>
            Buscar
          </button>
        </form>

        <StoreSelector className={styles.soloEscritorio} />

        <Link to={accountTo} className={styles.textLink} aria-label={accountLabel}>
          <span className={styles.soloMovil}>
            <UserIcon />
          </span>
          <span className={styles.soloEscritorio}>Mi cuenta</span>
        </Link>

        <Link to="/carrito" className={styles.cartLink} aria-label={`Carrito, ${plural(count, 'producto')}`}>
          <CartIcon />
          <span className={styles.soloEscritorio}>Carrito</span>
          <span className={styles.count} aria-hidden="true">
            {count}
          </span>
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
