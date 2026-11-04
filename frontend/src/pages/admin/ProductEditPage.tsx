import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId, useRef, useState } from 'react'
import { type FieldErrors, useFieldArray, useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api/errors'
import type { AdminProduct } from '@/api/schemas/admin'
import { ErrorState, Skeleton } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/toastContext'
import { ProductStatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { FieldError, FormErrorSummary, Select, Textarea, TextField } from '@/components/ui/Field'
import {
  type ProductInput,
  useAdminCategories,
  useAdminProduct,
  usePublishProduct,
  useSaveProduct,
  useUploadImage,
} from '@/features/admin/api'
import { flattenCategories } from '@/features/admin/categories'
import { usePageTitle } from '@/hooks/usePageTitle'
import styles from './admin.module.css'
import { ProductImage } from '@/components/ui/ProductImage'

/** "1,299.50" o "1299,5" → centavos; vacío → 0. */
const toCents = (v: string) =>
  Math.round(Number(v.replace(/[$\s,]/g, '').replace(/,(\d{1,2})$/, '.$1') || 0) * 100)
const fromCents = (c: number) => (c ? (c / 100).toFixed(2) : '')

const schema = z.object({
  name: z.string().trim().min(1, 'Escribe el nombre del producto.'),
  brand: z.string().trim().min(1, 'Escribe la marca.'),
  category: z.string().min(1, 'Elige una categoría.'),
  description: z.string(),
  attrs: z.array(z.object({ key: z.string(), value: z.string() })),
  variants: z.array(
    z.object({
      sku: z.string().optional(),
      label: z.string(),
      price: z
        .string()
        .refine(
          (v) => !v.trim() || /^\$?\s*[\d,]+(\.\d{1,2})?$/.test(v.trim()),
          'Escribe un precio válido, por ejemplo 1299.00.',
        ),
      stock: z.string().refine((v) => !v.trim() || /^\d+$/.test(v.trim()), 'Escribe un entero de 0 o más.'),
    }),
  ),
})
type Form = z.infer<typeof schema>

const toForm = (p?: AdminProduct): Form => ({
  name: p?.name ?? '',
  brand: p?.brand ?? '',
  category: p?.category ?? '',
  description: p?.description ?? '',
  attrs: Object.entries(p?.attrs ?? {}).map(([key, value]) => ({ key, value })),
  variants: p?.variants.map((v) => ({
    sku: v.sku,
    label: v.label,
    price: fromCents(v.price),
    stock: String(v.stock_total),
  })) ?? [{ label: 'Única', price: '', stock: '' }],
})

const toInput = (f: Form): ProductInput => ({
  name: f.name,
  brand: f.brand,
  category: f.category,
  description: f.description,
  attrs: Object.fromEntries(f.attrs.filter((a) => a.key.trim()).map((a) => [a.key.trim(), a.value.trim()])),
  variants: f.variants.map((v) => ({
    sku: v.sku,
    label: v.label.trim() || 'Única',
    price: toCents(v.price),
    stock_total: Number(v.stock.trim() || 0),
  })),
})

/** Editar producto (pantalla 50): información, atributos, imágenes con texto alternativo (F4) y variantes. */
export function ProductEditPage() {
  const { id } = useParams()
  const isNew = id === 'nuevo'
  const product = useAdminProduct(isNew ? undefined : id)
  const categories = useAdminCategories()

  if (!isNew && product.isError) {
    return (
      <>
        <BackLink />
        <ErrorState
          headingLevel={1}
          title={
            product.error instanceof ApiError && product.error.status === 404
              ? 'No encontramos este producto'
              : 'No pudimos cargar el producto'
          }
          onRetry={() => product.refetch()}
        />
      </>
    )
  }
  // El <select> de categoría necesita sus opciones antes de tomar el valor del producto.
  if ((!isNew && product.isPending) || categories.isPending) return <Skeleton height={480} />
  // La llave reinicia el formulario al cambiar de producto o al crear uno nuevo.
  return <ProductForm key={product.data?.id ?? 'nuevo'} product={product.data} />
}

function BackLink() {
  return (
    <Link to="/admin/productos" className={styles.backLink}>
      ‹ Productos
    </Link>
  )
}

function ProductForm({ product }: { product?: AdminProduct }) {
  usePageTitle(`${product ? product.name : 'Nuevo producto'} · Administración`)
  const navigate = useNavigate()
  const { toast } = useToast()
  const categories = useAdminCategories()
  const save = useSaveProduct(product?.id)
  const publish = usePublishProduct(product?.id ?? '')
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const messageRef = useRef<HTMLDivElement>(null)

  const { register, control, handleSubmit, formState, setError, reset } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: toForm(product),
  })
  const variants = useFieldArray({ control, name: 'variants' })
  const attrs = useFieldArray({ control, name: 'attrs' })
  const errors = formState.errors

  useEffect(() => {
    if (message) messageRef.current?.focus()
  }, [message])

  const submit = (andPublish: boolean) =>
    handleSubmit(async (form) => {
      setMessage(null)
      try {
        const saved = await save.mutateAsync(toInput(form))
        reset(toForm(saved))
        if (!product) {
          toast('Guardamos el producto como borrador', 'ok')
          navigate(`/admin/productos/${saved.id}`, { replace: true })
          return
        }
        if (andPublish) {
          await publish.mutateAsync(true)
          setMessage({
            tone: 'ok',
            text: 'Publicado. El producto aparece en el catálogo en menos de 1 minuto.',
          })
        } else {
          setMessage({ tone: 'ok', text: 'Guardamos los cambios.' })
        }
      } catch (error) {
        if (!(error instanceof ApiError)) throw error
        for (const [field, msg] of Object.entries(error.fieldErrors)) {
          const [name, i, sub] = field.split('.')
          if (name === 'variants' && sub)
            setError(`variants.${Number(i)}.${sub === 'stock_total' ? 'stock' : 'price'}`, { message: msg })
          else if (name === 'name' || name === 'brand' || name === 'category')
            setError(name, { message: msg })
        }
        setMessage({ tone: 'error', text: error.message })
      }
    })

  const busy = save.isPending || publish.isPending
  const status = product?.status ?? 'borrador'
  const invalidCount = Object.keys(errors).length

  return (
    <>
      <BackLink />
      <div className={styles.titleRow}>
        <h1>
          {product?.name ?? 'Nuevo producto'}
          <ProductStatusBadge status={status} />
        </h1>
        <div className={styles.actions}>
          <Button
            variant="outline"
            onClick={submit(false)}
            loading={save.isPending && !publish.isPending}
            disabled={busy}
          >
            {product && status !== 'borrador' ? 'Guardar cambios' : 'Guardar borrador'}
          </Button>
          {product &&
            (status === 'borrador' ? (
              <Button onClick={submit(true)} loading={publish.isPending} disabled={busy}>
                Publicar
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={async () => {
                  await publish.mutateAsync(false)
                  setMessage({
                    tone: 'ok',
                    text: 'El producto pasó a borrador y ya no aparece en el catálogo.',
                  })
                }}
              >
                Pasar a borrador
              </Button>
            ))}
        </div>
      </div>

      {invalidCount > 0 && <FormErrorSummary>Revisa los campos marcados.</FormErrorSummary>}
      {message && (
        <div
          ref={messageRef}
          tabIndex={-1}
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={message.tone === 'error' ? styles.error : styles.success}
        >
          {message.text}
        </div>
      )}

      <form noValidate onSubmit={submit(false)} className={styles.formNarrow}>
        <section aria-labelledby="general" className={styles.card}>
          <h2 id="general">Información general</h2>
          <TextField
            label="Nombre del producto"
            required
            error={errors.name?.message}
            {...register('name')}
          />
          <TextField label="Marca" required error={errors.brand?.message} {...register('brand')} />
          <Select label="Categoría" required error={errors.category?.message} {...register('category')}>
            <option value="">Elige una categoría</option>
            {flattenCategories(categories.data ?? []).map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.label}
              </option>
            ))}
          </Select>
          <Textarea label="Descripción" optional rows={3} {...register('description')} />
        </section>

        <section aria-labelledby="atributos" className={styles.card}>
          <div className={styles.cardHead}>
            <h2 id="atributos">Atributos</h2>
            <Button variant="outline" size="sm" onClick={() => attrs.append({ key: '', value: '' })}>
              Agregar atributo
            </Button>
          </div>
          <p className={styles.muted}>Se usan como filtros en el catálogo.</p>
          {attrs.fields.length === 0 ? (
            <p className={styles.muted}>Sin atributos.</p>
          ) : (
            <div className={styles.grid3}>
              {attrs.fields.map((f, i) => (
                <fieldset key={f.id} className={styles.attr}>
                  <legend className="sr-only">Atributo {i + 1}</legend>
                  <TextField label="Nombre del atributo" {...register(`attrs.${i}.key`)} />
                  <TextField label="Valor" {...register(`attrs.${i}.value`)} />
                </fieldset>
              ))}
            </div>
          )}
        </section>

        <section aria-labelledby="variantes" className={styles.card}>
          <div className={styles.cardHead}>
            <h2 id="variantes">Variantes (SKU)</h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => variants.append({ label: '', price: '', stock: '' })}
            >
              Agregar variante
            </Button>
          </div>
          <VariantTable
            fields={variants.fields.map((f, i) => ({ id: f.id, sku: f.sku, index: i }))}
            register={register}
            errors={errors.variants}
            onRemove={(i) => variants.remove(i)}
          />
          <p className={styles.muted}>
            Para publicar necesitas al menos una variante con precio y stock mayores a cero. El stock por
            sucursal se ajusta después en <Link to="/sucursal/inventario">Inventario</Link>. Los precios
            cambian para pedidos nuevos; los pedidos existentes conservan su precio.
          </p>
        </section>
      </form>

      {product ? (
        <ImagesSection product={product} />
      ) : (
        <section aria-labelledby="imagenes" className={styles.card}>
          <h2 id="imagenes">Imágenes</h2>
          <p className={styles.muted}>Guarda el producto para poder subir imágenes.</p>
        </section>
      )}
    </>
  )
}

type VariantErrors = FieldErrors<Form>['variants']

function VariantTable({
  fields,
  register,
  errors,
  onRemove,
}: {
  fields: Array<{ id: string; sku?: string; index: number }>
  register: ReturnType<typeof useForm<Form>>['register']
  errors: VariantErrors
  onRemove: (index: number) => void
}) {
  const id = useId()
  if (fields.length === 0)
    return <p className={styles.muted}>Sin variantes. Agrega al menos una para poder publicar.</p>
  return (
    <div role="region" aria-label="Variantes" tabIndex={0} className={styles.tableScroll}>
      <table className={styles.variantTable}>
        <caption className="sr-only">Variantes del producto</caption>
        <thead>
          <tr>
            <th scope="col">SKU</th>
            <th scope="col">Versión</th>
            <th scope="col">Precio (MXN)</th>
            <th scope="col">Stock total</th>
            <th scope="col">
              <span className="sr-only">Quitar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const name = f.sku ?? `nueva ${f.index + 1}`
            const e = errors?.[f.index]
            const priceErr = e?.price?.message
            const stockErr = e?.stock?.message
            return (
              <tr key={f.id}>
                <th scope="row">{f.sku ?? <span className={styles.muted}>Nueva</span>}</th>
                <td>
                  <input
                    className={styles.tableInput}
                    aria-label={`Versión de ${name}`}
                    {...register(`variants.${f.index}.label`)}
                  />
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label={`Precio de ${name}`}
                    aria-invalid={priceErr ? true : undefined}
                    aria-describedby={priceErr ? `${id}-p${f.index}` : undefined}
                    {...register(`variants.${f.index}.price`)}
                  />
                  {priceErr && <FieldError id={`${id}-p${f.index}`}>{priceErr}</FieldError>}
                </td>
                <td>
                  <input
                    className={styles.tableInput}
                    inputMode="numeric"
                    placeholder="0"
                    aria-label={`Stock total de ${name}`}
                    aria-invalid={stockErr ? true : undefined}
                    aria-describedby={stockErr ? `${id}-s${f.index}` : undefined}
                    {...register(`variants.${f.index}.stock`)}
                  />
                  {stockErr && <FieldError id={`${id}-s${f.index}`}>{stockErr}</FieldError>}
                </td>
                <td>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(f.index)}
                    aria-label={`Quitar variante ${name}`}
                  >
                    Quitar
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ImagesSection({ product }: { product: AdminProduct }) {
  const upload = useUploadImage(product.id)
  const { toast } = useToast()
  const [alt, setAlt] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<{ alt?: string; file?: string }>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const send = async () => {
    const next = {
      alt: alt.trim() ? undefined : 'Escribe el texto alternativo de la imagen.',
      file: file ? undefined : 'Elige una imagen.',
    }
    if (file && file.size > 5 * 1024 * 1024) next.file = 'La imagen pesa más de 5 MB.'
    setErrors(next)
    if (next.alt || next.file) return
    try {
      await upload.mutateAsync({ file: file!, alt: alt.trim() })
      toast('Subimos la imagen', 'ok')
      setAlt('')
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (error) {
      if (error instanceof ApiError)
        setErrors({
          alt: error.fieldErrors.alt,
          file: error.fieldErrors.file ?? (error.fieldErrors.alt ? undefined : error.message),
        })
    }
  }

  return (
    <section aria-labelledby="imagenes" className={styles.card}>
      <h2 id="imagenes">Imágenes</h2>
      <ul role="list" className={styles.images}>
        {product.images.map((img, i) => (
          <li key={`${img.url}-${i}`}>
            <figure>
              <ProductImage image={img} alt="" width={140} height={105} />
              <figcaption>{img.alt}</figcaption>
            </figure>
          </li>
        ))}
      </ul>
      <div className={styles.upload}>
        <TextField
          label="Texto alternativo"
          hint="Describe la imagen para quien no la ve. Es obligatorio."
          value={alt}
          error={errors.alt}
          onChange={(e) => setAlt(e.target.value)}
        />
        <TextField
          ref={fileRef}
          label="Imagen"
          hint="JPG o PNG, hasta 5 MB."
          type="file"
          accept="image/jpeg,image/png"
          error={errors.file}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <Button variant="outline" onClick={send} loading={upload.isPending}>
          Subir imagen
        </Button>
      </div>
    </section>
  )
}
