import { defineConfig, devices } from '@playwright/test'

// Los e2e corren contra un build con datos simulados (npm run build:mock + preview:mock).
// Con el servidor de desarrollo cada página nueva pide cientos de módulos sueltos y, con
// muchas pruebas en paralelo, la primera carga podía pasar de 30 s.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:4173',
    locale: 'es-MX',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'movil', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    // Matriz de navegadores (E5): Edge usa el mismo motor que Chrome; Safari e iOS usan WebKit.
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 900 } } },
    { name: 'safari', use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 900 } } },
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run build:mock && npm run preview:mock',
    url: 'http://localhost:4173',
    // Siempre un build nuevo: reutilizar un servidor abierto probaría código viejo.
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
