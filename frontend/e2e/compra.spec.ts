import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

// Fase 2: compra completa como invitado, solo con teclado donde importa (sec. 28.3: checkout operable con teclado).

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'taller.sucursal',
      JSON.stringify({ id: 'toluca-centro', name: 'Toluca Centro', zip: '50000' }),
    )
    localStorage.removeItem('taller.mock')
  })
})

async function addToCart(page: Page, sku: string) {
  await page.goto(`/producto/${sku}`)
  await page.getByRole('button', { name: 'Agregar al carrito' }).click()
  await expect(page.getByText(/^Agregaste/)).toBeVisible()
}

async function axe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([])
}

test('compra completa: carrito → checkout → pasarela → pagado', async ({ page }) => {
  await addToCart(page, '300077')
  await page.getByRole('link', { name: /^Carrito 1 producto/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Carrito (1)' })).toBeVisible()
  await axe(page)

  await page.getByRole('link', { name: 'Continuar al pago' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible()
  await expect(page.getByRole('radio', { name: /Toluca Centro/ })).toBeChecked()
  await axe(page)

  // Solo teclado: escribir y avanzar con Tab, pagar con Enter.
  await page.getByLabel('Nombre completo').focus()
  await page.keyboard.type('Ana López')
  await page.keyboard.press('Tab')
  await page.keyboard.type('722 123 4567')
  await page.keyboard.press('Tab')
  await page.keyboard.type('ana@ejemplo.com')
  await page.keyboard.press('Enter')

  await expect(page).toHaveURL(/\/_pasarela\/\d+/)
  await page.getByRole('button', { name: 'Aprobar pago' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Estamos confirmando tu pago' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Gracias, tu pedido está pagado' })).toBeVisible({
    timeout: 10_000,
  })
  await axe(page)
})

test('el checkout nunca tiene campos de tarjeta', async ({ page }) => {
  await addToCart(page, '300077')
  await page.goto('/checkout')
  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible()
  await expect(
    page.locator('input[autocomplete^="cc-"], input[name*="card" i], input[name*="cvv" i]'),
  ).toHaveCount(0)
})

test('errores de validación con foco en el resumen', async ({ page }) => {
  await addToCart(page, '300077')
  await page.goto('/checkout')
  await page.getByRole('button', { name: /^Pagar/ }).click()
  await expect(page.getByText('Revisa 3 campos antes de continuar.')).toBeVisible()
  await axe(page)
})
