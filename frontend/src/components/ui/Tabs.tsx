import { type KeyboardEvent, type ReactNode, useId, useRef } from 'react'
import styles from './Tabs.module.css'

interface Tab<T extends string> {
  value: T
  label: ReactNode
  panel: ReactNode
}

interface TabsProps<T extends string> {
  label: string
  tabs: Array<Tab<T>>
  value: T
  onChange: (value: T) => void
}

/** Patrón ARIA de pestañas: flechas, Inicio y Fin mueven y activan (activación automática). */
export function Tabs<T extends string>({ label, tabs, value, onChange }: TabsProps<T>) {
  const id = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const current = Math.max(0, tabs.findIndex((t) => t.value === value))

  function onKeyDown(e: KeyboardEvent) {
    const last = tabs.length - 1
    const next = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: last }[e.key]
    if (next === undefined) return
    e.preventDefault()
    const i = (next + tabs.length) % tabs.length
    onChange(tabs[i].value)
    refs.current[i]?.focus()
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className={styles.list} onKeyDown={onKeyDown}>
        {tabs.map((t, i) => (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${i}`}
            aria-selected={i === current}
            aria-controls={`${id}-panel-${i}`}
            tabIndex={i === current ? 0 : -1}
            className={styles.tab}
            onClick={() => onChange(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel-${current}`} aria-labelledby={`${id}-tab-${current}`} tabIndex={0} className={styles.panel}>
        {tabs[current]?.panel}
      </div>
    </div>
  )
}
