/** Whether the phone asks for less motion; motion driven from JavaScript checks it on each use. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}
