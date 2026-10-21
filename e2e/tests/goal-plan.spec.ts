import { expect, test } from './fixtures'

test("picks a goal, follows today's plan for a routine and earns XP for the workout", async ({ page }) => {
  // The routine is the setup, not the flow under test, so it is created through the API.
  const exercises: { id: number; slug: string }[] = await (await page.request.get('/api/exercises')).json()
  const squat = exercises.find((exercise) => exercise.slug === 'back-squat')
  expect(squat, 'the catalog has the back squat').toBeDefined()
  const routine = await page.request.post('/api/routines', {
    data: {
      name: 'Pierna',
      exercises: [
        {
          exercise_id: squat!.id,
          sets: [
            { target_reps: 8, target_weight_kg: 60 },
            { target_reps: 8, target_weight_kg: 60 },
          ],
        },
      ],
    },
  })
  expect(routine.ok()).toBe(true)

  // The first visit to the home screen is the "before" the XP is counted from.
  await page.goto('/')
  await expect(page.getByText('0 / 100 XP para el nivel 2')).toBeVisible()
  await page.getByRole('link', { name: /Elige tu objetivo/ }).click()

  await page.getByRole('button', { name: /Ganar músculo/ }).click()
  await expect(page.getByText('RPE 8–9')).toBeVisible()
  await page.getByRole('button', { name: 'Guardar objetivo' }).click()
  await expect(page.getByRole('heading', { name: 'Tu entrenamiento, medido' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Elige tu objetivo/ })).toHaveCount(0)

  // A routine opens today's plan first, tuned to the goal just chosen.
  await page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Entrenar' }).click()
  await page.getByRole('button', { name: /Pierna/ }).click()
  await expect(page.getByRole('heading', { name: 'Pierna' })).toBeVisible()
  await expect(page.getByText('Ganar músculo · RPE 8–9 · descanso 2–3 min')).toBeVisible()
  const plan = page.getByRole('list', { name: 'Ejercicios de hoy' })
  await expect(plan.getByText('Sentadilla con barra')).toBeVisible()
  await expect(plan.getByText('2 × 8 · 60 kg')).toBeVisible()

  await page.getByRole('button', { name: 'Empezar con este plan' }).click()

  // The routine's targets prefill the card; after the first set the rest takes the whole screen,
  // as long as the goal asks for.
  await expect(page.getByRole('textbox', { name: 'Peso (kg)', exact: true })).toHaveValue('60')
  await page.getByRole('button', { name: 'Completar serie 1' }).click()
  const rest = page.getByRole('dialog', { name: 'Descanso' })
  await expect(rest.getByRole('timer')).toHaveText(/^(2:00|1:59|1:58)$/)
  await rest.getByRole('button', { name: 'Ya estoy listo' }).click()
  await expect(rest).toBeHidden()

  // No rest after the last set of the workout: it is time to save.
  await page.getByRole('button', { name: 'Completar serie 2' }).click()
  await expect(page.getByRole('dialog', { name: 'Descanso' })).toBeHidden()
  await page.getByRole('button', { name: 'Terminar y guardar' }).click()

  // Back home, the workout is celebrated: +10 for the workout and +1 per set.
  await expect(page.getByText('Entreno guardado')).toBeVisible()
  await expect(page.getByText('+12 XP')).toBeVisible()
  await expect(page.getByText('12 / 100 XP para el nivel 2')).toBeVisible()
})
