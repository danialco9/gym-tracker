import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RestPushStatus } from './rest-push'
import { RestTimerScreen } from './RestTimerScreen'

function renderScreen(notification: RestPushStatus, onEnableNotification = vi.fn()) {
  render(
    <RestTimerScreen
      remaining={60}
      duration={90}
      next={{ exerciseName: 'Press banca con barra', number: 2, reps: 8, weightKg: 80 }}
      onAdjust={vi.fn()}
      onSkip={vi.fn()}
      notification={notification}
      onEnableNotification={onEnableNotification}
    />,
  )
  return onEnableNotification
}

describe('End-of-rest notification', () => {
  it('is offered while off, and turned on with a tap', async () => {
    const onEnable = renderScreen('off')

    await userEvent.click(screen.getByRole('button', { name: 'Avisarme al acabar el descanso' }))

    expect(onEnable).toHaveBeenCalledOnce()
  })

  it('says so once it is on', () => {
    renderScreen('on')

    expect(screen.getByText('Te avisamos aunque bloquees el móvil')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Avisarme/ })).not.toBeInTheDocument()
  })

  it.each<RestPushStatus>(['unsupported', 'denied'])('is not offered when %s', (status) => {
    renderScreen(status)

    expect(screen.queryByRole('button', { name: /Avisarme/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Te avisamos/)).not.toBeInTheDocument()
  })
})
