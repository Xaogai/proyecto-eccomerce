import { useState } from 'react'
import { MOCK_PASSWORD } from './db/seed'
import { getScenario, type Scenario, SCENARIOS, storeScenario } from './scenarios'
import styles from './MockPanel.module.css'

/** Panel flotante, solo con datos simulados: cambia el escenario y muestra los usuarios de prueba. */
export function MockPanel() {
  const [open, setOpen] = useState(false)
  const current = getScenario()

  return (
    <aside className={styles.panel} aria-label="Datos simulados">
      <button type="button" className={styles.toggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Mock: {SCENARIOS[current]}
      </button>
      {open && (
        <div className={styles.body}>
          <label className={styles.label}>
            Escenario
            <select
              value={current}
              onChange={(e) => {
                storeScenario(e.target.value as Scenario)
                const url = new URL(window.location.href)
                url.searchParams.delete('mock')
                window.location.assign(url)
              }}
            >
              {Object.entries(SCENARIOS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.toggle}
            onClick={() => {
              try {
                sessionStorage.removeItem('taller.mock-db')
              } catch {
                // sin almacenamiento
              }
              window.location.reload()
            }}
          >
            Reiniciar datos de prueba
          </button>
          <p className={styles.users}>
            Usuarios (contraseña <code>{MOCK_PASSWORD}</code>):
            <br />
            cliente@ejemplo.com · staff@ejemplo.com · admin@ejemplo.com · bloqueada@ejemplo.com
          </p>
        </div>
      )}
    </aside>
  )
}
