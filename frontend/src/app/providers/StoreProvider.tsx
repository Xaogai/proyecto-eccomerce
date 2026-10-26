import { type ReactNode, useMemo, useState } from 'react'
import { StoreDialog } from '@/components/layout/StoreSelector'
import { readJson, writeJson } from '@/lib/storage'
import { type SelectedStore, StoreContext } from './storeContext'

const KEY = 'taller.sucursal'

/**
 * Sucursal elegida por la persona (se guarda en el navegador) y el diálogo para cambiarla.
 * Se lee con el hook de `storeContext`.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStoreState] = useState<SelectedStore | null>(() =>
    readJson<SelectedStore | null>(KEY, null),
  )
  const [pickerOpen, setPickerOpen] = useState(false)

  const value = useMemo(
    () => ({
      store,
      setStore: (next: SelectedStore) => {
        writeJson(KEY, next)
        setStoreState(next)
      },
      openPicker: () => setPickerOpen(true),
    }),
    [store],
  )

  return (
    <StoreContext value={value}>
      {children}
      {/* key: al abrir de nuevo, el diálogo parte de la sucursal actual */}
      <StoreDialog
        key={pickerOpen ? 'abierto' : 'cerrado'}
        open={pickerOpen}
        current={store}
        onClose={() => setPickerOpen(false)}
        onSave={(next) => {
          value.setStore(next)
          setPickerOpen(false)
        }}
      />
    </StoreContext>
  )
}
