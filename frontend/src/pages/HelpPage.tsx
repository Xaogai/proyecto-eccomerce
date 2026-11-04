import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Breadcrumbs } from '@/components/ui/Breadcrumbs'
import { SITE_NAME, usePageTitle } from '@/hooks/usePageTitle'
import { NotFoundPage } from './NotFoundPage'
import styles from './pages.module.css'

// Textos del pie de página (G1, sec. 6.1 transparencia y 4.5 LFPDPPP).
// Son un borrador de trabajo: el texto legal definitivo lo debe validar el responsable del negocio.

const topics: Record<string, { title: string; body: ReactNode }> = {
  privacidad: {
    title: 'Aviso de privacidad',
    body: (
      <>
        <p>
          {SITE_NAME} es responsable del tratamiento de los datos personales que nos proporcionas al crear tu
          cuenta, comprar o contactarnos, conforme a la Ley Federal de Protección de Datos Personales en
          Posesión de los Particulares.
        </p>
        <h2>Qué datos usamos y para qué</h2>
        <ul>
          <li>Nombre, correo y teléfono: para crear tu cuenta y avisarte del estado de tus pedidos.</li>
          <li>Direcciones: para entregar tus compras.</li>
          <li>Historial de compras: para darte seguimiento, devoluciones y garantías.</li>
        </ul>
        <p>No guardamos los datos de tu tarjeta: el pago se hace en la pasarela de pago, que los protege.</p>
        <h2>Tus derechos ARCO</h2>
        <p>
          Puedes acceder, rectificar, cancelar u oponerte al uso de tus datos desde{' '}
          <Link to="/cuenta/datos">Mi cuenta · Datos y privacidad</Link>.
        </p>
      </>
    ),
  },
  envios: {
    title: 'Envíos y plazos',
    body: (
      <>
        <h2>Recoger en sucursal</h2>
        <p>
          Gratis. Tu pedido está listo en 2 horas cuando hay stock en la sucursal; te avisamos por correo.
        </p>
        <h2>Envío a domicilio</h2>
        <p>
          El costo y el plazo dependen de tu código postal. Los ves en la ficha del producto y en el checkout
          antes de pagar. En la zona de Toluca el plazo habitual es de 3 a 5 días hábiles.
        </p>
      </>
    ),
  },
  devoluciones: {
    title: 'Devoluciones',
    body: (
      <>
        <p>Puedes solicitar una devolución desde el detalle de tu pedido en Mi cuenta.</p>
        <ul>
          <li>El producto debe estar sin uso y con su empaque.</li>
          <li>Puedes entregarlo en cualquier sucursal o pedir la recolección a domicilio.</li>
          <li>El reembolso se hace al mismo método de pago.</li>
        </ul>
      </>
    ),
  },
}

export function HelpPage() {
  const { tema = '' } = useParams()
  const topic = topics[tema]
  usePageTitle(topic?.title)
  if (!topic) return <NotFoundPage />

  return (
    <>
      <Breadcrumbs items={[{ label: 'Inicio', to: '/' }, { label: topic.title }]} />
      <article className={`${styles.card} ${styles.prose}`}>
        <h1>{topic.title}</h1>
        {topic.body}
      </article>
    </>
  )
}
