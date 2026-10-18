import type { ReactNode } from 'react'
import styles from './Chip.module.css'

/** Filtro activo que se puede quitar: "Hasta $5,000 ×". */
export function RemovableChip({ children, onRemove }: { children: ReactNode; onRemove: () => void }) {
  return (
    <button type="button" className={styles.removable} onClick={onRemove}>
      {children}
      <span aria-hidden="true"> ×</span>
      <span className="sr-only">, quitar filtro</span>
    </button>
  )
}

interface ToggleChipsProps<T extends string> {
  label: string
  options: Array<{ value: T; label: ReactNode }>
  value: T
  onChange: (value: T) => void
}

/** Filtros por estado ("Todos · En curso · Terminados"): botones con aria-pressed. */
export function ToggleChips<T extends string>({ label, options, value, onChange }: ToggleChipsProps<T>) {
  return (
    <div role="group" aria-label={label} className={styles.group}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          className={styles.toggle}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
