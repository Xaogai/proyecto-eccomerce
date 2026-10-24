import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError } from '@/api/errors'
import type { Handover } from '@/api/schemas/branch'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Checkbox, FieldError, TextField } from '@/components/ui/Field'
import { useHandover, useVerifyPickup } from '@/features/branch/api'
import { BranchPicker } from '@/features/branch/BranchPicker'
import { usePageTitle } from '@/hooks/usePageTitle'
import { plural } from '@/lib/format'
import styles from './branch.module.css'

type Step = { name: 'code' } | { name: 'check'; order: Handover } | { name: 'done'; order: Handover }

/**
 * Entregar pedido (pantalla 59, pensada para el celular del mostrador). Por pasos:
 * código que dicta el cliente → revisar identificación y productos → entregado.
 */
export function HandoverPage() {
  usePageTitle('Entregar pedido · Sucursal')
  const { id } = useParams()
  const [step, setStep] = useState<Step>({ name: 'code' })
  const [code, setCode] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)

  // Cada paso nuevo lleva el foco a su título para que el lector de pantalla lo anuncie.
  useEffect(() => {
    if (step.name !== 'code') headingRef.current?.focus()
  }, [step.name])

  return (
    <div className={styles.handover}>
      <Link to="/sucursal/recoleccion" className={styles.backLink}>
        ‹ Pedidos para recoger
      </Link>
      <h1>Entregar pedido</h1>
      <BranchPicker />

      {step.name === 'code' && (
        <CodeStep
          orderId={id}
          code={code}
          onCode={setCode}
          onFound={(order) => setStep({ name: 'check', order })}
        />
      )}
      {step.name === 'check' && (
        <CheckStep
          headingRef={headingRef}
          order={step.order}
          code={code}
          onBack={() => setStep({ name: 'code' })}
          onDelivered={(order) => setStep({ name: 'done', order })}
        />
      )}
      {step.name === 'done' && (
        <section role="status" className={styles.done}>
          <h2 ref={headingRef} tabIndex={-1}>
            Pedido {step.order.folio} entregado
          </h2>
          <p>Enviamos el comprobante a {step.order.email}.</p>
          <div className={styles.actions}>
            <ButtonLink to="/sucursal/recoleccion">Volver a pedidos</ButtonLink>
            <Button
              variant="outline"
              onClick={() => {
                setCode('')
                setStep({ name: 'code' })
              }}
            >
              Entregar otro pedido
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

function CodeStep({
  orderId,
  code,
  onCode,
  onFound,
}: {
  orderId?: string
  code: string
  onCode: (code: string) => void
  onFound: (order: Handover) => void
}) {
  const verify = useVerifyPickup()
  const [error, setError] = useState<string>()

  return (
    <form
      noValidate
      className={styles.step}
      onSubmit={async (e) => {
        e.preventDefault()
        if (!/^\d{4}$/.test(code.trim())) return setError('Escribe los 4 dígitos del código.')
        try {
          onFound(await verify.mutateAsync({ pickup_code: code.trim(), order_id: orderId }))
        } catch (err) {
          setError(
            err instanceof ApiError
              ? (err.fieldErrors.pickup_code ?? err.message)
              : 'No pudimos buscar el pedido.',
          )
        }
      }}
    >
      <TextField
        label="Código de entrega del cliente"
        hint="Pídelo al cliente junto con su identificación oficial. Lo recibió por correo y está en Mis pedidos."
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        className={styles.codeInput}
        value={code}
        error={error}
        onChange={(e) => {
          onCode(e.target.value.replace(/\D/g, ''))
          setError(undefined)
        }}
      />
      <Button type="submit" size="lg" fullWidth loading={verify.isPending}>
        Buscar pedido
      </Button>
    </form>
  )
}

function CheckStep({
  headingRef,
  order,
  code,
  onBack,
  onDelivered,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>
  order: Handover
  code: string
  onBack: () => void
  onDelivered: (order: Handover) => void
}) {
  const handover = useHandover()
  const [idChecked, setIdChecked] = useState(false)
  const [itemsChecked, setItemsChecked] = useState(false)
  const [error, setError] = useState<string>()

  return (
    <section aria-labelledby="entrega-pedido" className={styles.step}>
      <h2 id="entrega-pedido" ref={headingRef} tabIndex={-1}>
        Pedido {order.folio} · {order.customer}
      </h2>
      <span className={styles.muted}>
        Estante {order.shelf}
        {order.payment_label && ` · pagado con ${order.payment_label}`}
      </span>
      <ul className={styles.items}>
        {order.items.map((i) => (
          <li key={`${i.name}-${i.variant_label}`}>
            {i.name}
            {i.variant_label !== 'Única' &&
              `, ${i.variant_label.charAt(0).toLowerCase()}${i.variant_label.slice(1)}`}{' '}
            × {i.qty}
          </li>
        ))}
      </ul>
      <p className={styles.muted}>
        {plural(
          order.items.reduce((n, i) => n + i.qty, 0),
          'pieza',
        )}{' '}
        en total.
      </p>

      <fieldset className={styles.checks} aria-describedby={error ? 'checks-error' : undefined}>
        <legend>Antes de entregar</legend>
        <Checkbox
          label={`El nombre coincide con la identificación (${order.customer})`}
          checked={idChecked}
          onChange={(e) => {
            setIdChecked(e.target.checked)
            setError(undefined)
          }}
        />
        <Checkbox
          label="El cliente revisó los productos"
          checked={itemsChecked}
          onChange={(e) => {
            setItemsChecked(e.target.checked)
            setError(undefined)
          }}
        />
        {error && <FieldError id="checks-error">{error}</FieldError>}
      </fieldset>

      <Button
        size="lg"
        fullWidth
        loading={handover.isPending}
        onClick={async () => {
          if (!idChecked || !itemsChecked) return setError('Marca las dos casillas antes de entregar.')
          try {
            onDelivered(
              await handover.mutateAsync({
                id: order.id,
                pickup_code: code,
                id_checked: true,
                items_checked: true,
              }),
            )
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'No pudimos registrar la entrega.')
          }
        }}
      >
        Confirmar entrega
      </Button>
      <Button variant="ghost" fullWidth onClick={onBack}>
        Cambiar código
      </Button>
    </section>
  )
}
