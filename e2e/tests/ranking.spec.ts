import { randomUUID } from 'node:crypto'
import { expect, test } from './fixtures'

const TIERS = /Bronce|Plata|Oro|Platino|Diamante|Esmeralda|Rubí|Máster/

test('appears in the strength ranking under a nickname, with a tier and no weights', async ({ page }) => {
  // Unique per run, since nicknames are, and within the 3-20 letters, digits, "_" or "." allowed.
  const nickname = `e2e_${randomUUID().slice(0, 8)}`

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

  // Until a nickname is chosen the list shows "Atleta N"; pick one in the account screen.
  await page.goto('/ranking')
  await page.getByRole('link', { name: /Elige tu apodo/ }).click()
  await page.getByRole('button', { name: /Sin elegir · sales como Atleta/ }).click()
  await page.getByRole('textbox', { name: 'Tu apodo' }).fill(nickname)
  await page.getByRole('button', { name: 'Guardar' }).click()
  await expect(page.getByRole('button', { name: new RegExp(nickname) })).toBeVisible()

  await page.goto('/ranking')
  await expect(page.getByRole('region', { name: 'Tu rango' })).toContainText(TIERS)
  const me = page
    .getByRole('list', { name: 'Clasificación' })
    .getByRole('listitem')
    .filter({ hasText: `${nickname} (tú)` })
  await expect(me).toContainText(TIERS)
  // Only the tier is public: never the kilos lifted nor the body weight.
  await expect(me).not.toContainText(/kg/)

  // The same, for one exercise on its own.
  await page.getByLabel('Ver').selectOption({ label: 'Sentadilla con barra' })
  await expect(
    page
      .getByRole('list', { name: 'Clasificación' })
      .getByRole('listitem')
      .filter({ hasText: `${nickname} (tú)` }),
  ).toContainText(TIERS)
})
