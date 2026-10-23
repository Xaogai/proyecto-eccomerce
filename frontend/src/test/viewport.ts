import { breakpoints } from '@/styles/breakpoints'

const WIDTH = { movil: 390, escritorio: 1280 } as const

/** Simula el ancho de pantalla para useMediaQuery (jsdom no calcula media queries). */
export function setViewport(kind: keyof typeof WIDTH) {
  const width = WIDTH[kind]
  window.matchMedia = (query: string) =>
    ({
      matches: Object.values(breakpoints).some((bp) => query === `(min-width: ${bp}px)` && width >= bp),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList
}
