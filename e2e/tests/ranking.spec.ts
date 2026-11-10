import { expect, test } from './fixtures'

const TIERS = /Bronce|Plata|Oro|Platino|Diamante|Esmeralda|Rubí|Máster/

test('gets a strength tier per zone against gym-goers, with nobody else listed', async ({ page }) => {
  // A workout with weight is the setup: the API saves it as the workout screen would.
  const exercises: { id: number; slug: string }[] = await (await page.request.get('/api/exercises')).json()
  const squat = exercises.find((exercise) => exercise.slug === 'back-squat')
  expect(squat, 'the catalog has the back squat').toBeDefined()
  const workout = await page.request.post('/api/workouts', {
    data: {
      started_at: new Date().toISOString(),
      sets: [{ exercise_id: squat!.id, set_number: 1, reps: 5, weight_kg: 100 }],
    },
  })
  expect(workout.ok()).toBe(true)

  // Without a body weight there is no tier: the ranking asks for one.
  await page.goto('/ranking')
  await expect(page.getByRole('heading', { name: 'Ranking de fuerza' })).toBeVisible()
  await page.getByRole('link', { name: /Apunta tu peso/ }).click()
  await expect(page.getByRole('heading', { name: 'Medidas' })).toBeVisible()
  await page.getByLabel('Peso (kg)').fill('80')
  await page.getByRole('button', { name: 'Guardar medida' }).click()
  await expect(page.getByText('Medida guardada')).toBeVisible()

  // Next it asks who to be compared with, which is set in the account screen.
  await page.goto('/ranking')
  await page.getByRole('link', { name: /¿Con quién te comparamos\?/ }).click()
  await page.getByRole('radio', { name: 'Hombres' }).click()
  await expect(page.getByRole('radio', { name: 'Hombres' })).toHaveAttribute('aria-checked', 'true')

  // The page opens on the best zone: the legs, the only one with a lift.
  await page.goto('/ranking')
  await expect(page.getByRole('radio', { name: /Pierna/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('region', { name: 'Tu rango' })).toContainText(TIERS)
  await expect(page.getByRole('region', { name: 'Tu rango' })).toContainText(/Más fuerte que el \d+ %/)
  // The set behind it is shown to its owner only.
  await expect(page.getByText('Tu mejor: 100 kg × 5')).toBeVisible()
  // Nobody is listed: the ranking is the user against gym-goers at large.
  await expect(page.getByRole('list', { name: 'Clasificación' })).toHaveCount(0)
  await expect(page.getByText(/Puesto \d+/)).toHaveCount(0)
})
