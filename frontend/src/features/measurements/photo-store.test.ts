import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  closePhotoDatabase,
  deletePhoto,
  deleteUserPhotos,
  listPhotos,
  type ProgressPhoto,
  savePhoto,
} from './photo-store'

const photo = (
  id: string,
  userId: number,
  takenOn: string,
  addedAt = '2026-11-23T10:00:00Z',
): ProgressPhoto => ({
  id,
  userId,
  takenOn,
  addedAt,
  image: new Blob(['jpeg'], { type: 'image/jpeg' }),
})

describe('photo store', () => {
  beforeEach(() => {
    closePhotoDatabase()
    vi.stubGlobal('indexedDB', new IDBFactory())
  })

  it('lists only the user’s photos, oldest day first', async () => {
    await savePhoto(photo('b', 1, '2026-11-20'))
    await savePhoto(photo('a', 1, '2026-10-01'))
    await savePhoto(photo('c', 1, '2026-11-20', '2026-11-20T08:00:00Z'))
    await savePhoto(photo('other', 2, '2026-10-15'))

    expect((await listPhotos(1)).map(({ id }) => id)).toEqual(['a', 'c', 'b'])
    expect((await listPhotos(2)).map(({ id }) => id)).toEqual(['other'])
  })

  it('deletes one photo, or all of a user’s', async () => {
    await savePhoto(photo('a', 1, '2026-10-01'))
    await savePhoto(photo('b', 1, '2026-11-20'))
    await savePhoto(photo('other', 2, '2026-10-15'))

    await deletePhoto('a')
    expect((await listPhotos(1)).map(({ id }) => id)).toEqual(['b'])

    await deleteUserPhotos(1)
    expect(await listPhotos(1)).toEqual([])
    expect(await listPhotos(2)).toHaveLength(1)
  })
})
