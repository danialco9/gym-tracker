import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RestPushStatus } from './rest-push'
import { RestBar } from './RestBar'

function renderScreen(
  notification: RestPushStatus,
  onEnableNotification = vi.fn(),
  ready = false,
  installable = false,
) {
  render(
    <RestBar
      remaining={60}
      duration={90}
      ready={ready}
      next={{ exerciseName: 'Press banca con barra', number: 2, isWarmup: false, reps: 8, weightKg: 80 }}
      onAdjust={vi.fn()}
      onSkip={vi.fn()}
      notification={notification}
      onEnableNotification={onEnableNotification}
      installable={installable}
    />,
  )
  return onEnableNotification
}

describe('End-of-rest notification', () => {
  it('on an iPhone without the app installed, says how to install it instead', async () => {
    renderScreen('unsupported', vi.fn(), false, true)

    await userEvent.click(screen.getByRole('button', { name: /Instálala para que te avise/ }))

    expect(await screen.findByRole('heading', { name: 'Instala la app en tu iPhone' })).toBeInTheDocument()
    expect(screen.getByText(/Añadir a pantalla de inicio/)).toBeInTheDocument()
  })

  it('says nothing about installing where it would not help', () => {
    renderScreen('unsupported')
    expect(screen.queryByRole('button', { name: /Instálala/ })).not.toBeInTheDocument()
  })

  it('is offered while off, and turned on with a tap', async () => {
    const onEnable = renderScreen('off')

    await userEvent.click(screen.getByRole('button', { name: 'Avisarme al acabar el descanso' }))

    expect(onEnable).toHaveBeenCalledOnce()
  })

  it('says so once it is on', () => {
    renderScreen('on')

    expect(screen.getByText('Aviso activado')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Avisarme/ })).not.toBeInTheDocument()
  })

  it.each<RestPushStatus>(['unsupported', 'denied'])('is not offered when %s', (status) => {
    renderScreen(status)

    expect(screen.queryByRole('button', { name: /Avisarme/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Aviso activado')).not.toBeInTheDocument()
  })
})

describe('Rest bar when the time is up', () => {
  it('says which set comes next instead of the countdown', () => {
    renderScreen('off', vi.fn(), true)

    expect(screen.getByRole('status')).toHaveTextContent('¡A por la serie 2!Press banca con barra')
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /segundos/ })).not.toBeInTheDocument()
  })
})
