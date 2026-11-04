import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// En desarrollo no hay gateway: cada prefijo de /api/v1 va a su microservicio (T-08 en docs/api/endpoints-propuestos.md).
// Con VITE_MOCKS=true las peticiones las contesta MSW en el navegador y el proxy no se usa.
const servicios: Record<string, string> = {
  '/api/v1/categories': 'CATALOG',
  '/api/v1/products': 'CATALOG',
  '/api/v1/search': 'CATALOG',
  '/api/v1/stores': 'INVENTORY',
  '/api/v1/branch': 'INVENTORY',
  '/api/v1/shipping': 'SHIPPING',
  '/api/v1/cart': 'CART',
  '/api/v1/checkout': 'CHECKOUT',
  '/api/v1/orders': 'CHECKOUT',
  '/api/v1/auth': 'USERS',
  '/api/v1/me': 'USERS',
  '/api/v1/feature-flags': 'USERS',
  '/api/v1/admin': 'USERS',
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = Object.fromEntries(
    Object.entries(servicios).map(([prefijo, servicio]) => [
      prefijo,
      { target: env[`API_${servicio}_URL`] ?? 'http://localhost:8000', changeOrigin: true },
    ]),
  )

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { proxy },
  }
})
