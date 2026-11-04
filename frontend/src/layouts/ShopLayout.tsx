import { Outlet } from 'react-router-dom'
import { CategoryNav } from '@/components/layout/CategoryNav'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { SkipLink } from '@/components/ui/SkipLink'
import { useRouteFocus } from '@/hooks/useRouteFocus'
import styles from './layouts.module.css'

/** Inicio, catálogo, ficha, carrito, herramientas y Mi cuenta. */
export function ShopLayout() {
  useRouteFocus()
  return (
    <>
      <SkipLink />
      <Header />
      <CategoryNav />
      <main id="contenido" className={`contenedor ${styles.main}`}>
        <Outlet />
      </main>
      <Footer />
    </>
  )
}
