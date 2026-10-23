import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api/errors'
import type { Address } from '@/api/schemas/auth'
import { useAuth } from '@/app/providers/authContext'
import { ErrorState, Skeleton } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/toastContext'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Checkbox, TextField } from '@/components/ui/Field'
import { InlineConfirm } from '@/components/ui/InlineConfirm'
import { useAddressBook, useDeleteAddress, useSaveAddress } from '@/features/account/api'
import { usePageTitle } from '@/hooks/usePageTitle'
import { plural } from '@/lib/format'
import styles from './account.module.css'

const schema = z.object({
  alias: z.string().trim().min(1, 'Ponle un nombre, por ejemplo Casa o Trabajo.'),
  name: z.string().trim().min(1, 'Escribe el nombre de quien recibe.'),
  street: z.string().trim().min(1, 'Escribe la calle.'),
  ext: z.string().trim().min(1, 'Escribe el número exterior.'),
  int: z.string().optional(),
  colony: z.string().trim().min(1, 'Escribe la colonia.'),
  zip: z.string().regex(/^\d{5}$/, 'El código postal tiene 5 dígitos.'),
  city: z.string().trim().min(1, 'Escribe la ciudad o municipio.'),
  state: z.string().trim().min(1, 'Escribe el estado.'),
  phone: z.string().refine((v) => v.replace(/\D/g, '').length === 10, 'El teléfono tiene 10 dígitos.'),
  references: z.string().optional(),
  is_default: z.boolean(),
})
type Form = z.infer<typeof schema>

/** Direcciones (pantallas 33 y 43): agregar, editar, hacer principal y eliminar con confirmación en línea. */
export function AddressesPage() {
  usePageTitle('Direcciones')
  const book = useAddressBook()
  const save = useSaveAddress()
  const remove = useDeleteAddress()
  const { announce } = useToast()
  const [editing, setEditing] = useState<Address | 'nueva' | null>(null)
  const [asking, setAsking] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const say = (text: string) => {
    setMessage(text)
    announce(text)
  }

  return (
    <>
      <div className={styles.titleRow}>
        <h1>Direcciones</h1>
        <Button
          onClick={() => setEditing(editing === 'nueva' ? null : 'nueva')}
          aria-expanded={editing === 'nueva'}
        >
          Agregar dirección
        </Button>
      </div>
      <p className={styles.muted}>
        {message || (book.data ? `${plural(book.data.length, 'dirección', 'direcciones')} guardadas` : '')}
      </p>

      {editing === 'nueva' && (
        <AddressForm
          onCancel={() => setEditing(null)}
          onSaved={(a) => {
            setEditing(null)
            say(`Guardamos "${a.alias}"`)
          }}
          isFirst={!book.data?.length}
        />
      )}

      {book.isError ? (
        <ErrorState title="No pudimos cargar tus direcciones" onRetry={() => book.refetch()} />
      ) : book.isPending ? (
        <Skeleton height={140} />
      ) : (
        <ul role="list" className={styles.addressGrid}>
          {book.data.map((a) => (
            <li key={a.id}>
              {editing !== 'nueva' && editing?.id === a.id ? (
                <AddressForm
                  address={a}
                  onCancel={() => setEditing(null)}
                  onSaved={(saved) => {
                    setEditing(null)
                    say(`Actualizamos "${saved.alias}"`)
                  }}
                />
              ) : (
                <article className={`${styles.addressCard} ${a.is_default ? styles.addressDefault : ''}`}>
                  <h2>
                    {a.alias}
                    {a.is_default && <Badge tone="info">Principal</Badge>}
                  </h2>
                  <span>
                    {a.street} {a.ext}
                    {a.int && `, ${a.int}`}, {a.colony}
                  </span>
                  <span className={styles.muted}>
                    {a.city}, {a.state} · CP {a.zip}
                  </span>
                  {asking === a.id ? (
                    <InlineConfirm
                      question={`¿Eliminar "${a.alias}"? No se puede deshacer.`}
                      loading={remove.isPending}
                      onCancel={() => setAsking(null)}
                      onConfirm={() =>
                        remove.mutate(a.id, {
                          onSuccess: () => {
                            setAsking(null)
                            say(`Eliminamos "${a.alias}"`)
                          },
                        })
                      }
                    />
                  ) : (
                    <div className={styles.actions}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(a)}
                        aria-label={`Editar ${a.alias}`}
                      >
                        Editar
                      </Button>
                      {!a.is_default && (
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={`Hacer principal ${a.alias}`}
                          onClick={() =>
                            save.mutate(
                              { id: a.id, is_default: true },
                              { onSuccess: () => say(`"${a.alias}" es ahora tu dirección principal`) },
                            )
                          }
                        >
                          Hacer principal
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAsking(a.id)}
                        aria-label={`Eliminar ${a.alias}`}
                      >
                        Eliminar
                      </Button>
                    </div>
                  )}
                </article>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

interface AddressFormProps {
  address?: Address
  isFirst?: boolean
  onSaved: (address: Address) => void
  onCancel: () => void
}

function AddressForm({ address, isFirst, onSaved, onCancel }: AddressFormProps) {
  const { user } = useAuth()
  const save = useSaveAddress()
  const { register, handleSubmit, formState, setError } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: address
      ? { ...address, int: address.int ?? '', references: address.references ?? '' }
      : {
          alias: '',
          name: user?.name ?? '',
          street: '',
          ext: '',
          int: '',
          colony: '',
          zip: '',
          city: '',
          state: '',
          phone: '',
          references: '',
          is_default: !!isFirst,
        },
  })
  const e = formState.errors

  async function submit(values: Form) {
    try {
      const saved = await save.mutateAsync({ ...values, id: address?.id })
      onSaved(saved)
    } catch (error) {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fieldErrors))
          setError(field as keyof Form, { message })
      }
    }
  }

  return (
    <form
      className={styles.card}
      noValidate
      onSubmit={(ev) => void handleSubmit(submit)(ev)}
      aria-label={address ? `Editar ${address.alias}` : 'Nueva dirección'}
    >
      <div className={styles.grid2}>
        <TextField
          label="Nombre de la dirección"
          placeholder="Ej. Trabajo"
          error={e.alias?.message}
          {...register('alias')}
        />
        <TextField label="Quién recibe" autoComplete="name" error={e.name?.message} {...register('name')} />
        <TextField
          label="Calle"
          autoComplete="address-line1"
          error={e.street?.message}
          {...register('street')}
        />
        <div className={styles.grid2}>
          <TextField label="Número exterior" error={e.ext?.message} {...register('ext')} />
          <TextField label="Interior" optional {...register('int')} />
        </div>
        <TextField label="Colonia" error={e.colony?.message} {...register('colony')} />
        <TextField
          label="Código postal"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={5}
          error={e.zip?.message}
          {...register('zip')}
        />
        <TextField
          label="Ciudad o municipio"
          autoComplete="address-level2"
          error={e.city?.message}
          {...register('city')}
        />
        <TextField
          label="Estado"
          autoComplete="address-level1"
          error={e.state?.message}
          {...register('state')}
        />
        <TextField
          label="Teléfono de contacto"
          type="tel"
          autoComplete="tel"
          error={e.phone?.message}
          {...register('phone')}
        />
        <TextField label="Referencias" optional {...register('references')} />
      </div>
      {!address?.is_default && <Checkbox label="Usar como dirección principal" {...register('is_default')} />}
      <div className={styles.actions}>
        <Button type="submit" loading={save.isPending}>
          Guardar
        </Button>
        <Button variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
