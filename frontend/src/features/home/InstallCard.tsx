import { SmartphoneIcon, XIcon } from 'lucide-react'
import { useState } from 'react'
import { InstallGuideSheet } from '@/components/InstallGuideSheet'
import { Button } from '@/components/ui/button'
import { INSTALL_CARD_DISMISSED_KEY, needsIosInstall } from '@/lib/install'

/**
 * On an iPhone where the app is not installed: what installing brings, and the way to the guide.
 * Closed once, it stays closed on this phone.
 */
export function InstallCard() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(INSTALL_CARD_DISMISSED_KEY) !== null)
  const [guideOpen, setGuideOpen] = useState(false)
  if (dismissed || !needsIosInstall()) {
    return null
  }

  const dismiss = () => {
    localStorage.setItem(INSTALL_CARD_DISMISSED_KEY, new Date().toISOString())
    setDismissed(true)
  }

  return (
    <section
      aria-label="Instalar la app"
      className="bg-card ring-foreground/10 space-y-3 rounded-xl p-4 ring-1"
    >
      <div className="flex items-start gap-3">
        <SmartphoneIcon className="text-primary mt-0.5 size-5 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">Instala la app en tu iPhone</p>
          <p className="text-muted-foreground text-sm">
            Se abre a pantalla completa y te avisa al acabar el descanso.
          </p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Cerrar" className="-mt-1 -mr-1" onClick={dismiss}>
          <XIcon />
        </Button>
      </div>
      <Button variant="secondary" className="h-10 w-full" onClick={() => setGuideOpen(true)}>
        Cómo instalarla
      </Button>
      <InstallGuideSheet open={guideOpen} onOpenChange={setGuideOpen} />
    </section>
  )
}
