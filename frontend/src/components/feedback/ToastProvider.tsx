import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react'
import { cx } from '@/lib/cx'
import type { Tone } from '@/lib/orderStatus'
import { ToastContext } from './toastContext'
import styles from './Toast.module.css'

interface ToastItem {
  id: number
  message: string
  tone: Tone
}

const DURATION_MS = 5000

/** Avisos en una región aria-live="polite" que siempre existe en la página (si se crea al vuelo, no se anuncia). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const [announcement, setAnnouncement] = useState('')
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), [])

  const value = useMemo(
    () => ({
      toast: (message: string, tone: Tone = 'neutro') => {
        const id = ++nextId.current
        setItems((list) => [...list.slice(-2), { id, message, tone }])
        setTimeout(() => dismiss(id), DURATION_MS)
      },
      announce: (message: string) => {
        // Vaciar y volver a poner hace que se anuncie aunque el texto se repita.
        setAnnouncement('')
        setTimeout(() => setAnnouncement(message), 50)
      },
    }),
    [dismiss],
  )

  return (
    <ToastContext value={value}>
      {children}
      <div className={styles.region} role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx(styles.toast, styles[t.tone])}>
            <span>{t.message}</span>
            <button type="button" className={styles.close} onClick={() => dismiss(t.id)} aria-label="Cerrar aviso">
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </ToastContext>
  )
}
