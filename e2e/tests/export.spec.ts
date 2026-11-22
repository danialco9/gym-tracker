import { readFile } from 'node:fs/promises'
import type { Download } from '@playwright/test'
import { expect, test } from './fixtures'

const contentOf = async (download: Download) => readFile(await download.path(), 'utf8')

test('downloads workouts and measurements as CSV files for a spreadsheet in Spanish', async ({ page }) => {
  // The account's data, through the API with the page's own session.
  const exercises = (await (await page.request.get('/api/exercises')).json()) as { id: number; name: string }[]
  const exercise = exercises[0]!
  const workout = await page.request.post('/api/workouts', {
    data: {
      started_at: '2026-11-18T18:30:00+01:00',
      notes: 'Buen día',
      sets: [{ exercise_id: exercise.id, set_number: 1, reps: 8, weight_kg: 37.5, rpe: 8 }],
    },
  })
  expect(workout.ok()).toBe(true)
  const measurement = await page.request.post('/api/measurements', {
    data: { measured_on: '2026-11-15', weight_kg: 78.5 },
  })
  expect(measurement.ok()).toBe(true)

  await page.goto('/cuenta')

  const [workouts] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /Descargar entrenos/ }).click(),
  ])
  expect(workouts.suggestedFilename()).toMatch(/^entrenos-\d{4}-\d{2}-\d{2}\.csv$/)
  // A byte order mark first, so Excel reads the accents; ";" and decimal commas for Spanish.
  expect((await contentOf(workouts)).split('\r\n')).toEqual([
    '﻿fecha;hora;rutina;ejercicio;serie;calentamiento;kg;reps;rir;notas',
    `2026-11-18;18:30;;${exercise.name};1;no;37,5;8;2;Buen día`,
    '',
  ])

  const [measurements] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: /Descargar medidas/ }).click(),
  ])
  expect(measurements.suggestedFilename()).toMatch(/^medidas-\d{4}-\d{2}-\d{2}\.csv$/)
  expect((await contentOf(measurements)).split('\r\n')).toEqual([
    '﻿fecha;peso_kg;grasa_pct;cintura_cm;pecho_cm;brazo_cm;muslo_cm;notas',
    '2026-11-15;78,5;;;;;;',
    '',
  ])
})
