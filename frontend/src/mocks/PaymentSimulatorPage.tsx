import { useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { send } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { Button } from '@/components/ui/Button'
import { useOrder } from '@/features/checkout/api'
import { usePageTitle } from '@/hooks/usePageTitle'
import { formatMoney } from '@/lib/format'
import styles from '@/pages/checkout/checkout.module.css'

/**
 * Sustituye a la pasarela hospedada SOLO con datos de prueba. No pide datos de tarjeta:
 * simula la decisión del banco y el webhook que la pasarela manda a backend (Doc 13.1).
 */
export function PaymentSimulatorPage() {
  usePageTitle('Pasarela de pago simulada')
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const token = params.get('token') ?? undefined
  const navigate = useNavigate()
  const [startedAt] = useState(() => Date.now())
  const order = useOrder(id, token, startedAt)
  const [sending, setSending] = useState(false)

  async function finish(result: 'aprobado' | 'rechazado') {
    setSending(true)
    await send('post', endpoints.paymentWebhook, z.unknown(), { order_id: id, result })
    navigate(`/pedido/${id}/confirmacion${token ? `?token=${encodeURIComponent(token)}` : ''}`, {
      replace: true,
    })
  }

  return (
    <section className={`${styles.step} ${styles.gateway}`} aria-labelledby="pasarela">
      <h1 id="pasarela">Pasarela de pago</h1>
      <p className={styles.gatewayNote}>
        Página simulada (solo con datos de prueba). En producción aquí está la página segura de la pasarela.
      </p>
      {order.data && (
        <p>
          Pedido {order.data.folio} · <strong>{formatMoney(order.data.totals.total)}</strong>
        </p>
      )}
      <div className={styles.actions}>
        <Button onClick={() => finish('aprobado')} loading={sending}>
          Aprobar pago
        </Button>
        <Button variant="outline" onClick={() => finish('rechazado')} disabled={sending}>
          Rechazar pago
        </Button>
      </div>
    </section>
  )
}
