import type { ComponentProps, ReactNode } from 'react'
import { cx } from '@/lib/cx'
import styles from './IconButton.module.css'

type IconButtonProps = Omit<ComponentProps<'button'>, 'aria-label' | 'children'> & {
  /** Obligatorio: el botón no tiene texto visible. */
  label: string
  icon: ReactNode
  tone?: 'claro' | 'oscuro'
}

export function IconButton({ label, icon, tone = 'claro', className, ...rest }: IconButtonProps) {
  return (
    <button type="button" aria-label={label} {...rest} className={cx(styles.icon, styles[tone], className)}>
      {icon}
    </button>
  )
}
