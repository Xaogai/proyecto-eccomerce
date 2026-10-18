import { createContext, useContext } from 'react'
import type { Tone } from '@/lib/orderStatus'

export interface ToastContextValue {
  /** Aviso visible que se lee en voz alta ("Agregado al carrito"). */
  toast: (message: string, tone?: Tone) => void
  /** Solo para lectores de pantalla ("2 filtros activos", "Mostrando 24 productos"). */
  announce: (message: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}
