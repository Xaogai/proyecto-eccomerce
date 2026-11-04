import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

// Fase 3: cuenta del cliente con datos simulados.

async function axe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([])
}

async function login(page: Page, next = '') {
  await page.goto(`/cuenta/login${next}`)
  await page.getByLabel('Correo electrónico').fill('cliente@ejemplo.com')
  await page.getByLabel('Contraseña', { exact: true }).fill('Taller123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/cuenta/login'))
}

test('login, registro y restablecer cumplen accesibilidad', async ({ page }) => {
  for (const url of ['/cuenta/login', '/cuenta/registro', '/cuenta/restablecer']) {
    await page.goto(url)
    await expect(page.locator('main h1')).toBeVisible()
    await axe(page)
  }
})

const PAGINAS = [
  ['/cuenta', 'Hola, Ana'],
  ['/cuenta/pedidos', 'Mis pedidos'],
  ['/cuenta/pedidos/10482', 'Pedido 10482'],
  ['/cuenta/direcciones', 'Direcciones'],
  ['/cuenta/deseos', 'Lista de deseos'],
  ['/cuenta/datos', 'Datos y privacidad'],
  ['/cuenta/pedidos/10311/devolucion', 'Solicitar devolución'],
  ['/producto/100245/resena', 'Taladro percutor inalámbrico 1/2 pulg 20 V'],
] as const

test('páginas de Mi cuenta sin violaciones de accesibilidad ni scroll horizontal', async ({ page }) => {
  test.setTimeout(90_000)
  await login(page)
  await expect(page.getByRole('heading', { level: 1, name: 'Hola, Ana' })).toBeVisible()
  for (const [url, title] of PAGINAS) {
    await page.goto(url)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 15_000 })
    await page.waitForLoadState('networkidle')
    await axe(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, url).toBeLessThanOrEqual(0)
  }
})

test('devolución con foto (multipart real)', async ({ page }) => {
  await login(page)
  await page.goto('/cuenta/pedidos/10311/devolucion')
  await page.getByRole('checkbox').first().check()
  await page.getByRole('radio', { name: 'Llegó dañado o no funciona' }).check()
  await page
    .getByLabel(/Foto del problema/)
    .setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: Buffer.from('png') })
  await page.getByRole('button', { name: 'Enviar solicitud' }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: /^Devolución DEV-\d+ en revisión$/ }),
  ).toBeVisible()
})

test('la sesión se mantiene al recargar y "Cerrar sesión" la termina', async ({ page }) => {
  await login(page, '?next=%2Fcuenta%2Fpedidos')
  await expect(page.getByRole('heading', { level: 1, name: 'Mis pedidos' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Mis pedidos' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await expect(page).toHaveURL('/')
  await page.goto('/cuenta')
  await expect(page).toHaveURL(/\/cuenta\/login\?next=/)
})
