import { type ComponentProps, useState } from 'react'
import { FormField } from './Field'
import styles from './PasswordField.module.css'

type PasswordFieldProps = Omit<ComponentProps<'input'>, 'type'> & {
  label: string
  hint?: string
  error?: string
}

/** Contraseña con botón "Mostrar"/"Ocultar" (prototipo Escritorio-13-Registro). */
export function PasswordField({ label, hint, error, className, ...input }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  return (
    <FormField label={label} hint={hint} error={error}>
      {(control) => (
        <div className={styles.row}>
          <input
            {...input}
            {...control}
            className={`${control.className} ${className ?? ''}`}
            type={visible ? 'text' : 'password'}
          />
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            aria-pressed={visible}
          >
            {visible ? 'Ocultar' : 'Mostrar'}
          </button>
        </div>
      )}
    </FormField>
  )
}
