import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { z } from 'zod'
import { get } from '@/api/client'
import { endpoints } from '@/api/endpoints'
import { storeSchema } from '@/api/schemas/store'
import { useSelectedStore } from '@/app/providers/storeContext'
import { LoadingStatus } from '@/components/feedback/States'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { RadioGroup, TextField } from '@/components/ui/Field'
import { cx } from '@/lib/cx'
import { PinIcon } from './icons'
import styles from './StoreSelector.module.css'

/** Sucursal y CP en el encabezado (G3). Abre un diálogo para elegir sucursal (EP-08). */
export function StoreSelector({ variant = 'escritorio', className }: { variant?: 'escritorio' | 'movil'; className?: string }) {
  const { store, setStore } = useSelectedStore()
  const [open, setOpen] = useState(false)
  const [zip, setZip] = useState(store?.zip ?? '')
  const [picked, setPicked] = useState<string | undefined>(store?.id)
  const validZip = /^\d{5}$/.test(zip)

  const stores = useQuery({
    queryKey: ['catalog', 'stores', validZip ? zip : null],
    queryFn: () => get(endpoints.stores, z.array(storeSchema), validZip ? { zip } : undefined),
    enabled: open,
  })

  function save() {
    const s = stores.data?.find((x) => x.id === picked)
    if (!s) return
    setStore({ id: s.id, name: s.name, zip: validZip ? zip : s.zip })
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        className={cx(styles.button, styles[variant], className)}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        {variant === 'movil' ? (
          <>
            <span className={styles.pin}>
              <PinIcon />
            </span>
            <span className={styles.grow}>
              {store ? (
                <>
                  <strong>{store.name}</strong> · CP {store.zip}
                </>
              ) : (
                'Elige tu sucursal'
              )}
            </span>
            <span className={styles.secondary}>Cambiar</span>
          </>
        ) : (
          <>
            <span className={styles.small}>{store ? `Tu sucursal · CP ${store.zip}` : 'Tu sucursal'}</span>
            <span className={styles.name}>{store?.name ?? 'Elige sucursal'}</span>
          </>
        )}
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Elige tu sucursal"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={save} disabled={!picked}>
              Guardar
            </Button>
          </>
        }
      >
        <div className={styles.dialogBody}>
          <TextField
            label="Código postal"
            hint="Para ordenar las sucursales por cercanía y calcular el envío."
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))}
            error={zip.length > 0 && zip.length < 5 ? 'El código postal tiene 5 dígitos.' : undefined}
          />
          {stores.isPending && <LoadingStatus label="Cargando sucursales" />}
          {stores.isError && <p role="alert">No pudimos cargar las sucursales. Intenta de nuevo.</p>}
          {stores.data && (
            <RadioGroup
              legend="Sucursales"
              name="sucursal"
              value={picked}
              onChange={setPicked}
              options={stores.data.map((s) => ({
                value: s.id,
                label: (
                  <span className={styles.option}>
                    <strong>{s.name}</strong>
                    <span className={styles.secondaryText}>
                      {s.address}
                      {s.distance_km !== undefined && ` · ${s.distance_km.toFixed(1)} km`}
                    </span>
                  </span>
                ),
              }))}
            />
          )}
        </div>
      </Dialog>
    </>
  )
}
