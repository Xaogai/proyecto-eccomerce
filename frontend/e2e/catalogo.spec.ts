import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Fase 1: catálogo y búsqueda con datos simulados (npm run dev:mock).

test.beforeEach(async ({ page }) => {
  // Sucursal elegida, como un visitante que ya la configuró.
  await page.addInitScript(() =>
    localStorage.setItem(
      'taller.sucursal',
      JSON.stringify({ id: 'toluca-centro', name: 'Toluca Centro', zip: '50000' }),
    ),
  )
})

const RUTAS = [
  '/',
  '/categoria/taladros',
  '/buscar?q=taladro',
  '/producto/100245',
  '/departamentos',
  '/ayuda/privacidad',
]

for (const ruta of RUTAS) {
  test(`sin violaciones de accesibilidad WCAG 2.1 AA en ${ruta}`, async ({ page }) => {
    await page.goto(ruta)
    await expect(page.locator('main h1')).toBeVisible()
    await page.waitForLoadState('networkidle')
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    expect(
      result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([])
  })
}

test('sin scroll horizontal', async ({ page }) => {
  for (const ruta of RUTAS) {
    await page.goto(ruta)
    await expect(page.locator('main h1')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, ruta).toBeLessThanOrEqual(0)
  }
})

test('buscar, filtrar, abrir la ficha y agregar al carrito', async ({ page, isMobile }) => {
  await page.goto('/')
  if (isMobile) {
    await page.getByRole('link', { name: 'Busca por producto, marca o SKU' }).click()
  }
  const search = page.getByRole('combobox', { name: 'Buscar productos' })
  await search.fill('taladro')
  await expect(page.getByRole('listbox', { name: 'Sugerencias' }).getByRole('option').first()).toBeVisible()
  await search.press('Enter')
  await expect(page).toHaveURL(/\/buscar\?q=taladro/)
  await expect(page.getByRole('heading', { level: 1, name: 'Resultados para "taladro"' })).toBeVisible()

  if (isMobile) {
    await page.getByRole('button', { name: /^Filtros/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Filtros' })
    await sheet.getByRole('checkbox', { name: /Volta/ }).check()
    await sheet.getByRole('button', { name: /^Ver \d+ resultados?$/ }).click()
  } else {
    await page.getByRole('group', { name: 'Marca' }).getByRole('checkbox', { name: /Volta/ }).check()
  }
  await expect(page).toHaveURL(/attr\.brand=Volta/)
  await expect(page.getByText('Filtrado por: marca Volta. 1 filtro activo')).toBeVisible()

  await page.getByRole('link', { name: 'Taladro percutor inalámbrico 1/2 pulg 20 V', exact: true }).click()
  await expect(
    page.getByRole('heading', { level: 1, name: 'Taladro percutor inalámbrico 1/2 pulg 20 V' }),
  ).toBeVisible()
  await page.getByRole('radio', { name: /Con 2 baterías, cargador y estuche/ }).check()
  await expect(page.getByText('Quedan 2 en Toluca Centro')).toBeVisible()
  await page.getByRole('button', { name: 'Agregar al carrito' }).click()
  await expect(page.getByRole('link', { name: 'Carrito 1 producto' })).toBeVisible()
})

test('departamentos y migas de pan llevan al listado', async ({ page, isMobile }) => {
  if (isMobile) {
    await page.goto('/')
    await page.getByRole('link', { name: 'Departamentos' }).click()
    await page.getByRole('button', { name: 'Herramientas, ver subcategorías' }).click()
    await page.getByRole('button', { name: 'Herramientas eléctricas, ver subcategorías' }).click()
    await page.getByRole('link', { name: 'Taladros' }).click()
  } else {
    await page.goto('/')
    await page
      .getByRole('navigation', { name: 'Categorías' })
      .getByRole('link', { name: 'Herramientas' })
      .click()
    await page.getByRole('link', { name: 'Herramientas eléctricas' }).click()
    await page.getByRole('link', { name: 'Taladros' }).first().click()
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Taladros' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Taladros' })).toBeFocused()
})
