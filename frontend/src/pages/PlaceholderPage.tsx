import { usePageTitle } from '@/hooks/usePageTitle'
import styles from './pages.module.css'

interface PlaceholderPageProps {
  title: string
  /** Números de pantalla de docs/diseno/README.md */
  screens: string
  phase: number
}

/** Ruta ya conectada cuya pantalla se construye en una fase posterior. */
export function PlaceholderPage({ title, screens, phase }: PlaceholderPageProps) {
  usePageTitle(title)
  return (
    <section className={styles.card}>
      <h1>{title}</h1>
      <p className={styles.muted}>
        Pantalla en construcción (fase {phase}). Diseño de referencia: pantallas {screens} de{' '}
        <code>docs/diseno/README.md</code>.
      </p>
    </section>
  )
}
