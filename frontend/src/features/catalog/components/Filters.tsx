import { type FormEvent, type ReactNode, useId, useState } from 'react'
import type { Facet } from '@/api/schemas/catalog'
import { AccordionItem } from '@/components/ui/Accordion'
import { RemovableChip } from '@/components/ui/Chip'
import { FieldError } from '@/components/ui/Field'
import { type ActiveFilter, filterSummary, type ListingState } from '../query'
import styles from './Filters.module.css'

type OnChange = (patch: Partial<ListingState>) => void

interface FiltersProps {
  state: ListingState
  facets: Facet[]
  active: ActiveFilter[]
  onChange: OnChange
  storeName?: string
  /** En el panel móvil cada grupo se puede plegar */
  collapsible?: boolean
}

/** Resumen leído en voz alta + chips para quitar cada filtro (28.3: "Filtrado por: …, 2 filtros activos"). */
export function ActiveFilters({
  active,
  onChange,
  showClear = true,
}: {
  active: ActiveFilter[]
  onChange: OnChange
  showClear?: boolean
}) {
  return (
    <div className={styles.active}>
      <p className={active.length ? styles.summary : 'sr-only'} aria-live="polite">
        {filterSummary(active)}
      </p>
      {active.length > 0 && (
        <>
          <div className={styles.chips}>
            {active.map((f) => (
              <RemovableChip key={f.id} onRemove={() => onChange(f.remove)}>
                {f.label}
              </RemovableChip>
            ))}
          </div>
          {showClear && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => onChange({ attrs: {}, priceMin: null, priceMax: null, pickupToday: false })}
            >
              Limpiar filtros
            </button>
          )}
        </>
      )}
    </div>
  )
}

/** Grupo de filtros: plegable en el panel móvil, bloque simple en la barra lateral. */
function Group({
  title,
  hint,
  collapsible,
  children,
}: {
  title: string
  hint?: string
  collapsible?: boolean
  children: ReactNode
}) {
  if (!collapsible) return <div className={styles.group}>{children}</div>
  return (
    <AccordionItem title={hint ? `${title} · ${hint}` : title} defaultOpen headingLevel={2}>
      {children}
    </AccordionItem>
  )
}

/** Facetas (marca y atributos), precio y disponibilidad. Cada cambio actualiza la URL y los resultados (HU-09). */
export function Filters({ state, facets, active, onChange, storeName, collapsible }: FiltersProps) {
  const legendClass = collapsible ? 'sr-only' : styles.legend

  return (
    <div className={styles.filters}>
      {facets.map((facet) => {
        const selected = state.attrs[facet.key] ?? []
        return (
          <Group
            key={facet.key}
            title={facet.title}
            hint={selected.length ? `${selected.length} seleccionados` : undefined}
            collapsible={collapsible}
          >
            <fieldset className={styles.fieldset}>
              <legend className={legendClass}>{facet.title}</legend>
              {facet.options.map((o) => (
                <label key={o.value} className={styles.option}>
                  <input
                    type="checkbox"
                    checked={selected.includes(o.value)}
                    disabled={o.count === 0 && !selected.includes(o.value)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...selected, o.value]
                        : selected.filter((v) => v !== o.value)
                      onChange({ attrs: { ...state.attrs, [facet.key]: next } })
                    }}
                  />
                  <span className={styles.optionLabel}>{o.label}</span>
                  <span className={styles.count}>
                    {o.count} <span className="sr-only">productos</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </Group>
        )
      })}

      <Group title="Precio" hint={active.find((f) => f.id === 'precio')?.label} collapsible={collapsible}>
        {/* key: si el precio cambia desde fuera (chip, limpiar), los campos vuelven a leerlo */}
        <PriceFilter
          key={`${state.priceMin}-${state.priceMax}`}
          state={state}
          onChange={onChange}
          legendClass={legendClass}
        />
      </Group>

      {storeName && (
        <Group title="Disponibilidad" collapsible={collapsible}>
          <fieldset className={styles.fieldset}>
            <legend className={legendClass}>Disponibilidad</legend>
            <label className={styles.option}>
              <input
                type="radio"
                name="disponibilidad"
                checked={state.pickupToday}
                onChange={() => onChange({ pickupToday: true })}
              />
              <span className={styles.optionLabel}>Recoger hoy en {storeName}</span>
            </label>
            <label className={styles.option}>
              <input
                type="radio"
                name="disponibilidad"
                checked={!state.pickupToday}
                onChange={() => onChange({ pickupToday: false })}
              />
              <span className={styles.optionLabel}>Envío o recolección</span>
            </label>
          </fieldset>
        </Group>
      )}
    </div>
  )
}

const toInt = (s: string) => {
  const n = Number(s.replace(/[^\d]/g, ''))
  return s.trim() === '' || Number.isNaN(n) ? null : n
}

/** Mínimo y máximo en pesos. Se aplica con Enter o al salir del campo. */
function PriceFilter({
  state,
  onChange,
  legendClass,
}: {
  state: ListingState
  onChange: OnChange
  legendClass: string
}) {
  const id = useId()
  const [min, setMin] = useState(state.priceMin?.toString() ?? '')
  const [max, setMax] = useState(state.priceMax?.toString() ?? '')
  const [error, setError] = useState<string>()

  function apply(e?: FormEvent) {
    e?.preventDefault()
    const lo = toInt(min)
    const hi = toInt(max)
    if (lo != null && hi != null && lo > hi) {
      setError('El mínimo no puede ser mayor que el máximo.')
      return
    }
    setError(undefined)
    if (lo !== state.priceMin || hi !== state.priceMax) onChange({ priceMin: lo, priceMax: hi })
  }

  const describedBy = error ? `${id}-err` : undefined

  return (
    <form className={styles.fieldset} onSubmit={apply} role="group" aria-labelledby={`${id}-legend`}>
      <span id={`${id}-legend`} className={legendClass}>
        Precio
      </span>
      <div className={styles.priceRow}>
        <label className={styles.priceField}>
          Mínimo
          <input
            inputMode="numeric"
            placeholder="$0"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            onBlur={() => apply()}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
          />
        </label>
        <label className={styles.priceField}>
          Máximo
          <input
            inputMode="numeric"
            placeholder="Sin límite"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            onBlur={() => apply()}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
          />
        </label>
      </div>
      {error && <FieldError id={`${id}-err`}>{error}</FieldError>}
      <button type="submit" className="sr-only">
        Aplicar precio
      </button>
    </form>
  )
}
