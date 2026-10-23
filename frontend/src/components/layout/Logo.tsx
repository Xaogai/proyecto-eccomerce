import { Link } from 'react-router-dom'
import { SITE_NAME } from '@/hooks/usePageTitle'
import styles from './Header.module.css'

/** "Ferremarket." con el punto naranja. Enlaza al inicio. */
export function Logo({ to = '/', suffix }: { to?: string; suffix?: string }) {
  return (
    <Link to={to} className={styles.logo}>
      {SITE_NAME}
      <span className={styles.logoDot} aria-hidden="true">
        .
      </span>
      {suffix && <span className={styles.logoSuffix}> {suffix}</span>}
      <span className="sr-only">{suffix ? `, ${suffix}` : ', ir al inicio'}</span>
    </Link>
  )
}
