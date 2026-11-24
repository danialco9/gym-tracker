import { NotebookPenIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useExerciseNote, useSaveExerciseNote } from './queries'

// As long as the API takes.
const NOTE_MAX_LENGTH = 200

/**
 * The note kept on an exercise ("asiento en 4"), at the top of its card: a tap opens it to edit.
 * While editing, a box with save and cancel; saving it empty deletes the note.
 */
export function ExerciseNote({
  exerciseId,
  exerciseName,
  editing,
  onEdit,
  onClose,
}: {
  exerciseId: number
  exerciseName: string
  editing: boolean
  onEdit: () => void
  onClose: () => void
}) {
  const note = useExerciseNote(exerciseId)
  if (editing) {
    return <NoteEditor exerciseId={exerciseId} exerciseName={exerciseName} note={note} onClose={onClose} />
  }
  if (!note) {
    return null
  }
  return (
    <button
      type="button"
      aria-label={`Editar nota de ${exerciseName}: ${note}`}
      className="bg-muted/60 text-foreground hover:bg-muted flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm"
      onClick={onEdit}
    >
      <NotebookPenIcon className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
      <span className="break-words whitespace-pre-line">{note}</span>
    </button>
  )
}

function NoteEditor({
  exerciseId,
  exerciseName,
  note,
  onClose,
}: {
  exerciseId: number
  exerciseName: string
  note: string
  onClose: () => void
}) {
  const [text, setText] = useState(note)
  const save = useSaveExerciseNote()

  const submit = () =>
    save.mutate(
      { exerciseId, text },
      {
        onSuccess: onClose,
        onError: () => toast.error('No se pudo guardar la nota. Revisa la conexión.'),
      },
    )

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Textarea
        aria-label={`Nota de ${exerciseName}`}
        placeholder="Asiento en 4, agarre ancho…"
        maxLength={NOTE_MAX_LENGTH}
        value={text}
        autoFocus
        onChange={(event) => setText(event.target.value)}
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" className="h-10 flex-1" onClick={onClose}>
          Cancelar
        </Button>
        <Button type="submit" className="h-10 flex-1" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar nota'}
        </Button>
      </div>
    </form>
  )
}
