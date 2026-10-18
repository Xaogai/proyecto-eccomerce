import { defineConfig, devices } from '@playwright/test'

// Los e2e corren contra el sitio con datos simulados (npm run dev:mock).
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    locale: 'es-MX',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'movil', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'npm run dev:mock',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
