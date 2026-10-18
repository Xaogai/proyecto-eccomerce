import type { ReactNode } from 'react'
import { cx } from '@/lib/cx'
import {
  type OrderStatus,
  orderStatusInfo,
  type ProductStatus,
  productStatusInfo,
  type StockStatus,
  stockTone,
  type Tone,
} from '@/lib/orderStatus'
import styles from './Badge.module.css'

export function Badge({ tone = 'neutro', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cx(styles.badge, styles[tone], className)}>{children}</span>
}

/** Badge de estado de pedido; etiqueta y tono salen de lib/orderStatus.ts. */
export function StatusBadge({ status }: { status: OrderStatus }) {
  const { label, tone } = orderStatusInfo[status]
  return <Badge tone={tone}>{label}</Badge>
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const { label, tone } = productStatusInfo[status]
  return <Badge tone={tone}>{label}</Badge>
}

/** "12 en Toluca Centro", "Quedan 3…", "Agotado…": texto con color, nunca solo color. */
export function StockLabel({ status, children }: { status: StockStatus; children: ReactNode }) {
  return <span className={cx(styles.stock, styles[`stock-${stockTone[status]}`])}>{children}</span>
}
