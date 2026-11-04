import styles from './QuantityStepper.module.css'

interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  /** Nombre del producto, para que el lector diga "Cantidad de Taladro…". */
  itemName?: string
  disabled?: boolean
}

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  itemName,
  disabled,
}: QuantityStepperProps) {
  const label = itemName ? `Cantidad de ${itemName}` : 'Cantidad'
  const clamp = (n: number) => Math.min(max, Math.max(min, n))

  return (
    <div role="group" aria-label={label} className={styles.stepper}>
      <button
        type="button"
        className={styles.btn}
        aria-label="Quitar uno"
        disabled={disabled || value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        −
      </button>
      <input
        className={styles.input}
        type="number"
        inputMode="numeric"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10)
          if (!Number.isNaN(n)) onChange(clamp(n))
        }}
      />
      <button
        type="button"
        className={styles.btn}
        aria-label="Agregar uno"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        +
      </button>
    </div>
  )
}
