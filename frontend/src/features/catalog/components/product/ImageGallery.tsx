import { useState } from 'react'
import type { Image } from '@/api/schemas/common'
import { Dialog } from '@/components/ui/Dialog'
import styles from './product.module.css'

/**
 * Imagen principal, miniaturas (botones con aria-pressed) y "Ampliar imagen" en un diálogo.
 * Con `onOpen360` aparece el botón "Vista 360°" (flag v360).
 */
export function ImageGallery({
  images,
  name,
  onOpen360,
}: {
  images: Image[]
  name: string
  onOpen360?: () => void
}) {
  const [current, setCurrent] = useState(0)
  const [zoom, setZoom] = useState(false)
  const image = images[current] ?? images[0]
  if (!image) return null

  return (
    <section aria-label="Imágenes del producto" className={styles.gallery}>
      <div className={styles.mainImage}>
        <img src={image.url} alt={image.alt} width={560} height={420} />
        <button type="button" className={styles.zoomBtn} onClick={() => setZoom(true)} aria-haspopup="dialog">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-4-4M11 8v6M8 11h6" />
          </svg>
          Ampliar imagen
        </button>
        {onOpen360 && (
          <button type="button" className={styles.view360Btn} onClick={onOpen360} aria-haspopup="dialog">
            Vista 360°
          </button>
        )}
      </div>
      {images.length > 1 && (
        <div className={styles.thumbs}>
          {images.map((img, i) => (
            <button
              key={`${img.url}-${i}`}
              type="button"
              className={styles.thumb}
              aria-pressed={i === current}
              aria-label={`Imagen ${i + 1} de ${images.length}, ${img.alt.replace(`${name}, `, '')}`}
              onClick={() => setCurrent(i)}
            >
              <img src={img.url} alt="" width={72} height={54} />
            </button>
          ))}
        </div>
      )}
      <Dialog open={zoom} onClose={() => setZoom(false)} title={name} className={styles.zoomDialog}>
        <img src={image.url} alt={image.alt} className={styles.zoomImage} />
      </Dialog>
    </section>
  )
}
