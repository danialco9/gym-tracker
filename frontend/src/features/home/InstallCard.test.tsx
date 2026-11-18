import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INSTALL_CARD_DISMISSED_KEY } from '@/lib/install'
import { InstallCard } from './InstallCard'

const install = vi.hoisted(() => ({ needed: true }))
vi.mock('@/lib/install', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/install')>()),
  needsIosInstall: () => install.needed,
}))

beforeEach(() => {
  window.localStorage.clear()
  install.needed = true
})

describe('Install card', () => {
  it('opens the guide, and once closed stays closed on this phone', async () => {
    const { unmount } = render(<InstallCard />)

    await userEvent.click(screen.getByRole('button', { name: 'Cómo instalarla' }))
    expect(await screen.findByText(/Añadir a pantalla de inicio/)).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem(INSTALL_CARD_DISMISSED_KEY)).not.toBeNull()

    unmount()
    render(<InstallCard />)
    expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument()
  })

  it('does not show where installing is not needed', () => {
    install.needed = false
    render(<InstallCard />)
    expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument()
  })
})
