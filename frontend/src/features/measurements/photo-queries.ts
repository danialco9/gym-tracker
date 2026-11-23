import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { randomId } from '@/lib/id'
import { deletePhoto, listPhotos, savePhoto, shrinkPhoto } from './photo-store'

const photoKeys = { user: (userId: number | undefined) => ['progress-photos', userId] as const }

// The photos live on the device: reading and writing them never waits for a connection.
const LOCAL = { networkMode: 'always' } as const

export function usePhotos(userId: number | undefined) {
  return useQuery({
    ...LOCAL,
    queryKey: photoKeys.user(userId),
    queryFn: () => (userId === undefined ? [] : listPhotos(userId)),
    enabled: userId !== undefined,
    staleTime: Infinity,
  })
}

export function useAddPhoto(userId: number | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    ...LOCAL,
    mutationFn: async ({ file, takenOn }: { file: Blob; takenOn: string }) => {
      if (userId === undefined) {
        throw new Error('No user to keep the photo for')
      }
      // Asks the browser not to clear the site's storage when the phone runs short of space.
      void navigator.storage?.persist?.().catch(() => false)
      await savePhoto({
        id: randomId(),
        userId,
        takenOn,
        addedAt: new Date().toISOString(),
        image: await shrinkPhoto(file),
      })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: photoKeys.user(userId) }),
  })
}

export function useDeletePhoto(userId: number | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    ...LOCAL,
    mutationFn: deletePhoto,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: photoKeys.user(userId) }),
  })
}
