import { expect, test } from './fixtures'

test('logs a free workout set by set and finds it on the home page afterwards', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Entrenar' }).click()

  await expect(page.getByRole('heading', { name: 'Nuevo entreno' })).toBeVisible()
  await page.getByRole('button', { name: 'Entreno libre' }).click()

  await page.getByRole('button', { name: 'Añadir ejercicio' }).click()
  await page.getByLabel('Buscar ejercicio').fill('sentadilla con barra')
  await page.getByRole('button', { name: 'Sentadilla con barra' }).click()

  // One set at a time: fill the open set in, press "Hecho", and the next one opens.
  await page.getByRole('textbox', { name: 'Peso (kg)', exact: true }).fill('80')
  await page.getByRole('textbox', { name: 'Reps', exact: true }).fill('5')
  await page.getByRole('button', { name: 'Anotar esfuerzo (RPE)' }).click()
  await page.getByRole('button', { name: 'RPE 8', exact: true }).click()
  await page.getByRole('button', { name: 'Completar serie 1' }).click()

  await expect(page.getByText('1 serie completada')).toBeVisible()

  await page.getByRole('button', { name: 'Añadir serie' }).click()
  // The new set carries the previous one's numbers over, which is the point of the button.
  await expect(page.getByRole('textbox', { name: 'Peso (kg)', exact: true })).toHaveValue('80')
  await page.getByRole('button', { name: 'Completar serie 2' }).click()

  await expect(page.getByText('2 series completadas')).toBeVisible()

  await page.getByRole('button', { name: 'Terminar y guardar' }).click()

  await expect(page.getByText('Entreno guardado')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tu entrenamiento, medido' })).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Entreno libre' })).toContainText('2 series')
})
