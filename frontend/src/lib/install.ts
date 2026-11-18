/** Set once the install card on the home screen is closed, so it does not come back. */
export const INSTALL_CARD_DISMISSED_KEY = 'gym-tracker:install-card-dismissed'

interface Browser {
  userAgent: string
  platform: string
  maxTouchPoints: number
  /** Safari's own flag, true when opened from the home screen icon. */
  standalone?: boolean
  /** Whether the page runs as an installed app, as `display-mode: standalone` tells. */
  displayStandalone: boolean
}

function currentBrowser(): Browser {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
    displayStandalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
  }
}

/**
 * An iPhone or iPad where the app is not installed yet. There, a web page gets no push notifications
 * at all: the end-of-rest notice only works once it is added to the home screen.
 */
export function needsIosInstall(browser: Browser = currentBrowser()): boolean {
  // iPads ask for the desktop site and say they are a Mac, but a Mac has no touch screen.
  const ios =
    /iPhone|iPad|iPod/.test(browser.userAgent) ||
    (browser.platform === 'MacIntel' && browser.maxTouchPoints > 1)
  const installed = browser.standalone === true || browser.displayStandalone
  return ios && !installed
}
