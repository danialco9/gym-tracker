import { PlusSquareIcon, ShareIcon, SmartphoneIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'

const STEPS: { icon: ReactNode; text: ReactNode }[] = [
  {
    icon: <ShareIcon className="size-5" aria-hidden />,
    text: (
      <>
        En Safari, toca <strong>Compartir</strong>: el cuadrado con la flecha hacia arriba, abajo en la
        pantalla.
      </>
    ),
  },
  {
    icon: <PlusSquareIcon className="size-5" aria-hidden />,
    text: (
      <>
        Baja y elige <strong>Añadir a pantalla de inicio</strong>, y luego <strong>Añadir</strong>.
      </>
    ),
  },
  {
    icon: <SmartphoneIcon className="size-5" aria-hidden />,
    text: (
      <>
        Abre la app <strong>desde su icono</strong>. Ya no hace falta volver a Safari.
      </>
    ),
  },
]

/** How to add the app to an iPhone's home screen, the only way iOS lets it send notifications. */
export function InstallGuideSheet({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85dvh] max-w-2xl overflow-y-auto overscroll-contain rounded-t-xl pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <SheetHeader>
          <SheetTitle>Instala la app en tu iPhone</SheetTitle>
          <SheetDescription>
            Se abre a pantalla completa, arranca más rápido y puede avisarte al acabar el descanso aunque
            tengas el móvil bloqueado.
          </SheetDescription>
        </SheetHeader>
        <ol className="space-y-3 px-4">
          {STEPS.map((step, index) => (
            <li key={index} className="flex items-start gap-3">
              <span className="bg-primary/15 text-primary grid size-9 shrink-0 place-items-center rounded-full">
                {step.icon}
              </span>
              <p className="pt-1.5 text-sm">
                <span className="sr-only">Paso {index + 1}: </span>
                {step.text}
              </p>
            </li>
          ))}
        </ol>
      </SheetContent>
    </Sheet>
  )
}
