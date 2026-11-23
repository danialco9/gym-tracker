import { DownloadIcon, ImagePlusIcon, TriangleAlertIcon } from 'lucide-react'
import { type ChangeEvent, type ComponentProps, useEffect, useId, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { formatDay, formatKg, formatShortDay, formatSignedKg } from '@/lib/format'
import { needsIosInstall } from '@/lib/install'
import { cn } from '@/lib/utils'
import { localToday } from './measurement-form'
import { useAddPhoto, useDeletePhoto, usePhotos } from './photo-queries'
import type { ProgressPhoto } from './photo-store'
import { type WeighIn, weighInNear } from './photo-weight'

/** A stored image, shown through a temporary URL that is released when it goes away. */
function BlobImage({ image, ...props }: { image: Blob } & Omit<ComponentProps<'img'>, 'src'>) {
  const ref = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(image)
    if (ref.current !== null) {
      ref.current.src = url
    }
    return () => URL.revokeObjectURL(url)
  }, [image])
  return <img ref={ref} {...props} />
}

function Thumbnail({ photo, onOpen }: { photo: ProgressPhoto; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Foto del ${formatDay(photo.takenOn)}`}
      className="bg-muted ring-foreground/10 relative aspect-[3/4] overflow-hidden rounded-lg ring-1"
    >
      <BlobImage image={photo.image} alt="" className="size-full object-cover" />
      <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-0.5 text-left text-xs text-white tabular-nums">
        {formatShortDay(photo.takenOn)}
      </span>
    </button>
  )
}

/** Saves a copy of the photo, to keep it somewhere else than this browser. */
function downloadPhoto(photo: ProgressPhoto) {
  const url = URL.createObjectURL(photo.image)
  const link = document.createElement('a')
  link.href = url
  link.download = `foto-progreso-${photo.takenOn}.jpg`
  link.click()
  // The download has started by then; the URL only holds the image in memory.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function ComparedPhoto({
  label,
  photo,
  weighIn,
  onOpen,
}: {
  label: string
  photo: ProgressPhoto
  weighIn: WeighIn | undefined
  onOpen: () => void
}) {
  return (
    <figure className="min-w-0 space-y-1">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${label}: foto del ${formatDay(photo.takenOn)}`}
        className="bg-muted ring-foreground/10 block aspect-[3/4] w-full overflow-hidden rounded-lg ring-1"
      >
        <BlobImage image={photo.image} alt="" className="size-full object-cover" />
      </button>
      <figcaption className="text-sm">
        <span className="font-medium">{label}</span>{' '}
        <span className="text-muted-foreground tabular-nums">· {formatShortDay(photo.takenOn)}</span>
        {weighIn !== undefined && (
          <span className="text-muted-foreground block tabular-nums">
            {formatKg(weighIn.kg)}
            {weighIn.on !== photo.takenOn && ` (${formatShortDay(weighIn.on)})`}
          </span>
        )}
      </figcaption>
    </figure>
  )
}

/** The first photo next to the latest one: the change over the whole time, at a glance. */
function Comparison({
  first,
  last,
  weights,
  onOpen,
}: {
  first: ProgressPhoto
  last: ProgressPhoto
  weights: ReadonlyMap<string, number>
  onOpen: (photo: ProgressPhoto) => void
}) {
  const before = weighInNear(weights, first.takenOn)
  const after = weighInNear(weights, last.takenOn)
  return (
    <div className="bg-card space-y-2 rounded-xl border p-3">
      <div className="grid grid-cols-2 gap-2">
        <ComparedPhoto label="Antes" photo={first} weighIn={before} onOpen={() => onOpen(first)} />
        <ComparedPhoto label="Ahora" photo={last} weighIn={after} onOpen={() => onOpen(last)} />
      </div>
      {before !== undefined && after !== undefined && (
        <p className="text-muted-foreground text-sm tabular-nums">
          {formatSignedKg(Math.round((after.kg - before.kg) * 100) / 100)} entre las dos fotos
        </p>
      )}
    </div>
  )
}

function NewPhoto({
  file,
  saving,
  failed,
  onSave,
  onCancel,
}: {
  file: File
  saving: boolean
  failed: boolean
  onSave: (takenOn: string) => void
  onCancel: () => void
}) {
  const dateId = useId()
  const [takenOn, setTakenOn] = useState(localToday)
  return (
    <div className="bg-card space-y-3 rounded-xl border p-3">
      <div className="flex gap-3">
        <BlobImage
          image={file}
          alt="Foto nueva"
          className="aspect-[3/4] w-24 shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={dateId}>Día de la foto</Label>
          <Input
            id={dateId}
            type="date"
            max={localToday()}
            value={takenOn}
            onChange={(event) => setTakenOn(event.target.value)}
          />
        </div>
      </div>
      {failed && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>No se pudo guardar la foto en este móvil.</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button className="flex-1" disabled={saving || takenOn === ''} onClick={() => onSave(takenOn)}>
          {saving ? 'Guardando…' : 'Guardar foto'}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}

function PhotoSheet({
  photo,
  weighIn,
  deleting,
  onDelete,
  onClose,
}: {
  photo: ProgressPhoto | null
  weighIn: WeighIn | undefined
  deleting: boolean
  onDelete: (photo: ProgressPhoto) => void
  onClose: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  return (
    <Sheet
      open={photo !== null}
      onOpenChange={(open) => {
        if (!open) {
          setConfirming(false)
          onClose()
        }
      }}
    >
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[95dvh] max-w-2xl gap-3 overflow-y-auto overscroll-contain rounded-t-xl p-4"
      >
        {photo !== null && (
          <>
            <div className="pr-8">
              <SheetTitle className="text-lg font-semibold first-letter:uppercase">
                {formatDay(photo.takenOn)}
              </SheetTitle>
              <SheetDescription>
                {weighIn === undefined
                  ? 'Sin pesaje cerca de ese día'
                  : weighIn.on === photo.takenOn
                    ? `${formatKg(weighIn.kg)} ese día`
                    : `${formatKg(weighIn.kg)} el ${formatDay(weighIn.on)}`}
              </SheetDescription>
            </div>
            <BlobImage
              image={photo.image}
              alt={`Foto del ${formatDay(photo.takenOn)}`}
              className="max-h-[65dvh] w-full rounded-lg object-contain"
            />
            <Button variant="outline" onClick={() => downloadPhoto(photo)}>
              <DownloadIcon aria-hidden />
              Descargar
            </Button>
            {confirming ? (
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={deleting}
                  onClick={() => onDelete(photo)}
                >
                  Sí, borrar
                </Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  No
                </Button>
              </div>
            ) : (
              <Button variant="ghost" className="text-destructive" onClick={() => setConfirming(true)}>
                Borrar foto
              </Button>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/**
 * Progress photos next to the weight: they show what the scale does not. They stay on this phone,
 * so they are never uploaded anywhere.
 */
export function ProgressPhotos({
  userId,
  weights,
}: {
  userId: number
  weights: ReadonlyMap<string, number>
}) {
  const inputId = useId()
  const photos = usePhotos(userId)
  const addPhoto = useAddPhoto(userId)
  const removePhoto = useDeletePhoto(userId)
  const [picked, setPicked] = useState<File | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const open = photos.data?.find((photo) => photo.id === openId) ?? null

  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    // Lets the same photo be picked again after cancelling.
    event.target.value = ''
    if (file !== undefined) {
      addPhoto.reset()
      setPicked(file)
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-medium">Fotos</h2>
        <input id={inputId} type="file" accept="image/*" className="sr-only" onChange={pick} />
        <label
          htmlFor={inputId}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'cursor-pointer')}
        >
          <ImagePlusIcon aria-hidden />
          Añadir foto
        </label>
      </div>

      {picked !== null && (
        <NewPhoto
          key={`${picked.name}-${picked.lastModified}`}
          file={picked}
          saving={addPhoto.isPending}
          failed={addPhoto.isError}
          onCancel={() => setPicked(null)}
          onSave={(takenOn) =>
            addPhoto.mutate({ file: picked, takenOn }, { onSuccess: () => setPicked(null) })
          }
        />
      )}

      {photos.isError && (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertDescription>Este navegador no deja guardar fotos.</AlertDescription>
        </Alert>
      )}

      {photos.data !== undefined && photos.data.length === 0 && picked === null && (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          Una foto cada pocas semanas, con la misma luz y postura, enseña lo que la báscula no.
        </p>
      )}

      {photos.data !== undefined && photos.data.length >= 2 && (
        <Comparison
          first={photos.data[0]!}
          last={photos.data.at(-1)!}
          weights={weights}
          onOpen={(photo) => setOpenId(photo.id)}
        />
      )}

      {photos.data !== undefined && photos.data.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.data.toReversed().map((photo) => (
            <li key={photo.id}>
              <Thumbnail photo={photo} onOpen={() => setOpenId(photo.id)} />
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted-foreground text-xs">
        Se guardan solo en este móvil: no se suben a ningún sitio.
        {needsIosInstall() &&
          ' En iPhone, añade la app a la pantalla de inicio para que Safari no las borre si pasas días sin abrirla.'}
      </p>

      <PhotoSheet
        photo={open}
        weighIn={open === null ? undefined : weighInNear(weights, open.takenOn)}
        deleting={removePhoto.isPending}
        onClose={() => setOpenId(null)}
        onDelete={(photo) => removePhoto.mutate(photo.id, { onSuccess: () => setOpenId(null) })}
      />
    </section>
  )
}
