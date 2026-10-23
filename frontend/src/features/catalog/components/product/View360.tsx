import { useId, useState } from 'react'
import type { Image } from '@/api/schemas/common'
import { Dialog } from '@/components/ui/Dialog'
import { Tabs } from '@/components/ui/Tabs'
import styles from './view360.module.css'

const STEP = 15

interface View360Props {
  open: boolean
  onClose: () => void
  name: string
  frames: string[]
  images: Image[]
}

/**
 * Vista 360° (pantallas 18 y 25; A9). Se gira con la barra (flechas del teclado),
 * con los botones o arrastrando; el ángulo se anuncia en voz alta.
 */
export function View360({ open, onClose, name, frames, images }: View360Props) {
  const [tab, setTab] = useState<'fotos' | '360'>('360')
  return (
    <Dialog open={open} onClose={onClose} title={name} className={styles.dialog}>
      <Tabs
        label="Tipo de vista"
        value={tab}
        onChange={setTab}
        tabs={[
          {
            value: 'fotos',
            label: 'Fotos',
            panel: (
              <div className={styles.photos}>
                {images.map((img, i) => (
                  <img key={`${img.url}-${i}`} src={img.url} alt={img.alt} />
                ))}
              </div>
            ),
          },
          { value: '360', label: 'Vista 360°', panel: <Spinner frames={frames} name={name} /> },
        ]}
      />
    </Dialog>
  )
}

function Spinner({ frames, name }: { frames: string[]; name: string }) {
  const id = useId()
  const [angle, setAngle] = useState(45)
  const [zoom, setZoom] = useState(1)
  const [drag, setDrag] = useState<number | null>(null)
  const max = 360 - STEP
  const set = (a: number) => setAngle((((Math.round(a / STEP) * STEP) % 360) + 360) % 360)
  const frame = frames[Math.round((angle / 360) * frames.length) % frames.length]
  // Con fotos reales cada cuadro es distinto. Si todos son iguales (datos de prueba) se simula el giro.
  const fake = new Set(frames).size === 1
  const flip = angle > 90 && angle < 270 ? -1 : 1
  const squash = Math.max(0.35, Math.abs(Math.cos((angle * Math.PI) / 180)))

  return (
    <div className={styles.viewer}>
      <div
        className={styles.stage}
        onPointerDown={(e) => setDrag(e.clientX)}
        onPointerMove={(e) => {
          if (drag === null) return
          const delta = e.clientX - drag
          if (Math.abs(delta) >= 20) {
            set(angle + Math.sign(delta) * STEP)
            setDrag(e.clientX)
          }
        }}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        <img
          src={frame}
          alt={`${name}, vista a ${angle} grados`}
          draggable={false}
          style={{ transform: `scale(${zoom})${fake ? ` scaleX(${(flip * squash).toFixed(2)})` : ''}` }}
        />
      </div>
      <div className={styles.controls}>
        <div className={styles.rotate}>
          <button
            type="button"
            className={styles.round}
            onClick={() => set(angle - STEP)}
            aria-label="Girar a la izquierda"
          >
            ‹
          </button>
          <label htmlFor={`${id}-angulo`} className="sr-only">
            Ángulo de giro
          </label>
          <input
            id={`${id}-angulo`}
            type="range"
            min={0}
            max={max}
            step={STEP}
            value={angle}
            aria-valuetext={`${angle} grados`}
            onChange={(e) => set(Number(e.target.value))}
            className={styles.range}
          />
          <button
            type="button"
            className={styles.round}
            onClick={() => set(angle + STEP)}
            aria-label="Girar a la derecha"
          >
            ›
          </button>
        </div>
        <div className={styles.info}>
          <span aria-live="polite">Vista a {angle}°</span>
          <span className={styles.hint}>Arrastra la imagen o la barra, o usa las flechas del teclado</span>
        </div>
        <div className={styles.zoom}>
          <button
            type="button"
            className={styles.round}
            onClick={() => setZoom((z) => Math.max(1, z - 0.25))}
            disabled={zoom <= 1}
            aria-label="Alejar"
          >
            −
          </button>
          <button
            type="button"
            className={styles.round}
            onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
            disabled={zoom >= 2}
            aria-label="Acercar"
          >
            +
          </button>
        </div>
      </div>
    </div>
  )
}
