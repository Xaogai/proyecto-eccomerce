import { createContext, useContext } from 'react'

/** Sucursal y CP elegidos por el visitante (G3: visibles en el encabezado). */
export interface SelectedStore {
  id: string
  name: string
  zip: string
}

export interface StoreContextValue {
  store: SelectedStore | null
  setStore: (store: SelectedStore) => void
  /** Abre el diálogo para elegir sucursal (encabezado, inicio, ficha) */
  openPicker: () => void
}

export const StoreContext = createContext<StoreContextValue | null>(null)

export function useSelectedStore(): StoreContextValue {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useSelectedStore debe usarse dentro de <StoreProvider>')
  return ctx
}
