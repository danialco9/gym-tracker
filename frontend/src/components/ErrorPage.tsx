import { HomeIcon, RotateCwIcon, TriangleAlertIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Link, useRouteError } from 'react-router'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * What a screen shows when it breaks while rendering, instead of React Router's developer page.
 * The workout draft lives on the phone, so it says so: nothing logged is lost.
 */
export function ErrorPage() {
  const error = useRouteError()

  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <section
      role="alert"
      className="mx-auto flex max-w-sm flex-col items-center gap-4 px-4 py-16 text-center"
    >
      <span className="bg-chart-4/15 text-chart-4 flex size-14 items-center justify-center rounded-full">
        <TriangleAlertIcon className="size-7" aria-hidden />
      </span>
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-semibold">Algo ha fallado</h1>
        <p className="text-muted-foreground text-sm">
          Esta pantalla no se ha podido mostrar. Tu entreno en curso sigue guardado en el móvil.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <Button size="lg" className="h-12 w-full text-base" onClick={() => window.location.reload()}>
          <RotateCwIcon />
          Reintentar
        </Button>
        <Link
          to="/"
          className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'h-12 w-full text-base')}
        >
          <HomeIcon />
          Volver a Inicio
        </Link>
      </div>
    </section>
  )
}
