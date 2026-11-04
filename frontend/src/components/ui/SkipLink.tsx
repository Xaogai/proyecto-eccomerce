import styles from './SkipLink.module.css'

/** Primer elemento con foco de cada layout: salta el encabezado y el menú. */
export function SkipLink({ target = 'contenido' }: { target?: string }) {
  return (
    <a href={`#${target}`} className={styles.skip}>
      Saltar al contenido
    </a>
  )
}
