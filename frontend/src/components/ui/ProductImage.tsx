import type { Image } from '@/api/schemas/common'

interface ProductImageProps {
  image: Image
  width: number
  height: number
  /** Texto alternativo distinto al de la imagen ("" si es decorativa junto a un nombre visible) */
  alt?: string
  /** Ancho que ocupa en pantalla, para que el navegador elija del srcset ("(min-width: 769px) 240px, 50vw") */
  sizes?: string
  /** Imagen principal de la página: carga de inmediato y con prioridad (LCP) */
  priority?: boolean
  className?: string
}

/**
 * Imagen de producto (E6). Por defecto se carga cuando está por entrar a la pantalla.
 * Ancho y alto reservan el espacio para que la página no salte; si la API manda `srcset`,
 * el navegador baja el tamaño que necesita.
 */
export function ProductImage({ image, width, height, alt, sizes, priority, className }: ProductImageProps) {
  return (
    <img
      src={image.url}
      srcSet={image.srcset}
      sizes={image.srcset ? (sizes ?? `${width}px`) : undefined}
      alt={alt ?? image.alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      className={className}
    />
  )
}
