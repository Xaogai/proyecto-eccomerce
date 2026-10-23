import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

// Fase 5: panel de administración con datos simulados.

async function axe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([])
}

async function loginAdmin(page: Page) {
  await page.goto('/cuenta/login')
  await page.getByLabel('Correo electrónico').fill('admin@ejemplo.com')
  await page.getByLabel('Contraseña', { exact: true }).fill('Taller123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL('**/admin')
}

const PAGINAS = [
  ['/admin', 'Resumen de hoy'],
  ['/admin/productos', 'Productos'],
  ['/admin/productos/400118', 'Taladro magnético 1,100 W'],
  ['/admin/productos/nuevo', 'Nuevo producto'],
  ['/admin/categorias', 'Categorías'],
  ['/admin/pedidos', 'Pedidos'],
  ['/admin/pedidos/10482', 'Pedido 10482'],
  ['/admin/usuarios', 'Usuarios y roles'],
  ['/admin/reportes', 'Reportes'],
  ['/admin/configuracion', 'Configuración'],
] as const

test('pantallas del admin sin violaciones de accesibilidad ni scroll horizontal', async ({ page }) => {
  test.setTimeout(120_000)
  await loginAdmin(page)
  for (const [url, title] of PAGINAS) {
    await page.goto(url)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible({ timeout: 15_000 })
    await page.waitForLoadState('networkidle')
    await axe(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, url).toBeLessThanOrEqual(0)
  }
})

test('el cliente no entra al admin', async ({ page }) => {
  await page.goto('/cuenta/login')
  await page.getByLabel('Correo electrónico').fill('cliente@ejemplo.com')
  await page.getByLabel('Contraseña', { exact: true }).fill('Taller123')
  await page.getByRole('button', { name: 'Entrar' }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/cuenta/login'))
  await page.goto('/admin')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('No tienes acceso')
})

test('I2: no se publica sin variante con precio y stock; con ellos sí', async ({ page }) => {
  await loginAdmin(page)
  await page.goto('/admin/productos/400118')
  await page.getByRole('button', { name: 'Publicar' }).click()
  await expect(page.getByRole('alert')).toContainText('No puedes publicar')

  await page.getByLabel('Precio de 400118-0').fill('12899')
  await page.getByLabel('Stock total de 400118-0').fill('4')
  await page.getByRole('button', { name: 'Publicar' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Publicado' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pasar a borrador' })).toBeVisible()
})

test('variante con precio inválido muestra el error junto al campo', async ({ page }) => {
  await loginAdmin(page)
  await page.goto('/admin/productos/400118')
  const price = page.getByLabel('Precio de 400118-0')
  await price.fill('abc')
  await page.getByRole('button', { name: 'Guardar borrador' }).click()
  await expect(price).toHaveAttribute('aria-invalid', 'true')
  await expect(page.getByText('Escribe un precio válido')).toBeVisible()
})

test('I3: el pedido solo pasa a estados válidos y queda en el registro', async ({ page }) => {
  await loginAdmin(page)
  await page.goto('/admin/pedidos/10482')
  const select = page.getByLabel('Nuevo estado')
  await expect(select.locator('option', { hasText: 'Entregado' })).toHaveCount(1)
  const options = await select.locator('option').allTextContents()
  // Desde "Listo para recoger" no se regresa a "Pagado" (I3)
  expect(options).not.toContain('Pagado')
  expect(options).toContain('Entregado')
  await select.selectOption({ label: 'Incidencia' })
  await page.getByLabel(/Nota para el registro/).fill('El cliente reporta la caja abierta')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Incidencia')
  const log = page.locator('section', { has: page.getByRole('heading', { name: 'Registro de cambios' }) })
  await expect(log).toContainText('El cliente reporta la caja abierta')
})

test('categorías: una subcategoría no admite más niveles', async ({ page }) => {
  await loginAdmin(page)
  await page.goto('/admin/categorias')
  await page.getByRole('button', { name: 'Subcategorías de Herramientas eléctricas' }).click()
  await page.getByRole('button', { name: 'Taladros', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Agregar subcategoría' })).toBeDisabled()
  await expect(page.getByText('no admite más niveles')).toBeVisible()
})

test('usuarios: desbloquear una cuenta y no poder cambiar el propio rol', async ({ page }) => {
  await loginAdmin(page)
  await page.goto('/admin/usuarios')
  await expect(page.getByLabel('Rol de Luis Ramírez')).toBeDisabled()
  const unlock = page.getByRole('button', { name: /^Desbloquear a / }).first()
  const label = await unlock.getAttribute('aria-label')
  // Con teclado: en móvil el botón queda dentro de la tabla con scroll horizontal.
  await unlock.focus()
  await page.keyboard.press('Enter')
  await expect(
    page.getByText(`Desbloqueamos la cuenta de ${label!.replace('Desbloquear a ', '')}.`),
  ).toBeVisible()
})

test('configuración: apagar el comparador lo quita de la tienda', async ({ page }) => {
  await loginAdmin(page)
  await page.goto('/admin/configuracion')
  const toggle = page.getByRole('switch', { name: 'Comparador de productos' })
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await page.goto('/c/taladros')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: /^Comparar/ })).toHaveCount(0)
})

test('gráfica de ventas con vista de tabla', async ({ page }) => {
  await loginAdmin(page)
  const chart = page.getByRole('img', { name: /^Ventas por día:/ })
  await expect(chart).toBeVisible()
  await page.getByRole('button', { name: 'Ver como tabla' }).click()
  await expect(page.getByRole('table', { name: 'Ventas por día' }).getByRole('row')).toHaveCount(8)
})
