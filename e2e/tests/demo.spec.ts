import { expect, test } from '@playwright/test'

// The visitor arriving from the README has no account: this is the whole of their first minute.
test.use({ storageState: { cookies: [], origins: [] } })

test('a visitor opens the demo and lands on a home page with training in it', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible()
  await page.getByRole('button', { name: 'Probar la demo' }).click()

  await expect(page.getByRole('heading', { name: /^Hola/ })).toBeVisible()
  // The demo is seeded with 12 weeks of training, so the recent workouts must not be empty.
  await expect(page.getByText('Todavía no has registrado ningún entreno.')).toBeHidden()
  await expect(page.getByRole('link', { name: 'Empezar entreno' })).toBeVisible()
})
