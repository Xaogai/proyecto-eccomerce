import { type ReactNode, useId } from 'react'
import styles from './Switch.module.css'

interface SwitchProps {
  label: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  onText?: string
  offText?: string
}

/** Interruptor (role="switch"). Muestra el estado en texto además del color. */
export function Switch({
  label,
  description,
  checked,
  onChange,
  disabled,
  onText = 'Activa',
  offText = 'Apagada',
}: SwitchProps) {
  const id = useId()
  return (
    <div className={styles.row}>
      <div className={styles.text}>
        <span id={`${id}-l`} className={styles.label}>
          {label}
        </span>
        {description && (
          <span id={`${id}-d`} className={styles.description}>
            {description}
          </span>
        )}
      </div>
      <span className={styles.state} data-on={checked} aria-hidden="true">
        {checked ? onText : offText}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        className={styles.track}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.knob} />
      </button>
    </div>
  )
}
