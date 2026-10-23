import { zodResolver } from '@hookform/resolvers/zod'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/app/providers/authContext'
import { ErrorState, PageSkeleton } from '@/components/feedback/States'
import { Button, ButtonLink } from '@/components/ui/Button'
import { FormErrorSummary, RadioGroup, TextField, Textarea } from '@/components/ui/Field'
import { StarRatingInput } from '@/components/ui/StarRating'
import { useCreateReview } from '@/features/account/api'
import { useProduct } from '@/features/catalog/api'
import { usePageTitle } from '@/hooks/usePageTitle'
import styles from './account.module.css'

const MAX = 1000

const schema = z.object({
  rating: z.number().min(1, 'Elige de 1 a 5 estrellas.'),
  title: z.string().trim().min(1, 'Escribe un título.').max(60, 'Usa máximo 60 caracteres.'),
  body: z
    .string()
    .trim()
    .superRefine((v, ctx) => {
      if (v.length < 20)
        ctx.addIssue({
          code: 'custom',
          message: `Tu opinión tiene ${v.length} caracteres. Escribe al menos 20.`,
        })
    }),
  recommend: z.enum(['si', 'no']),
})
type Form = z.infer<typeof schema>

/** Escribir reseña (pantallas 37 y 47). Se publica después de moderación. */
export function ReviewPage() {
  const { sku = '' } = useParams()
  const [params] = useSearchParams()
  const orderId = params.get('pedido')
  const { user } = useAuth()
  const product = useProduct(sku, null)
  const create = useCreateReview(sku)
  usePageTitle(product.data ? `Reseña de ${product.data.name}` : 'Escribir reseña')
  const { control, register, handleSubmit, formState, setError } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { rating: 0, title: '', body: '', recommend: 'si' },
  })
  const body = useWatch({ control, name: 'body' })

  if (product.isPending) return <PageSkeleton label="Cargando producto" />
  if (!product.data) return <ErrorState headingLevel={1} title="No encontramos este producto" />

  const back = orderId
    ? { to: `/cuenta/pedidos/${orderId}`, label: 'Volver al pedido' }
    : { to: `/producto/${sku}`, label: product.data.name }
  const publicName = user ? `${user.name.split(' ')[0]} ${user.name.split(' ')[1]?.[0] ?? ''}.` : ''

  return (
    <>
      <Link to={back.to} className={styles.backLink}>
        <span aria-hidden="true">‹&nbsp;</span>
        {back.label}
      </Link>
      <div className={styles.productHead}>
        <img src={product.data.images[0]?.url} alt="" width={72} height={54} />
        <div>
          <span className={styles.muted}>Reseña de</span>
          <h1>{product.data.name}</h1>
        </div>
      </div>

      {create.isSuccess ? (
        <section role="status" className={styles.success}>
          <strong>Gracias por tu reseña</strong>
          <span>
            La revisamos y la publicamos en un máximo de 48 horas con la etiqueta "Compra verificada".
          </span>
          <div>
            <ButtonLink to={`/producto/${sku}`}>Ver el producto</ButtonLink>
          </div>
        </section>
      ) : (
        <form
          className={styles.section}
          noValidate
          onSubmit={(e) =>
            void handleSubmit(async (v) => {
              try {
                await create.mutateAsync({
                  rating: v.rating,
                  title: v.title,
                  body: v.body,
                  recommend: v.recommend === 'si',
                })
              } catch (error) {
                if (error instanceof ApiError) {
                  for (const [field, message] of Object.entries(error.fieldErrors))
                    setError(field as keyof Form, { message })
                }
              }
            })(e)
          }
        >
          {create.isError &&
            !(create.error instanceof ApiError && Object.keys(create.error.fieldErrors).length) && (
              <FormErrorSummary>No pudimos enviar tu reseña. Intenta de nuevo.</FormErrorSummary>
            )}
          <Controller
            control={control}
            name="rating"
            render={({ field, fieldState }) => (
              <StarRatingInput
                legend="Calificación general"
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
          <TextField
            label="Título"
            maxLength={60}
            error={formState.errors.title?.message}
            {...register('title')}
          />
          <Textarea
            label="Tu opinión"
            rows={5}
            maxLength={MAX}
            hint={`${body.length} de 1,000 caracteres · mínimo 20`}
            error={formState.errors.body?.message}
            {...register('body')}
          />
          <Controller
            control={control}
            name="recommend"
            render={({ field }) => (
              <RadioGroup
                legend="¿Lo recomendarías?"
                name="recomienda"
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: 'si', label: 'Sí' },
                  { value: 'no', label: 'No' },
                ]}
              />
            )}
          />
          <p className={styles.muted}>
            Publicamos tu nombre como "{publicName}" No incluyas datos personales en el texto.
          </p>
          <div>
            <Button type="submit" size="lg" loading={create.isPending}>
              Publicar reseña
            </Button>
          </div>
        </form>
      )}
    </>
  )
}
