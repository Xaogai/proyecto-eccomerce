import { type ReactNode, useEffect, useId, useRef } from 'react'
import { cx } from '@/lib/cx'
import styles from './Dialog.module.css'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** "sheet": pantalla completa en móvil (FiltersSheet); "modal": centrado. */
  variant?: 'modal' | 'sheet'
  className?: string
}

/**
 * <dialog> nativo con showModal(): atrapa el foco, cierra con Escape y
 * devuelve el foco al elemento que lo abrió.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  variant = 'modal',
  className,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !open) return
    const opener = document.activeElement as HTMLElement | null
    if (!dialog.open) dialog.showModal?.()
    return () => {
      // Cerrar antes de devolver el foco: mientras está abierto, el resto de la página es inerte.
      if (dialog.open) dialog.close()
      opener?.focus?.()
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={cx(styles.dialog, styles[variant], className)}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        // clic en el fondo (fuera del contenido)
        if (e.target === ref.current) onClose()
      }}
    >
      {open && (
        <div className={styles.inner}>
          <header className={styles.header}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </header>
          <div className={styles.body}>{children}</div>
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}
