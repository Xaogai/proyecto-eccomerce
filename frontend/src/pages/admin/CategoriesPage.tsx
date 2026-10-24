import { useState } from 'react'
import { ApiError } from '@/api/errors'
import type { AdminCategory } from '@/api/schemas/admin'
import { ErrorState, Skeleton } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/toastContext'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { useAdminCategories, useCategoryActions } from '@/features/admin/api'
import { usePageTitle } from '@/hooks/usePageTitle'
import { cx } from '@/lib/cx'
import { plural } from '@/lib/format'
import styles from './admin.module.css'

const MAX_DEPTH = 3
const LEVEL = ['Departamento', 'Categoría', 'Subcategoría']

interface Found {
  node: AdminCategory
  path: AdminCategory[]
}

function find(tree: AdminCategory[], id: string, path: AdminCategory[] = []): Found | null {
  for (const c of tree) {
    if (c.id === id) return { node: c, path: [...path, c] }
    const hit = find(c.children, id, [...path, c])
    if (hit) return hit
  }
  return null
}

/**
 * Categorías (pantalla 51): árbol de hasta 3 niveles. Se usa una lista anidada con botones
 * de mostrar/ocultar (más sencilla de recorrer con lector de pantalla que un role="tree").
 */
export function CategoriesPage() {
  usePageTitle('Categorías · Administración')
  const tree = useAdminCategories()
  const [openState, setOpen] = useState<Set<string> | null>(null)
  const [chosen, setSelected] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // Mientras no se elija nada, el primer departamento queda abierto y seleccionado.
  const first = tree.data?.[0]?.id
  const selected = chosen ?? first ?? null
  const open = openState ?? new Set(first ? [first] : [])

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev ?? open)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const found = tree.data && selected ? find(tree.data, selected) : null

  return (
    <>
      <div className={styles.titleRow}>
        <h1>Categorías</h1>
        <Button onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
          Nuevo departamento
        </Button>
      </div>
      <p className={styles.muted}>Hasta 3 niveles: departamento, categoría y subcategoría.</p>

      {adding && (
        <NewCategory
          parent={null}
          onDone={(id) => {
            setAdding(false)
            if (id) setSelected(id)
          }}
        />
      )}

      {tree.isError ? (
        <ErrorState title="No pudimos cargar las categorías" onRetry={() => tree.refetch()} />
      ) : tree.isPending ? (
        <Skeleton height={360} />
      ) : (
        <div className={styles.columns}>
          <section aria-labelledby="arbol" className={styles.card}>
            <h2 id="arbol">Árbol de categorías</h2>
            <TreeList
              items={tree.data}
              open={open}
              selected={selected}
              onToggle={toggle}
              onSelect={setSelected}
            />
          </section>
          {found && (
            <CategoryDetail
              key={found.node.id}
              found={found}
              onSelect={(id) => {
                setSelected(id)
                if (id) setOpen((prev) => new Set(prev ?? open).add(found.node.id))
              }}
            />
          )}
        </div>
      )}
    </>
  )
}

function TreeList({
  items,
  open,
  selected,
  onToggle,
  onSelect,
  root = true,
}: {
  items: AdminCategory[]
  open: Set<string>
  selected: string | null
  onToggle: (id: string) => void
  onSelect: (id: string) => void
  root?: boolean
}) {
  return (
    <ul role="list" className={root ? styles.tree : undefined}>
      {items.map((c) => {
        const hasKids = c.children.length > 0
        const isOpen = open.has(c.id)
        return (
          <li key={c.id}>
            <div className={cx(styles.treeRow, c.id === selected && styles.treeRowSelected)}>
              {hasKids ? (
                <button
                  type="button"
                  className={styles.treeToggle}
                  aria-expanded={isOpen}
                  aria-label={`Subcategorías de ${c.name}`}
                  onClick={() => onToggle(c.id)}
                >
                  <span aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                </button>
              ) : (
                <span className={styles.treeSpacer} />
              )}
              <button
                type="button"
                className={styles.treeName}
                aria-current={c.id === selected ? 'true' : undefined}
                onClick={() => onSelect(c.id)}
              >
                {c.name}
              </button>
              <span className={styles.treeCount}>{plural(c.product_count, 'producto')}</span>
            </div>
            {hasKids && isOpen && (
              <TreeList
                items={c.children}
                open={open}
                selected={selected}
                onToggle={onToggle}
                onSelect={onSelect}
                root={false}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}

function CategoryDetail({ found, onSelect }: { found: Found; onSelect: (id: string | null) => void }) {
  const { node, path } = found
  const level = path.length
  const actions = useCategoryActions()
  const { toast } = useToast()
  const [name, setName] = useState(node.name)
  const [nameError, setNameError] = useState<string>()
  const [adding, setAdding] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [deleteError, setDeleteError] = useState<string>()
  const atMax = level >= MAX_DEPTH
  const empty = node.children.length === 0 && node.product_count === 0

  const rename = async () => {
    if (!name.trim()) return setNameError('Escribe el nombre.')
    setNameError(undefined)
    await actions.rename.mutateAsync({ id: node.id, name: name.trim() })
    toast(`Guardamos "${name.trim()}"`, 'ok')
  }

  return (
    <section aria-labelledby="detalle" className={styles.card}>
      <h2 id="detalle">{node.name}</h2>
      <span className={styles.muted}>
        {LEVEL[level - 1]} · nivel {level} de {MAX_DEPTH}
        {level > 1 && ` · ${path.map((c) => c.name).join(' › ')}`}
      </span>
      <TextField label="Nombre" value={name} error={nameError} onChange={(e) => setName(e.target.value)} />
      <dl className={styles.dl}>
        <dt className={styles.muted}>Dirección web</dt>
        <dd>/categoria/{node.slug}</dd>
        <dt className={styles.muted}>Productos</dt>
        <dd>{plural(node.product_count, 'producto')}</dd>
      </dl>
      <div className={styles.actions}>
        <Button onClick={rename} loading={actions.rename.isPending}>
          Guardar
        </Button>
        <Button
          variant="outline"
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          disabled={atMax}
          aria-describedby={atMax ? 'max-nivel' : undefined}
        >
          Agregar subcategoría
        </Button>
        {!confirming && (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            Eliminar
          </Button>
        )}
      </div>
      {atMax && (
        <p id="max-nivel" className={styles.muted}>
          Esta es una subcategoría: no admite más niveles.
        </p>
      )}
      {adding && (
        <NewCategory
          parent={node}
          onDone={(id) => {
            setAdding(false)
            if (id) onSelect(id)
          }}
        />
      )}
      {confirming &&
        (empty ? (
          <InlineConfirm
            question={`¿Eliminar "${node.name}"? No se puede deshacer.`}
            confirmLabel="Sí, eliminar"
            loading={actions.remove.isPending}
            onCancel={() => setConfirming(false)}
            onConfirm={async () => {
              try {
                await actions.remove.mutateAsync(node.id)
                toast(`Eliminamos "${node.name}"`, 'ok')
                onSelect(null)
              } catch (error) {
                if (error instanceof ApiError) setDeleteError(error.message)
                setConfirming(false)
              }
            }}
          />
        ) : (
          <div role="alert" className={styles.error}>
            <p>
              Solo puedes eliminar categorías sin productos ni subcategorías. Mueve primero sus productos.
            </p>
            <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
              Entendido
            </Button>
          </div>
        ))}
      {deleteError && (
        <p role="alert" className={styles.error}>
          {deleteError}
        </p>
      )}
    </section>
  )
}

function NewCategory({ parent, onDone }: { parent: AdminCategory | null; onDone: (id?: string) => void }) {
  const { create } = useCategoryActions()
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [error, setError] = useState<string>()
  const label = parent ? `Nueva subcategoría de ${parent.name}` : 'Nuevo departamento'

  return (
    <form
      noValidate
      aria-label={label}
      className={styles.card}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return setError('Escribe el nombre.')
        try {
          const created = await create.mutateAsync({ name: name.trim(), parent_id: parent?.id ?? null })
          toast(`Agregamos "${created.name}"`, 'ok')
          onDone(created.id)
        } catch (err) {
          if (err instanceof ApiError) setError(Object.values(err.fieldErrors)[0] ?? err.message)
        }
      }}
    >
      <TextField
        label={parent ? 'Nombre de la subcategoría' : 'Nombre del departamento'}
        hint="La dirección web se arma con el nombre."
        value={name}
        error={error}
        autoFocus
        onChange={(e) => setName(e.target.value)}
      />
      <div className={styles.actions}>
        <Button type="submit" loading={create.isPending}>
          Agregar
        </Button>
        <Button variant="ghost" onClick={() => onDone()}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
