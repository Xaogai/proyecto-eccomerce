import { Link } from 'react-router-dom'
import styles from './Footer.module.css'

/** Pie con aviso de privacidad, envíos, plazos y devoluciones (G1). */
export function Footer() {
  return (
    <footer className={styles.footer}>
      <nav aria-label="Información" className={`contenedor ${styles.links}`}>
        <Link to="/ayuda/privacidad">Aviso de privacidad</Link>
        <Link to="/ayuda/envios">Envíos y plazos</Link>
        <Link to="/ayuda/devoluciones">Devoluciones</Link>
        <Link to="/sucursales">Localizador de tiendas</Link>
      </nav>
    </footer>
  )
}
