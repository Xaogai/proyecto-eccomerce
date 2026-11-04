import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default defineConfig((env) =>
  mergeConfig(viteConfig(env), {
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setupTests.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: { modules: { classNameStrategy: 'non-scoped' } },
      // npm run coverage. Mínimo 80% en los módulos críticos (sec. 10.2 del Documento de Calidad):
      // sesión y JWT, carrito, checkout y utilidades compartidas.
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/mocks/**',
          'src/test/**',
          'src/**/*.test.{ts,tsx}',
          'src/main.tsx',
          'src/vite-env.d.ts',
        ],
        reporter: ['text-summary', 'html'],
        thresholds: {
          'src/api/**': { lines: 80, statements: 80 },
          'src/app/providers/**': { lines: 80, statements: 80 },
          'src/features/cart/**': { lines: 80, statements: 80 },
          'src/features/checkout/**': { lines: 80, statements: 80 },
          'src/lib/**': { lines: 80, statements: 80 },
        },
      },
    },
  }),
)
