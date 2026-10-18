import { type ReactNode, useMemo, useState } from 'react'
import { readJson, writeJson } from '@/lib/storage'
import { type SelectedStore, StoreContext } from './storeContext'

const KEY = 'taller.sucursal'

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStoreState] = useState<SelectedStore | null>(() => readJson<SelectedStore | null>(KEY, null))

  const value = useMemo(
    () => ({
      store,
      setStore: (next: SelectedStore) => {
        writeJson(KEY, next)
        setStoreState(next)
      },
    }),
    [store],
  )

  return <StoreContext value={value}>{children}</StoreContext>
}
