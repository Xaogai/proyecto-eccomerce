import type { ComponentProps } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { cx } from '@/lib/cx'
import styles from './Button.module.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'outlineDark' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

interface StyleProps {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
}

function buttonClass({ variant = 'primary', size = 'md', fullWidth }: StyleProps, extra?: string) {
  return cx(styles.button, styles[variant], size !== 'md' && styles[size], fullWidth && styles.full, extra)
}

export function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />
}

type ButtonProps = ComponentProps<'button'> & StyleProps & { loading?: boolean }

/**
 * Botón del sistema Taller. Con `loading` queda ocupado (aria-busy) sin cambiar de ancho.
 * Variantes: primary (naranja), secondary (carbón), ghost, outline, outlineDark (sobre fondo oscuro), danger.
 */
export function Button({
  variant,
  size,
  fullWidth,
  loading,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled}
      aria-busy={loading || undefined}
      className={buttonClass({ variant, size, fullWidth }, className)}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

type ButtonLinkProps = LinkProps & StyleProps

/** Enlace con apariencia de botón (navega; no ejecuta acciones). */
export function ButtonLink({ variant, size, fullWidth, className, ...rest }: ButtonLinkProps) {
  return <Link {...rest} className={buttonClass({ variant, size, fullWidth }, className)} />
}
