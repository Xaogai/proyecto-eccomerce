import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// En desarrollo todo /api va al gateway del backend (API_URL en un .env.local; por omisión localhost:8000).
// Con VITE_MOCKS=true las peticiones las contesta MSW en el navegador y el proxy no se usa.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.API_URL ?? 'http://localhost:8000'

  return {
    plugins: [react()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: { proxy: { '/api': { target, changeOrigin: true } } },
    preview: { proxy: { '/api': { target, changeOrigin: true } } },
  }
})
