// Puntos de quiebre de la sec. 27.4 del Documento de Calidad. En CSS se usan los mismos números con min-width.
export const breakpoints = {
  /** 481–768: 2 columnas */
  tablet: 481,
  /** 769–1024: 3 columnas, menú de categorías visible */
  menu: 769,
  /** 1025–1440: filtros laterales y comparador */
  escritorio: 1025,
  /** 1441+: más productos por fila */
  amplio: 1441,
} as const

export type Breakpoint = keyof typeof breakpoints

export const mediaQuery = (bp: Breakpoint) => `(min-width: ${breakpoints[bp]}px)`
