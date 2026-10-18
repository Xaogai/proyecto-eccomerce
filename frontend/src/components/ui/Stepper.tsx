import { cx } from '@/lib/cx'
import styles from './Stepper.module.css'

interface StepperProps {
  steps: string[]
  /** Índice del paso actual (0 = primero) */
  current: number
  label?: string
}

/** Pasos de un formulario (Devolución, Entrega en sucursal). El actual lleva aria-current="step". */
export function Stepper({ steps, current, label = 'Pasos' }: StepperProps) {
  return (
    <ol aria-label={label} className={styles.list}>
      {steps.map((s, i) => (
        <li
          key={s}
          aria-current={i === current ? 'step' : undefined}
          className={cx(styles.step, i < current && styles.done, i === current && styles.current)}
        >
          <span className={styles.num} aria-hidden="true">
            {i < current ? '✓' : i + 1}
          </span>
          <span>
            {s}
            {i < current && <span className="sr-only"> (completado)</span>}
          </span>
        </li>
      ))}
    </ol>
  )
}
