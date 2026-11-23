import { screen, within } from '@testing-library/react'
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BodyMeasurement, User } from '@/lib/types'
import { mockApi } from '@/test/mock-api'
import { renderRoute } from '@/test/render'
import { closePhotoDatabase, listPhotos, savePhoto } from './photo-store'

vi.mock('@/features/progress/ProgressCharts', () => ({ BodyWeightChart: () => null }))
// jsdom cannot decode or draw images: the photo is kept as it comes.
vi.mock('./photo-store', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./photo-store')>()),
  shrinkPhoto: async (file: Blob) => file,
}))

const USER: User = {
  id: 1,
  email: 'dani@example.com',
  goal: null,
  nickname: null,
  sex: null,
  created_at: '2026-09-15T10:00:00Z',
}

const WEIGHT: BodyMeasurement = {
  id: 1,
  measured_on: '2026-11-20',
  weight_kg: 78.4,
  body_fat_pct: null,
  waist_cm: null,
  chest_cm: null,
  arm_cm: null,
  thigh_cm: null,
  notes: null,
}

const image = () => new File(['jpeg'], 'IMG_0001.jpg', { type: 'image/jpeg' })

describe('Progress photos', () => {
  beforeEach(() => {
    closePhotoDatabase()
    vi.stubGlobal('indexedDB', new IDBFactory())
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: () => 'blob:photo', revokeObjectURL: () => {} }),
    )
    mockApi({ 'GET /auth/me': { body: USER }, 'GET /measurements': { body: [WEIGHT] } })
  })

  it('keeps a photo on the phone for the day chosen, and shows that day’s weight', async () => {
    const { user } = renderRoute('/medidas')

    expect(await screen.findByText(/enseña lo que la báscula no/)).toBeInTheDocument()
    expect(screen.getByText(/Se guardan solo en este móvil/)).toBeInTheDocument()

    await user.upload(screen.getByLabelText('Añadir foto'), image())
    const day = screen.getByLabelText('Día de la foto')
    await user.clear(day)
    await user.type(day, '2026-11-20')
    await user.click(screen.getByRole('button', { name: 'Guardar foto' }))

    const thumbnail = await screen.findByRole('button', { name: /Foto del vie, 20 nov/ })
    expect(screen.queryByText(/enseña lo que la báscula no/)).not.toBeInTheDocument()
    const [saved] = await listPhotos(USER.id)
    expect(saved?.takenOn).toBe('2026-11-20')

    await user.click(thumbnail)
    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByText('78,4 kg ese día')).toBeInTheDocument()
  })

  it('deletes a photo after asking', async () => {
    const { user } = renderRoute('/medidas')
    await user.upload(await screen.findByLabelText('Añadir foto'), image())
    await user.click(screen.getByRole('button', { name: 'Guardar foto' }))
    await user.click(await screen.findByRole('button', { name: /Foto del/ }))

    const sheet = await screen.findByRole('dialog')
    await user.click(within(sheet).getByRole('button', { name: 'Borrar foto' }))
    await user.click(within(sheet).getByRole('button', { name: 'Sí, borrar' }))

    expect(await screen.findByText(/enseña lo que la báscula no/)).toBeInTheDocument()
    expect(await listPhotos(USER.id)).toEqual([])
  })

  it('lets the photo go without saving it', async () => {
    const { user } = renderRoute('/medidas')
    await user.upload(await screen.findByLabelText('Añadir foto'), image())

    await user.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByLabelText('Día de la foto')).not.toBeInTheDocument()
    expect(await listPhotos(USER.id)).toEqual([])
  })

  it('puts the first photo next to the latest, with the weight change between them', async () => {
    mockApi({
      'GET /auth/me': { body: USER },
      'GET /measurements': {
        body: [{ ...WEIGHT, id: 2, measured_on: '2026-09-01', weight_kg: 81.6 }, WEIGHT],
      },
    })
    for (const [id, takenOn] of [
      ['first', '2026-09-01'],
      ['middle', '2026-10-10'],
      ['last', '2026-11-20'],
    ] as const) {
      await savePhoto({ id, userId: USER.id, takenOn, addedAt: `${takenOn}T08:00:00Z`, image: image() })
    }
    const { user } = renderRoute('/medidas')

    expect(await screen.findByRole('button', { name: /^Antes: foto del mar, 1 sept/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Ahora: foto del vie, 20 nov/ })).toBeInTheDocument()
    expect(screen.getByText('-3,2 kg entre las dos fotos')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^Antes:/ }))
    expect(within(await screen.findByRole('dialog')).getByText('81,6 kg ese día')).toBeInTheDocument()
  })

  it('downloads a copy of a photo', async () => {
    await savePhoto({
      id: 'a',
      userId: USER.id,
      takenOn: '2026-11-20',
      addedAt: '2026-11-20T08:00:00Z',
      image: image(),
    })
    const clicked: HTMLAnchorElement[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this)
    })
    const { user } = renderRoute('/medidas')

    await user.click(await screen.findByRole('button', { name: /Foto del/ }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Descargar' }))

    expect(clicked.map((link) => link.download)).toEqual(['foto-progreso-2026-11-20.jpg'])
  })
})
