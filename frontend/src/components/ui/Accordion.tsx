import { type ReactNode, useId, useState } from 'react'
import styles from './Accordion.module.css'

interface AccordionItemProps {
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  /** Nivel del encabezado que envuelve al botón (h2 por defecto). */
  headingLevel?: 2 | 3 | 4
}

export function AccordionItem({
  title,
  children,
  defaultOpen = false,
  headingLevel = 2,
}: AccordionItemProps) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  const Heading = `h${headingLevel}` as const

  return (
    <div className={styles.item}>
      <Heading className={styles.heading}>
        <button
          type="button"
          className={styles.trigger}
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          onClick={() => setOpen((o) => !o)}
        >
          <span>{title}</span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </Heading>
      <div id={`${id}-panel`} className={styles.panel} hidden={!open}>
        {children}
      </div>
    </div>
  )
}
