import '@testing-library/jest-dom/vitest'
// jsdom has no IndexedDB, where the progress photos live.
import 'fake-indexeddb/auto'
import { cleanup, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, expect, vi } from 'vitest'

afterEach(async () => {
  // sonner takes a closed toast off the page on a timer that unmounting does not cancel; let any
  // such timer run while the page is still there, or it fires after the test file has ended.
  toast.dismiss()
  await waitFor(() => expect(document.querySelector('[data-sonner-toast]')).toBeNull())
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  window.localStorage.clear()
})
