import { Outlet } from 'react-router-dom'
import { Footer } from '@/components/layout/Footer'
import { LockIcon } from '@/components/layout/icons'
import { Logo } from '@/components/layout/Logo'
import { SkipLink } from '@/components/ui/SkipLink'
import { useRouteFocus } from '@/hooks/useRouteFocus'
import { cx } from '@/lib/cx'
import headerStyles from '@/components/layout/Header.module.css'
import styles from './layouts.module.css'

/**
 * Encabezado reducido, sin menú de categorías.
 * - "checkout": checkout y confirmación, con aviso de compra segura.
 * - "auth": login, registro y restablecer contraseña, en una columna centrada.
 */
export function SimpleLayout({ variant }: { variant: 'checkout' | 'auth' }) {
  useRouteFocus()
  return (
    <>
      <SkipLink />
      <header className={headerStyles.header}>
        <div className={`contenedor ${headerStyles.bar}`}>
          <Logo />
          {variant === 'checkout' && (
            <span className={styles.secure}>
              <LockIcon />
              Compra segura
            </span>
          )}
        </div>
      </header>
      <main id="contenido" className={cx('contenedor', styles.main, variant === 'auth' && styles.narrow)}>
        <Outlet />
      </main>
      <Footer />
    </>
  )
}
