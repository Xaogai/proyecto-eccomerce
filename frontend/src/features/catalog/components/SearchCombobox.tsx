import { type FormEvent, type KeyboardEvent, type ReactNode, useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { SearchIcon } from '@/components/layout/icons'
import { useDebounce } from '@/hooks/useDebounce'
import { cx } from '@/lib/cx'
import { normalize } from '@/lib/text'
import { useSuggest } from '../api'
import { readRecentSearches, rememberSearch } from '../recentSearches'
import styles from './SearchCombobox.module.css'

interface Option {
  id: string
  to: string
  group: 'queries' | 'categories' | 'products'
  label: string
  detail?: string
}

/** Resalta la parte escrita: "tala" + "dro percutor". Sin acentos al comparar. */
function Highlight({ text, term }: { text: string; term: string }) {
  const i = normalize(text).indexOf(normalize(term.trim()))
  if (!term.trim() || i < 0) return <>{text}</>
  const end = i + term.trim().length
  return (
    <>
      {text.slice(0, i)}
      <strong>{text.slice(i, end)}</strong>
      {text.slice(end)}
    </>
  )
}

interface SearchComboboxProps {
  /** "encabezado": lista flotante; "pagina": lista en la página con búsquedas recientes (Movil-2-Buscar) */
  variant: 'encabezado' | 'pagina'
  initialQuery?: string
  autoFocus?: boolean
  /** Botón "Volver" a la izquierda (móvil) */
  leading?: ReactNode
}

/**
 * Buscador con autocompletado (patrón ARIA combobox + listbox, 28.3).
 * Flechas para recorrer, Enter para elegir y Escape para cerrar.
 */
export function SearchCombobox({ variant, initialQuery = '', autoFocus, leading }: SearchComboboxProps) {
  const id = useId()
  const navigate = useNavigate()
  const [q, setQ] = useState(initialQuery)
  const [open, setOpen] = useState(variant === 'pagina')
  const [active, setActive] = useState(-1)
  const term = useDebounce(q, 200)
  const { data } = useSuggest(term)
  const showSuggestions = term.trim().length >= 2 && !!data

  const options: Option[] = showSuggestions
    ? [
        ...data.queries.map((s, i) => ({
          id: `${id}-q${i}`,
          to: `/buscar?q=${encodeURIComponent(s)}`,
          group: 'queries' as const,
          label: s,
        })),
        ...data.categories.map((c, i) => ({
          id: `${id}-c${i}`,
          to: `/categoria/${c.slug}`,
          group: 'categories' as const,
          label: c.name,
          detail: 'Categoría',
        })),
        ...data.products.map((p, i) => ({
          id: `${id}-p${i}`,
          to: `/producto/${p.sku}`,
          group: 'products' as const,
          label: p.name,
          detail: `SKU ${p.sku}`,
        })),
      ]
    : []
  const expanded = open && options.length > 0

  function go(to: string, remember?: string) {
    if (remember) rememberSearch(remember)
    setOpen(variant === 'pagina')
    setActive(-1)
    navigate(to)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    const current = options[active]
    if (expanded && current) return go(current.to, current.group === 'queries' ? current.label : undefined)
    const value = q.trim()
    if (value) go(`/buscar?q=${encodeURIComponent(value)}`, value)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (options.length ? (i + 1) % options.length : -1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (options.length ? (i <= 0 ? options.length - 1 : i - 1) : -1))
    } else if (e.key === 'Escape') {
      if (expanded) {
        e.preventDefault()
        setOpen(false)
        setActive(-1)
      } else if (q) {
        setQ('')
      }
    }
  }

  const listboxId = `${id}-lista`
  const countId = `${id}-conteo`
  const queryCount = data?.queries.length ?? 0
  const productCount = data?.products.length ?? 0
  const countText = showSuggestions
    ? options.length
      ? `${queryCount} ${queryCount === 1 ? 'sugerencia' : 'sugerencias'} y ${productCount} ${productCount === 1 ? 'producto' : 'productos'}`
      : 'Sin sugerencias. Presiona Enter para buscar.'
    : ''

  const group = (key: Option['group'], title: string) => {
    const items = options.filter((o) => o.group === key)
    if (!items.length) return null
    return (
      <li role="presentation" className={styles.groupItem}>
        <div role="group" aria-labelledby={`${id}-g-${key}`}>
          <div id={`${id}-g-${key}`} role="presentation" className={styles.groupTitle}>
            {title}
          </div>
          {items.map((o) => {
            const index = options.indexOf(o)
            return (
              <div
                key={o.id}
                id={o.id}
                role="option"
                aria-selected={index === active}
                className={cx(styles.option, index === active && styles.optionActive)}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(o.to, o.group === 'queries' ? o.label : undefined)}
              >
                {o.group === 'queries' && <SearchIcon size={18} />}
                <span className={styles.optionText}>
                  <Highlight text={o.label} term={term} />
                </span>
                {o.detail && <span className={styles.optionDetail}>{o.detail}</span>}
              </div>
            )
          })}
        </div>
      </li>
    )
  }

  const recent = variant === 'pagina' && !showSuggestions ? readRecentSearches() : []

  return (
    <div className={cx(styles.wrap, styles[variant])}>
      <form role="search" className={styles.form} onSubmit={onSubmit}>
        {leading}
        <label htmlFor={`${id}-input`} className="sr-only">
          Buscar productos
        </label>
        <input
          id={`${id}-input`}
          type="search"
          className={styles.input}
          placeholder="Busca por producto, marca o SKU"
          autoComplete="off"
          autoFocus={autoFocus}
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? options[active]?.id : undefined}
          aria-describedby={countId}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
            setActive(-1)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => variant === 'encabezado' && setOpen(false)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className={styles.submit}
          aria-label={variant === 'pagina' ? 'Buscar' : undefined}
        >
          {variant === 'pagina' ? <SearchIcon /> : 'Buscar'}
        </button>
      </form>

      <p
        id={countId}
        className={variant === 'pagina' && countText ? styles.count : 'sr-only'}
        aria-live="polite"
      >
        {countText}
      </p>

      <ul
        id={listboxId}
        role="listbox"
        aria-label="Sugerencias"
        className={styles.listbox}
        hidden={!expanded}
      >
        {group('queries', 'Búsquedas sugeridas')}
        {group('categories', 'Categorías')}
        {group('products', 'Productos')}
      </ul>

      {recent.length > 0 && (
        <section className={styles.recent} aria-labelledby={`${id}-recientes`}>
          <h2 id={`${id}-recientes`} className={styles.recentTitle}>
            Búsquedas recientes
          </h2>
          <div className={styles.recentList}>
            {recent.map((t) => (
              <Link key={t} to={`/buscar?q=${encodeURIComponent(t)}`} className={styles.recentChip}>
                {t}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
