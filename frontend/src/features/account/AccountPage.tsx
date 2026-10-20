import { ChevronRightIcon, LogOutIcon, MessageSquareIcon, TargetIcon } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/PageHeader'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useSendFeedback } from '@/features/account/queries'
import { useSignOut } from '@/features/account/useSignOut'
import { tooManyAttemptsMessage } from '@/features/auth/errors'
import { useCurrentUser, useDeleteAccount } from '@/features/auth/queries'
import { saveDraft } from '@/features/workout/draft'
import { clearOutbox } from '@/features/workout/outbox'
import { ApiError } from '@/lib/api'
import { TRAINING_GOAL_LABELS } from '@/lib/labels'

const MAX_FEEDBACK_LENGTH = 2000

type Open = 'feedback' | 'delete' | null

/** Where the person came from, so a comment says which screen it is about. */
function usePreviousPage(): string | null {
  const state: unknown = useLocation().state
  if (typeof state === 'object' && state !== null && 'from' in state && typeof state.from === 'string') {
    return state.from
  }
  return null
}

function FeedbackForm({ onDone }: { onDone: () => void }) {
  const page = usePreviousPage()
  const sendFeedback = useSendFeedback()
  const [message, setMessage] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    sendFeedback.mutate(
      { message: message.trim(), page },
      {
        onSuccess: () => {
          toast.success('¡Gracias! Tu opinión ha llegado.')
          onDone()
        },
      },
    )
  }

  const error = sendFeedback.error
  return (
    <form onSubmit={submit} className="space-y-3 px-3 pb-3">
      <Label htmlFor="feedback" className="sr-only">
        Tu opinión
      </Label>
      <Textarea
        id="feedback"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={MAX_FEEDBACK_LENGTH}
        rows={4}
        placeholder="Qué falla, qué no se entiende o qué echas en falta…"
        autoFocus
      />
      {error !== null && (
        <Alert variant="destructive">
          <AlertDescription>
            {tooManyAttemptsMessage(error) ?? 'No se pudo enviar. Prueba otra vez en un rato.'}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          size="lg"
          className="flex-1"
          disabled={message.trim() === '' || sendFeedback.isPending}
        >
          {sendFeedback.isPending ? 'Enviando…' : 'Enviar'}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onDone}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function deleteErrorMessage(error: Error): string {
  if (error instanceof ApiError && error.status === 403) {
    return error.detail === 'The demo account cannot be deleted'
      ? 'La cuenta demo no se puede borrar.'
      : 'La contraseña no es correcta.'
  }
  return tooManyAttemptsMessage(error) ?? 'No se pudo borrar la cuenta. Prueba otra vez en un rato.'
}

function DeleteAccountForm({ userId, onCancel }: { userId: number; onCancel: () => void }) {
  const deleteAccount = useDeleteAccount()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    deleteAccount.mutate(password, {
      onSuccess: () => {
        saveDraft(null)
        clearOutbox(userId)
        toast.success('Cuenta borrada. ¡Gracias por probar la app!')
        navigate('/login', { replace: true })
      },
    })
  }

  return (
    <form onSubmit={submit} className="border-destructive/40 space-y-3 rounded-xl border p-4">
      <p className="text-sm">
        Se borrarán para siempre tus rutinas, entrenos, medidas y ejercicios propios. No se puede deshacer.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="delete-password">Escribe tu contraseña para confirmar</Label>
        <Input
          id="delete-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
        />
      </div>
      {deleteAccount.error !== null && (
        <Alert variant="destructive">
          <AlertDescription>{deleteErrorMessage(deleteAccount.error)}</AlertDescription>
        </Alert>
      )}
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="destructive"
          size="lg"
          className="flex-1"
          disabled={password === '' || deleteAccount.isPending}
        >
          {deleteAccount.isPending ? 'Borrando…' : 'Borrar definitivamente'}
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

export function AccountPage() {
  const user = useCurrentUser().data
  const { signOut, pending } = useSignOut()
  const [open, setOpen] = useState<Open>(null)
  const close = () => setOpen(null)

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Cuenta" title="Tu cuenta" description={user?.email ?? ''} />

      <section className="bg-card ring-foreground/10 rounded-xl p-2 ring-1">
        <Link
          to="/objetivo"
          className="hover:bg-accent flex w-full items-center justify-between gap-3 rounded-lg p-3 transition-colors"
        >
          <span className="flex min-w-0 items-center gap-3">
            <TargetIcon className="text-primary size-5 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="block font-medium">Objetivo</span>
              <span className="text-muted-foreground block text-sm">
                {user?.goal == null ? 'Sin elegir' : TRAINING_GOAL_LABELS[user.goal].title}
              </span>
            </span>
          </span>
          <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
        </Link>
        {open === 'feedback' ? (
          <>
            <h2 className="flex items-center gap-3 p-3 font-medium">
              <MessageSquareIcon className="text-primary size-5 shrink-0" aria-hidden />
              Enviar opinión
            </h2>
            <FeedbackForm onDone={close} />
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOpen('feedback')}
            className="hover:bg-accent flex w-full items-center justify-between gap-3 rounded-lg p-3 text-left transition-colors"
          >
            <span className="flex min-w-0 items-center gap-3">
              <MessageSquareIcon className="text-primary size-5 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="block font-medium">Enviar opinión</span>
                <span className="text-muted-foreground block text-sm">Fallos, dudas o ideas</span>
              </span>
            </span>
            <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={signOut}
          disabled={pending}
          className="hover:bg-accent flex w-full items-center gap-3 rounded-lg p-3 text-left font-medium transition-colors disabled:opacity-50"
        >
          <LogOutIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
          Cerrar sesión
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="eyebrow">Zona peligrosa</h2>
        {open === 'delete' && user != null ? (
          <DeleteAccountForm userId={user.id} onCancel={close} />
        ) : (
          <Button
            variant="destructive"
            size="lg"
            className="w-full sm:w-auto"
            onClick={() => setOpen('delete')}
          >
            Borrar mi cuenta
          </Button>
        )}
      </section>
    </div>
  )
}
