import type { APIRequestContext, Page } from '@playwright/test'
import { expect, test } from './fixtures'

const PENDING = '1 entreno pendiente de subir'

/** Starts a free workout with one completed set, ready to be finished. */
async function logOneSet(page: Page) {
  await page.goto('/entrenar')
  await page.getByRole('button', { name: 'Entreno libre' }).click()
  await page.getByRole('button', { name: 'Añadir ejercicio' }).click()
  await page.getByLabel('Buscar ejercicio').fill('sentadilla con barra')
  await page.getByRole('button', { name: 'Sentadilla con barra' }).click()
  await page.getByRole('textbox', { name: 'Peso (kg)', exact: true }).fill('80')
  await page.getByRole('button', { name: 'Completar serie 1' }).click()
  await expect(page.getByText('1 de 1 serie')).toBeVisible()
}

async function savedWorkouts(request: APIRequestContext) {
  const response = await request.get('/api/workouts')
  expect(response.ok()).toBe(true)
  return (await response.json()) as { sets: unknown[] }[]
}

test('keeps a workout finished with no coverage through a reload and sends it when the connection returns', async ({
  page,
  context,
}) => {
  await page.goto('/')
  // The app only opens offline once its service worker controls the page.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await logOneSet(page)

  await context.setOffline(true)
  await page.getByRole('button', { name: 'Terminar y guardar' }).click()

  await expect(page.getByText(/Sin conexión: el entreno se ha quedado en el móvil/)).toBeVisible()
  await expect(page.getByText(PENDING)).toBeVisible()

  // Closing and reopening the app in the gym: the shell comes from the service worker and the
  // queue from the phone's storage.
  await page.reload()
  await expect(page.getByText(PENDING)).toBeVisible()

  await context.setOffline(false)

  await expect(page.getByText(/1 entreno subido al volver la conexión/)).toBeVisible()
  await expect(page.getByText(PENDING)).toBeHidden()
  await expect(page.getByRole('listitem').filter({ hasText: 'Entreno libre' })).toContainText('1 serie')
  expect(await savedWorkouts(page.request)).toHaveLength(1)
})

test('does not save a workout twice when the answer to the first attempt is lost', async ({ page }) => {
  await logOneSet(page)

  // The request reaches the server and the workout is saved, but the answer never makes it back:
  // the phone cannot tell this apart from a request that never left.
  let lostAnswers = 0
  await page.route('**/api/workouts', async (route) => {
    if (route.request().method() !== 'POST' || lostAnswers > 0) {
      await route.fallback()
      return
    }
    lostAnswers += 1
    await route.fetch()
    await route.abort('connectionreset')
  })

  await page.getByRole('button', { name: 'Terminar y guardar' }).click()

  // Queued and sent again on its own; the server recognises it by its client id.
  await expect(page.getByText(/1 entreno subido al volver la conexión/)).toBeVisible({ timeout: 45_000 })
  await expect(page.getByText(PENDING)).toBeHidden()
  expect(lostAnswers).toBe(1)
  const workouts = await savedWorkouts(page.request)
  expect(workouts).toHaveLength(1)
  expect(workouts[0].sets).toHaveLength(1)
})
