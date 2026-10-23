import AxeBuilder from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

// Fase 4: comparador, calculadora y sucursales.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'taller.sucursal',
      JSON.stringify({ id: 'toluca-centro', name: 'Toluca Centro', zip: '50000' }),
    ),
  )
})

async function axe(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  expect(
    result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([])
}

const PAGINAS = [
  ['/comparar?skus=100245,200118,300077', 'Comparar 3 productos'],
  ['/calculadora', 'Calculadora de materiales'],
  ['/calculadora/piso', 'Calculadora de materiales'],
  ['/calculadora/taquetes', 'Calculadora de materiales'],
  ['/sucursales', 'Sucursales'],
] as const

for (const [url, title] of PAGINAS) {
  test(`accesibilidad y sin scroll horizontal en ${url}`, async ({ page }) => {
    await page.goto(url)
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await axe(page)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

test('comparar desde el listado y quitar un producto', async ({ page }) => {
  await page.goto('/categoria/taladros')
  const cards = page.getByRole('article')
  await cards
    .nth(0)
    .getByRole('checkbox', { name: /^Comparar/ })
    .check()
  await cards
    .nth(1)
    .getByRole('checkbox', { name: /^Comparar/ })
    .check()
  await cards
    .nth(2)
    .getByRole('checkbox', { name: /^Comparar/ })
    .check()
  const bar = page.getByRole('region', { name: 'Productos para comparar' })
  await expect(bar).toContainText('Comparar 3 de 4')
  await bar.getByRole('link', { name: 'Comparar ahora' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Comparar 3 productos' })).toBeVisible()
  await page
    .getByRole('button', { name: /^Quitar .* de la comparación$/ })
    .first()
    .click()
  await expect(page.getByRole('heading', { level: 1, name: 'Comparar 2 productos' })).toBeVisible()
})

test('la tabla del comparador se recorre con teclado (región con foco)', async ({ page }) => {
  await page.goto('/comparar?skus=100245,200118,300077')
  const region = page.getByRole('region', { name: 'Tabla de comparación' })
  await region.focus()
  await expect(region).toBeFocused()
})
