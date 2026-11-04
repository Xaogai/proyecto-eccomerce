/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base de la API. Por defecto /api/v1 en el mismo origen. */
  readonly VITE_API_URL?: string
  /** "true" para usar los datos simulados de MSW (npm run dev:mock). */
  readonly VITE_MOCKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
