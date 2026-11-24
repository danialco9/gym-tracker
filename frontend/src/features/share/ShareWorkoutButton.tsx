import { LoaderCircleIcon, Share2Icon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useProgressOverview } from '@/features/progress/queries'
import { useExercises } from '@/features/workout/queries'
import type { Workout } from '@/lib/types'
import { shareCardPng } from './share-card'
import { shareCardData } from './share-card-data'

function download(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Opens the phone's share sheet with the workout card, so it goes to WhatsApp or Instagram. Where the
 * browser cannot share files (most desktops), the card is downloaded instead.
 */
export function ShareWorkoutButton({ workout, title }: { workout: Workout; title: string }) {
  const exercises = useExercises()
  const overview = useProgressOverview()
  const [busy, setBusy] = useState(false)

  const share = async () => {
    setBusy(true)
    try {
      const names = new Map((exercises.data ?? []).map((exercise) => [exercise.id, exercise.name]))
      const data = shareCardData(workout, title, names, overview.data?.personal_records ?? [])
      const png = await shareCardPng(data)
      const file = new File([png], `entreno-${workout.started_at.slice(0, 10)}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title })
        } catch (error) {
          // Closing the sheet is a choice, not an error. Safari refuses a share that comes too long
          // after the tap: the card is still handed over, as a download.
          if (error instanceof DOMException && error.name === 'AbortError') {
            return
          }
          if (error instanceof DOMException && error.name === 'NotAllowedError') {
            download(file)
            return
          }
          throw error
        }
      } else {
        download(file)
      }
    } catch {
      toast.error('No se pudo preparar la imagen del entreno.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-muted-foreground -my-1 -mr-2 size-10 shrink-0"
      aria-label={`Compartir entreno: ${title}`}
      disabled={busy}
      onClick={() => void share()}
    >
      {busy ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <Share2Icon aria-hidden />}
    </Button>
  )
}
