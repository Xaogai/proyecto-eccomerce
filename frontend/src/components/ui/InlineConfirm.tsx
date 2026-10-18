import { type ReactNode, useEffect, useRef } from 'react'
import { Button } from './Button'
import styles from './InlineConfirm.module.css'

interface InlineConfirmProps {
  question: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  loading?: boolean
}

/** Confirmación en línea, sin modal ("¿Eliminar esta dirección? Sí, eliminar / No"). El foco va a "No". */
export function InlineConfirm({ question, confirmLabel = 'Sí, eliminar', cancelLabel = 'No', onConfirm, onCancel, loading }: InlineConfirmProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  useEffect(() => cancelRef.current?.focus(), [])

  return (
    <div role="group" aria-label="Confirmar" className={styles.box}>
      <p className={styles.question}>{question}</p>
      <div className={styles.actions}>
        <Button variant="danger" size="sm" onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
        <Button ref={cancelRef} variant="outline" size="sm" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  )
}
