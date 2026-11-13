import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { ApiError } from '@/api/errors'
import type { StaffCreated } from '@/api/schemas/admin'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { FormErrorSummary, RadioGroup, Select, TextField } from '@/components/ui/Field'
import { useAllStores, useUserActions } from '@/features/admin/api'
import styles from './admin.module.css'

const schema = z
  .object({
    name: z.string().trim().min(2, 'Escribe el nombre completo.'),
    email: z.string().trim().email('Escribe un correo válido, por ejemplo nombre@ferremarket.mx.'),
    role: z.enum(['staff', 'admin']),
    branch_id: z.string(),
  })
  .refine((v) => v.role !== 'staff' || v.branch_id, { path: ['branch_id'], message: 'Elige su sucursal.' })
type Form = z.infer<typeof schema>

const FORM_ID = 'invitar-personal'

/** Alta de staff o admin (pantalla 54, "Invitar personal"): la cuenta nace con contraseña temporal. */
export function InviteStaffDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: (created?: StaffCreated) => void
}) {
  const stores = useAllStores()
  const { create } = useUserActions()
  const [created, setCreated] = useState<StaffCreated | null>(null)
  const [copied, setCopied] = useState(false)
  const { register, control, handleSubmit, formState, setError, reset } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', role: 'staff', branch_id: '' },
  })
  const role = useWatch({ control, name: 'role' })

  const close = () => {
    const result = created
    reset()
    create.reset()
    setCreated(null)
    setCopied(false)
    onClose(result ?? undefined)
  }

  const submit = handleSubmit(async ({ branch_id, ...values }) => {
    try {
      setCreated(
        await create.mutateAsync({ ...values, branch_id: values.role === 'staff' ? branch_id : null }),
      )
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.code === 'email_taken') setError('email', { message: error.message })
      for (const field of ['name', 'email', 'branch_id'] as const) {
        const message = error.fieldErrors[field]
        if (message) setError(field, { message })
      }
    }
  })

  if (created) {
    return (
      <Dialog
        open={open}
        onClose={close}
        title="Cuenta creada"
        footer={<Button onClick={close}>Listo</Button>}
      >
        <p>
          <strong>{created.name}</strong> ya puede entrar con <strong>{created.email}</strong> y esta
          contraseña temporal:
        </p>
        <p className={styles.secret}>{created.temporary_password}</p>
        <div className={styles.actions}>
          <Button
            variant="outline"
            onClick={async () => {
              await navigator.clipboard?.writeText(created.temporary_password)
              setCopied(true)
            }}
          >
            {copied ? 'Copiada' : 'Copiar contraseña'}
          </Button>
        </div>
        <p className={styles.muted} role="status">
          Es la única vez que la verás. Entrégala en persona o por un canal seguro; al entrar por primera vez,{' '}
          {created.name.split(' ')[0]} tendrá que cambiarla por una propia.
        </p>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Invitar personal"
      footer={
        <>
          <Button variant="outline" onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" form={FORM_ID} loading={create.isPending}>
            Crear cuenta
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate className={styles.dialogForm} onSubmit={(e) => void submit(e)}>
        <TextField
          label="Nombre completo"
          autoComplete="off"
          error={formState.errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Correo de trabajo"
          type="email"
          autoComplete="off"
          error={formState.errors.email?.message}
          {...register('email')}
        />
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <RadioGroup
              legend="Rol"
              name="rol-personal"
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: 'staff', label: 'Staff de sucursal: inventario y recolecciones de su sucursal' },
                { value: 'admin', label: 'Administrador: todo el panel' },
              ]}
            />
          )}
        />
        {role === 'staff' && (
          <Select label="Sucursal" error={formState.errors.branch_id?.message} {...register('branch_id')}>
            <option value="">Elige una sucursal</option>
            {stores.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        )}
        {create.isError &&
          !(
            create.error instanceof ApiError &&
            (create.error.code === 'email_taken' || Object.keys(create.error.fieldErrors).length)
          ) && <FormErrorSummary>No pudimos crear la cuenta. Intenta de nuevo.</FormErrorSummary>}
        <p className={styles.muted}>
          La cuenta se crea con una contraseña temporal que verás una sola vez. Al entrar, la persona tendrá
          que cambiarla.
        </p>
      </form>
    </Dialog>
  )
}
