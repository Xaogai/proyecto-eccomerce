import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '@/api/errors'
import { useAuth } from '@/app/providers/authContext'
import { useFeatureFlag } from '@/app/featureFlags'
import { useSelectedStore } from '@/app/providers/storeContext'
import { ErrorState, PageSkeleton, QueueState } from '@/components/feedback/States'
import { LockIcon } from '@/components/layout/icons'
import { Button } from '@/components/ui/Button'
import { FieldError, FormErrorSummary, TextField } from '@/components/ui/Field'
import { useCart, useDeliveryMode } from '@/features/cart/api'
import { useShippingQuote } from '@/features/catalog/api'
import {
  type CheckoutInput,
  goToPayment,
  useAddresses,
  useCheckout,
  useStoresForCart,
} from '@/features/checkout/api'
import { apiFieldMap, type CheckoutForm, checkoutFormSchema } from '@/features/checkout/form'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatMoney, plural } from '@/lib/format'
import styles from './checkout.module.css'

interface Queue {
  position: number
  progress: number
}

/**
 * Checkout (pantallas 05 y 12; HU-06 y HU-07). Invitado o con sesión, recoger o envío.
 * Nunca pide datos de tarjeta: al pagar se redirige a la pasarela hospedada (sec. 4.4, SAQ A).
 */
export function CheckoutPage() {
  usePageTitle('Checkout')
  const { user, status } = useAuth()
  const { store } = useSelectedStore()
  const cart = useCart()
  const addresses = useAddresses()
  const checkout = useCheckout()
  const queueOn = useFeatureFlag('queue')
  const [mode] = useDeliveryMode()
  const [queue, setQueue] = useState<Queue | null>(null)
  const [submitError, setSubmitError] = useState<string>()
  const summaryRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const form = useForm<CheckoutForm>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      phone: '',
      fulfillment: mode === 'envio' ? 'ship' : 'pickup',
      storeId: store?.id,
      addressId: 'nueva',
      zip: store?.zip ?? '',
    },
  })
  const { register, handleSubmit, setValue, setError, formState } = form
  const errors = formState.errors
  const [fulfillment, storeId, addressId, zip] = useWatch({
    control: form.control,
    name: ['fulfillment', 'storeId', 'addressId', 'zip'],
  })

  // Con sesión: nombre, correo y dirección predeterminada ya puestos.
  useEffect(() => {
    if (user) {
      setValue('name', user.name)
      setValue('email', user.email)
    }
  }, [user, setValue])
  const defaultAddress = addresses.data?.find((a) => a.is_default) ?? addresses.data?.[0]
  useEffect(() => {
    if (defaultAddress) setValue('addressId', defaultAddress.id)
  }, [defaultAddress, setValue])

  const items = cart.data?.items
  const stores = useStoresForCart(items, store?.zip)
  const savedAddress = addresses.data?.find((a) => a.id === addressId)
  const shipZip = savedAddress?.zip ?? (/^\d{5}$/.test(zip ?? '') ? zip : undefined)
  const quote = useShippingQuote(fulfillment === 'ship' ? shipZip : store?.zip)

  // Si la sucursal elegida no tiene todo el pedido, se propone la primera que sí.
  useEffect(() => {
    if (!stores.data) return
    const current = stores.data.find((s) => s.id === storeId)
    if (!current?.all_available) {
      const first = stores.data.find((s) => s.all_available)
      if (first) setValue('storeId', first.id)
    }
  }, [stores.data, storeId, setValue])

  if (cart.isPending || status === 'cargando') return <PageSkeleton label="Preparando el checkout" />
  if (cart.isError || !cart.data)
    return <ErrorState headingLevel={1} title="No pudimos cargar tu pedido" onRetry={() => cart.refetch()} />
  if (cart.data.items.length === 0 && !checkout.isSuccess) return <Navigate to="/carrito" replace />

  const subtotal = cart.data.subtotal
  const shipping = fulfillment === 'ship' ? (quote.data?.available ? quote.data.cost : null) : 0
  const total = subtotal + (shipping ?? 0)
  const chosenStore = stores.data?.find((s) => s.id === storeId)

  async function submit(values: CheckoutForm) {
    setSubmitError(undefined)
    const input: CheckoutInput = {
      contact: { name: values.name, email: values.email, phone: values.phone },
      fulfillment: values.fulfillment,
      ...(values.fulfillment === 'pickup'
        ? { store_id: values.storeId }
        : values.addressId && values.addressId !== 'nueva'
          ? { address_id: values.addressId }
          : {
              address: {
                street: values.street!,
                ext: values.ext!,
                int: values.int || undefined,
                colony: values.colony!,
                zip: values.zip!,
                city: values.city!,
                state: values.state!,
                references: values.references || undefined,
              },
            }),
    }
    try {
      const result = await checkout.mutateAsync(input)
      setQueue(null)
      // A la pasarela hospedada. Al terminar regresa a /pedido/:id/confirmacion.
      goToPayment(result.payment_url, navigate)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.code === 'queue' && queueOn) {
        setQueue({ position: Number(error.data.position) || 1, progress: Number(error.data.progress) || 0 })
        window.setTimeout(() => void handleSubmit(submit)(), (Number(error.data.retry_after_s) || 3) * 1000)
        return
      }
      setQueue(null)
      for (const [field, message] of Object.entries(error.fieldErrors)) {
        const target = apiFieldMap[field]
        if (target) setError(target, { message })
      }
      setSubmitError(
        error.code === 'out_of_stock'
          ? 'Algunos productos ya no tienen stock suficiente para esta forma de entrega. Revisa tu carrito o elige otra sucursal.'
          : error.message,
      )
      summaryRef.current?.focus()
    }
  }

  const errorCount = Object.keys(errors).length
  const onInvalid = () => window.requestAnimationFrame(() => summaryRef.current?.focus())

  if (queue) {
    return (
      <>
        <h1>Checkout</h1>
        <QueueState position={queue.position} progress={queue.progress} />
      </>
    )
  }

  return (
    <>
      <h1>Checkout</h1>
      <div className={styles.columns}>
        <form
          id="checkout"
          className={`${styles.main} ${styles.form}`}
          onSubmit={(e) => void handleSubmit(submit, onInvalid)(e)}
          noValidate
        >
          <div ref={summaryRef} tabIndex={-1}>
            {errorCount > 0 && (
              <FormErrorSummary>Revisa {plural(errorCount, 'campo')} antes de continuar.</FormErrorSummary>
            )}
            {submitError && (
              <FormErrorSummary>
                {submitError} <Link to="/carrito">Ir al carrito</Link>
              </FormErrorSummary>
            )}
          </div>

          <section aria-labelledby="paso-datos" className={styles.step}>
            <h2 id="paso-datos" className={styles.stepTitle}>
              <span className={styles.stepNum} aria-hidden="true">
                1
              </span>
              Tus datos
            </h2>
            {!user && (
              <div className={styles.guestBox}>
                <span>Compras como invitado. Te enviaremos la confirmación a tu correo.</span>
                <Link to="/cuenta/login?next=%2Fcheckout">Iniciar sesión o crear cuenta</Link>
              </div>
            )}
            <div className={styles.grid2}>
              <TextField
                label="Nombre completo"
                autoComplete="name"
                error={errors.name?.message}
                {...register('name')}
              />
              <TextField
                label="Teléfono"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                hint="10 dígitos"
                error={errors.phone?.message}
                {...register('phone')}
              />
              <TextField
                label="Correo electrónico"
                type="email"
                autoComplete="email"
                fieldClassName={styles.span2}
                error={errors.email?.message}
                {...register('email')}
              />
            </div>
          </section>

          <section aria-labelledby="paso-entrega" className={styles.step}>
            <h2 id="paso-entrega" className={styles.stepTitle}>
              <span className={styles.stepNum} aria-hidden="true">
                2
              </span>
              Entrega
            </h2>
            <fieldset className={`${styles.options} ${styles.twoCols}`}>
              <legend className="sr-only">Cómo quieres recibir tu pedido</legend>
              <label className={styles.option}>
                <input type="radio" value="pickup" {...register('fulfillment')} />
                <span className={styles.optionText}>
                  <span className={styles.optionTitle}>Recoger en tienda</span>
                  <span className={styles.muted}>Gratis · listo en 2 horas</span>
                </span>
              </label>
              <label className={styles.option}>
                <input type="radio" value="ship" {...register('fulfillment')} />
                <span className={styles.optionText}>
                  <span className={styles.optionTitle}>Envío a domicilio</span>
                  <span className={styles.muted}>
                    {quote.data?.available
                      ? `${formatMoney(quote.data.cost)} a CP ${quote.data.zip} · ${quote.data.eta_min_days} a ${quote.data.eta_max_days} días hábiles`
                      : 'Costo según tu código postal'}
                  </span>
                </span>
              </label>
            </fieldset>

            {fulfillment === 'pickup' ? (
              <fieldset
                className={styles.options}
                aria-describedby={errors.storeId ? 'err-sucursal' : undefined}
              >
                <legend className={styles.legend}>Sucursales con stock de tu pedido</legend>
                {stores.isPending && <p className={styles.muted}>Buscando sucursales…</p>}
                {stores.data?.map((s) => (
                  <label key={s.id} className={styles.option}>
                    <input type="radio" value={s.id} disabled={!s.all_available} {...register('storeId')} />
                    <span className={styles.optionText}>
                      <span className={styles.optionTitle}>
                        {s.name}
                        {s.distance_km !== undefined && ` · ${s.distance_km.toFixed(1)} km`}
                      </span>
                      <span className={s.all_available ? styles.noteOk : styles.noteError}>
                        {s.all_available ? 'Todo disponible' : 'No tiene todo tu pedido'}
                      </span>
                      <span className={styles.muted}>
                        {s.address} · {s.hours}
                      </span>
                    </span>
                  </label>
                ))}
                {stores.data && !stores.data.some((s) => s.all_available) && (
                  <p className={styles.noteError}>
                    Ninguna sucursal tiene todo tu pedido. Elige envío a domicilio.
                  </p>
                )}
                {errors.storeId && <FieldError id="err-sucursal">{errors.storeId.message}</FieldError>}
                <p className={styles.muted}>
                  Solo puedes elegir sucursales con todos tus productos.{' '}
                  <Link to="/sucursales">Ver todas las sucursales</Link>
                </p>
              </fieldset>
            ) : (
              <>
                {addresses.data && addresses.data.length > 0 && (
                  <fieldset className={styles.options}>
                    <legend className={styles.legend}>Dirección de entrega</legend>
                    {addresses.data.map((a) => (
                      <label key={a.id} className={styles.option}>
                        <input type="radio" value={a.id} {...register('addressId')} />
                        <span className={styles.optionText}>
                          <span className={styles.optionTitle}>{a.alias}</span>
                          <span className={styles.muted}>
                            {a.street} {a.ext}
                            {a.int && `, ${a.int}`}, {a.colony}, CP {a.zip}, {a.city}
                          </span>
                        </span>
                      </label>
                    ))}
                    <label className={styles.option}>
                      <input type="radio" value="nueva" {...register('addressId')} />
                      <span className={styles.optionTitle}>Otra dirección</span>
                    </label>
                  </fieldset>
                )}
                {(!addresses.data?.length || addressId === 'nueva') && (
                  <div className={styles.grid2}>
                    <TextField
                      label="Calle"
                      autoComplete="address-line1"
                      error={errors.street?.message}
                      {...register('street')}
                    />
                    <div className={styles.grid2}>
                      <TextField label="Número exterior" error={errors.ext?.message} {...register('ext')} />
                      <TextField label="Interior" optional {...register('int')} />
                    </div>
                    <TextField
                      label="Colonia"
                      autoComplete="address-level3"
                      error={errors.colony?.message}
                      {...register('colony')}
                    />
                    <TextField
                      label="Código postal"
                      inputMode="numeric"
                      autoComplete="postal-code"
                      maxLength={5}
                      hint={
                        quote.data?.available
                          ? `Con el CP calculamos el costo: ${formatMoney(quote.data.cost)}`
                          : 'Con el CP calculamos el costo de envío.'
                      }
                      error={errors.zip?.message}
                      {...register('zip')}
                    />
                    <TextField
                      label="Ciudad o municipio"
                      autoComplete="address-level2"
                      error={errors.city?.message}
                      {...register('city')}
                    />
                    <TextField
                      label="Estado"
                      autoComplete="address-level1"
                      error={errors.state?.message}
                      {...register('state')}
                    />
                    <TextField
                      label="Referencias"
                      optional
                      fieldClassName={styles.span2}
                      {...register('references')}
                    />
                  </div>
                )}
              </>
            )}
          </section>

          <section aria-labelledby="paso-pago" className={styles.step}>
            <h2 id="paso-pago" className={styles.stepTitle}>
              <span className={styles.stepNum} aria-hidden="true">
                3
              </span>
              Pago
            </h2>
            <div className={styles.payBox}>
              <LockIcon size={22} />
              <p>
                Pagarás con tarjeta en la página segura de nuestra <strong>pasarela de pago</strong>. Este
                sitio no pide ni guarda los datos de tu tarjeta. Al terminar regresarás aquí para ver tu
                pedido.
              </p>
            </div>
          </section>
        </form>

        <aside aria-labelledby="tu-pedido" className={styles.summary}>
          <h2 id="tu-pedido" className={styles.summaryTitle}>
            Tu pedido
          </h2>
          <ul className={styles.orderLines}>
            {cart.data.items.map((i) => (
              <li key={i.id} className={styles.orderLine}>
                <span>
                  {i.name} × {i.qty}
                </span>
                <span>{formatMoney(i.unit_price * i.qty)}</span>
              </li>
            ))}
          </ul>
          <dl className={styles.totals}>
            <div>
              <dt>Subtotal</dt>
              <dd>{formatMoney(subtotal)}</dd>
            </div>
            <div>
              <dt>
                {fulfillment === 'ship'
                  ? shipZip
                    ? `Envío a CP ${shipZip}`
                    : 'Envío a domicilio'
                  : `Recoger en ${chosenStore?.name ?? 'tienda'}`}
              </dt>
              <dd>{shipping === 0 ? 'Gratis' : shipping === null ? 'Falta tu CP' : formatMoney(shipping)}</dd>
            </div>
            <div className={styles.totalRow}>
              <dt>Total</dt>
              <dd aria-live="polite">{formatMoney(total)}</dd>
            </div>
          </dl>
          <div className={styles.payBar}>
            <Button
              type="submit"
              form="checkout"
              size="lg"
              fullWidth
              loading={formState.isSubmitting || checkout.isPending}
            >
              Pagar {formatMoney(total)}
            </Button>
            <span className={styles.muted}>
              Al pagar aceptas la <Link to="/ayuda/devoluciones">política de devoluciones</Link> y el{' '}
              <Link to="/ayuda/privacidad">aviso de privacidad</Link>.
            </span>
          </div>
        </aside>
      </div>
    </>
  )
}
