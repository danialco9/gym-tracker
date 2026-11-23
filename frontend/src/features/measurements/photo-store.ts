/**
 * Progress photos, kept only on this device in IndexedDB and never sent to the server.
 *
 * Each one belongs to the user who took it, so another account signed in on the same phone does
 * not see them. Deleting the account deletes them too.
 */

const DATABASE = 'gym-tracker-photos'
const STORE = 'photos'
const BY_USER = 'userId'

export interface ProgressPhoto {
  id: string
  userId: number
  /** The day the photo shows, `YYYY-MM-DD`. */
  takenOn: string
  /** When it was added, to order photos of the same day. */
  addedAt: string
  image: Blob
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
  })
}

let opening: Promise<IDBDatabase> | null = null

function database(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex(BY_USER, 'userId')
    }
    request.onsuccess = () => {
      // Another tab upgrading the database closes this connection; the next call opens a new one.
      request.result.onversionchange = () => {
        request.result.close()
        opening = null
      }
      resolve(request.result)
    }
    request.onerror = () => {
      opening = null
      reject(request.error ?? new Error('IndexedDB could not open'))
    }
  })
  return opening
}

/** The user's photos, oldest day first. */
export async function listPhotos(userId: number): Promise<ProgressPhoto[]> {
  const store = (await database()).transaction(STORE, 'readonly').objectStore(STORE)
  const photos = await requestResult(store.index(BY_USER).getAll(userId) as IDBRequest<ProgressPhoto[]>)
  return photos.toSorted((a, b) => a.takenOn.localeCompare(b.takenOn) || a.addedAt.localeCompare(b.addedAt))
}

export async function savePhoto(photo: ProgressPhoto): Promise<void> {
  const transaction = (await database()).transaction(STORE, 'readwrite')
  transaction.objectStore(STORE).put(photo)
  await transactionDone(transaction)
}

export async function deletePhoto(id: string): Promise<void> {
  const transaction = (await database()).transaction(STORE, 'readwrite')
  transaction.objectStore(STORE).delete(id)
  await transactionDone(transaction)
}

export async function deleteUserPhotos(userId: number): Promise<void> {
  const transaction = (await database()).transaction(STORE, 'readwrite')
  const store = transaction.objectStore(STORE)
  const ids = await requestResult(store.index(BY_USER).getAllKeys(userId))
  for (const id of ids) {
    store.delete(id)
  }
  await transactionDone(transaction)
}

/** Closes the connection, so tests can start each one from an empty database. */
export function closePhotoDatabase(): void {
  void opening?.then((connection) => connection.close())
  opening = null
}

/** Long side of a stored photo: sharp on a phone screen, a few hundred kB as JPEG. */
const MAX_SIDE = 1280

/**
 * The photo redrawn at most 1280 px on its long side, as JPEG. Redrawing it also leaves out what
 * the camera wrote inside the file, such as where it was taken.
 */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error('Could not encode the photo')) : resolve(blob)),
      'image/jpeg',
      0.82,
    )
  })
}
