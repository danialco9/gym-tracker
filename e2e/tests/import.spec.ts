import { expect, test } from './fixtures'

// A Hevy export: one name the app matches on its own, one it asks about, and a cardio row it skips.
const HEVY = [
  '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"',
  '"Pierna","15 Jan 2024, 10:30","15 Jan 2024, 11:40","","Squat (Barbell)",,"",0,"warmup",60,8,,,',
  '"Pierna","15 Jan 2024, 10:30","15 Jan 2024, 11:40","","Squat (Barbell)",,"",1,"normal",100,5,,,8',
  '"Pierna","15 Jan 2024, 10:30","15 Jan 2024, 11:40","","Calf Raise (Machine)",,"",0,"normal",80,12,,,',
  '"Pierna","15 Jan 2024, 10:30","15 Jan 2024, 11:40","","Treadmill",,"",0,"normal",,,1.5,600,',
  '',
].join('\n')

const csv = { name: 'workouts.csv', mimeType: 'text/csv', buffer: Buffer.from(HEVY) }

test('imports a Hevy export, asking only about the exercise it could not match', async ({ page }) => {
  await page.goto('/cuenta')
  await page.getByRole('link', { name: /Importar entrenos/ }).click()

  await page.getByLabel('Elegir archivo CSV').setInputFiles(csv)

  await expect(page.getByRole('heading', { name: 'Elige los ejercicios' })).toBeVisible()
  await expect(page.getByText('Squat (Barbell)')).toHaveCount(0)
  await page.getByRole('button', { name: 'Elevación de gemelos de pie' }).click()
  await page.getByRole('button', { name: 'Seguir' }).click()

  await expect(page.getByText('Desde Hevy')).toBeVisible()
  await expect(page.getByText('1 entreno · 3 series')).toBeVisible()
  await expect(page.getByText('El 15 ene 2024')).toBeVisible()
  await expect(page.getByText(/Se salta 1 fila/)).toBeVisible()
  await page.getByRole('button', { name: 'Importar 1 entreno' }).click()

  await expect(page.getByText(/Listo: 1 entreno importado con 3 series/)).toBeVisible()
  const workouts = (await (await page.request.get('/api/workouts')).json()) as {
    started_at: string
    sets: { weight_kg: number; reps: number; is_warmup: boolean }[]
  }[]
  expect(workouts).toHaveLength(1)
  // 10:30 in Madrid, and the warm-up kept as one.
  expect(workouts[0]!.started_at).toBe('2024-01-15T09:30:00Z')
  expect(workouts[0]!.sets.map(({ weight_kg, reps, is_warmup }) => [weight_kg, reps, is_warmup])).toEqual([
    [60, 8, true],
    [100, 5, false],
    [80, 12, false],
  ])

  // The same file again adds nothing.
  await page.goto('/importar')
  await page.getByLabel('Elegir archivo CSV').setInputFiles(csv)
  await expect(page.getByRole('heading', { name: 'Ya lo tienes todo' })).toBeVisible()
})

test('explains a file that is not an export it knows', async ({ page }) => {
  await page.goto('/importar')

  await page
    .getByLabel('Elegir archivo CSV')
    .setInputFiles({ name: 'otro.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') })

  await expect(page.getByText(/no parece una exportación de Strong, de Hevy ni de esta app/)).toBeVisible()
})
