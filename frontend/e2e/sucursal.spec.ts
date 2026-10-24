import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

// Fase 6: panel de sucursal con datos simulados (Sofía, staff de Toluca Centro).

async function axe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([])
}

async function noOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, label).toBeLessThanOrEqual(0)
}

async function loginStaff(page: Page) {
  await page.goto('/cuenta/login')
  await page.getByLabel('Correo electrónico').fill('staff@ejemplo.com')
  await page.getByLabel('Contraseña', { exact: true }).fill('Taller123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL('**/sucursal/**')
}

test('pantallas de sucursal sin violaciones de accesibilidad ni scroll horizontal', async ({ page }) => {
  test.setTimeout(90_000)
  await loginStaff(page)
  for (const [url, title] of [
    ['/sucursal/inventario', 'Inventario de la sucursal'],
    ['/sucursal/recoleccion', 'Pedidos para recoger'],
    ['/sucursal/entrega', 'Entregar pedido'],
  ] as const) {
    await page.goto(url)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 15_000 })
    await page.waitForLoadState('networkidle')
    await axe(page)
    await noOverflow(page, url)
  }
})

test('el cliente no entra a la sucursal', async ({ page }) => {
  await page.goto('/cuenta/login')
  await page.getByLabel('Correo electrónico').fill('cliente@ejemplo.com')
  await page.getByLabel('Contraseña', { exact: true }).fill('Taller123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/cuenta/login'))
  await page.goto('/sucursal/recoleccion')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('No tienes acceso')
})

test('entregar con el código del cliente: código incorrecto, revisión y entregado', async ({ page }) => {
  await loginStaff(page)
  await page.goto('/sucursal/recoleccion')
  await page.getByRole('link', { name: 'Entregar el pedido 10482' }).click()

  const code = page.getByLabel('Código de entrega del cliente')
  await code.fill('1111')
  await page.getByRole('button', { name: 'Buscar pedido' }).click()
  await expect(code).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('No hay pedidos listos con ese código')).toBeVisible()

  await code.fill('4821')
  await page.getByRole('button', { name: 'Buscar pedido' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Pedido 10482 · Ana López' })).toBeFocused()
  await axe(page)

  // Sin revisar identificación y productos no se entrega.
  await page.getByRole('button', { name: 'Confirmar entrega' }).click()
  await expect(page.getByText('Marca las dos casillas antes de entregar.')).toBeVisible()
  await page.getByLabel(/El nombre coincide con la identificación/).check()
  await page.getByLabel('El cliente revisó los productos').check()
  await page.getByRole('button', { name: 'Confirmar entrega' }).click()
  await expect(page.getByRole('heading', { level: 2, name: 'Pedido 10482 entregado' })).toBeVisible()
  await axe(page)

  await page.getByRole('link', { name: 'Volver a pedidos' }).click()
  const delivered = page.locator('section', { has: page.getByRole('heading', { name: /Entregados hoy/ }) })
  await expect(delivered).toContainText('Pedido 10482')
})

test('preparar un pedido y marcarlo listo (solo hacia adelante)', async ({ page }) => {
  await loginStaff(page)
  await page.goto('/sucursal/recoleccion')
  const prep = page.locator('section', { has: page.getByRole('heading', { name: /Por preparar/ }) })
  const first = prep.getByRole('article').first()
  const folio = (await first.getByRole('heading', { level: 3 }).textContent())!.replace('Pedido ', '')

  const start = page.getByRole('button', { name: `Empezar a preparar el pedido ${folio}` })
  if (await start.isVisible()) await start.click()
  await page.getByRole('button', { name: `Marcar listo y avisar al cliente, pedido ${folio}` }).click()
  await expect(page.getByText(`Pedido ${folio} listo. Enviamos aviso`)).toBeVisible()
  const ready = page.locator('section', { has: page.getByRole('heading', { name: /Listos para recoger/ }) })
  await expect(ready).toContainText(`Pedido ${folio}`)
})

test('ajuste de inventario: motivo obligatorio y nunca por debajo de lo apartado', async ({ page }) => {
  await loginStaff(page)
  await page.goto('/sucursal/inventario')
  await page.getByLabel('Buscar').fill('100245-1')
  const row = page.getByRole('row', { name: /100245-1/ })
  await expect(row).toHaveCount(1)
  const qty = Number((await row.getByRole('cell').nth(1).textContent())!.match(/\d+/)![0])

  const group = row.getByRole('group', { name: /^Ajuste de / })
  await group.getByRole('button', { name: 'Sumar una pieza' }).click()
  await group.getByRole('button', { name: 'Sumar una pieza' }).click()
  await row.getByRole('button', { name: /^Guardar ajuste/ }).click()
  await expect(row.getByText('Elige el motivo.')).toBeVisible()

  await row
    .getByRole('combobox', { name: /^Motivo del ajuste/ })
    .selectOption({ label: 'Recepción de mercancía' })
  await row.getByRole('button', { name: /^Guardar ajuste/ }).click()
  await expect(page.getByText(/Guardamos el ajuste de .*: \+2 piezas/)).toBeVisible()
  await expect(row.getByRole('cell').nth(1)).toContainText(String(qty + 2))
})
