import { expect, test } from './fixtures'

const name = `Pierna ${Date.now()}`

test('creates a routine with per-set targets and edits it afterwards', async ({ page }) => {
  await page.goto('/rutinas')
  await page.getByRole('link', { name: 'Nueva rutina' }).click()

  await expect(page.getByRole('heading', { name: 'Nueva rutina' })).toBeVisible()
  await page.getByLabel('Nombre').fill(name)

  await page.getByRole('button', { name: 'Añadir ejercicio' }).click()
  await page.getByLabel('Buscar ejercicio').fill('prensa de piernas')
  await page.getByRole('button', { name: 'Prensa de piernas' }).click()

  // A ramp: the targets that prefill the next workout, one row per set.
  await page.getByLabel('Serie 1: Reps').fill('12')
  await page.getByLabel('Serie 1: Peso (kg)').fill('100')
  await page.getByLabel('Serie 2: Reps').fill('10')
  await page.getByLabel('Serie 2: Peso (kg)').fill('120')

  await page.getByRole('button', { name: 'Guardar rutina' }).click()

  await expect(page.getByText('Rutina creada')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rutinas' })).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(name) })).toContainText('Prensa de piernas')

  await page.getByRole('link', { name: new RegExp(name) }).click()
  await expect(page.getByRole('heading', { name: 'Editar rutina' })).toBeVisible()
  // Saved exercises open folded to their plan; a tap shows the sets.
  await page.getByRole('button', { name: /Series de Prensa de piernas/ }).click()
  await expect(page.getByLabel('Serie 2: Peso (kg)')).toHaveValue('120')

  await page.getByLabel('Nombre').fill(`${name} A`)
  await page.getByRole('button', { name: 'Guardar rutina' }).click()

  await expect(page.getByText('Rutina actualizada')).toBeVisible()
  await expect(page.getByRole('link', { name: new RegExp(`${name} A`) })).toBeVisible()
})
