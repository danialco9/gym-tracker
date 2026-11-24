import { plural } from '@/lib/format'
import type { ShareCardData } from './share-card-data'

// Portrait 4:5, the largest shape Instagram shows whole in the feed; WhatsApp takes it as it is.
const WIDTH = 1080
const HEIGHT = 1350
const PADDING = 88
const FONT = "'Geist Variable', ui-sans-serif, system-ui, sans-serif"

// The app's dark theme in hex: older Safari canvases do not read oklch().
const COLORS = {
  background: '#0e1117',
  card: '#191d25',
  border: '#2a2f39',
  foreground: '#f3f4f6',
  muted: '#9ca3af',
  primary: '#a6e22e',
  primaryForeground: '#1a2b0a',
}

function font(weight: number, size: number) {
  return `${weight} ${size}px ${FONT}`
}

/** Cuts the text with an ellipsis so it fits the width. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) {
    return text
  }
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return `${cut.trimEnd()}…`
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function drawStat(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  label: string,
  value: string,
) {
  roundedRect(ctx, x, y, w, 190, 28)
  ctx.fillStyle = COLORS.card
  ctx.fill()
  ctx.strokeStyle = COLORS.border
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = COLORS.muted
  ctx.font = font(500, 30)
  ctx.fillText(label.toUpperCase(), x + 32, y + 62)
  // A number is never cut: the type shrinks until the whole value fits the tile.
  let size = 60
  ctx.font = font(700, size)
  while (size > 32 && ctx.measureText(value).width > w - 64) {
    size -= 2
    ctx.font = font(700, size)
  }
  ctx.fillStyle = COLORS.primary
  ctx.fillText(value, x + 32, y + 148)
}

/** Draws the workout card on a new canvas. Waits for the app font, so the text is not drawn in a fallback. */
export async function drawShareCard(data: ShareCardData): Promise<HTMLCanvasElement> {
  await Promise.all([document.fonts.load(font(700, 60)), document.fonts.load(font(500, 30))])

  const canvas = document.createElement('canvas')
  canvas.width = WIDTH
  canvas.height = HEIGHT
  const ctx = canvas.getContext('2d')
  if (ctx === null) {
    throw new Error('Canvas 2D is not available')
  }
  const inner = WIDTH - PADDING * 2

  ctx.fillStyle = COLORS.background
  ctx.fillRect(0, 0, WIDTH, HEIGHT)
  // A soft lime glow in the corner, the app's accent.
  const glow = ctx.createRadialGradient(WIDTH, 0, 0, WIDTH, 0, 900)
  glow.addColorStop(0, 'rgba(166, 226, 46, 0.22)')
  glow.addColorStop(1, 'rgba(166, 226, 46, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, WIDTH, HEIGHT)

  let y = PADDING + 40
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = COLORS.muted
  ctx.font = font(500, 34)
  ctx.fillText(`ENTRENO · ${data.date.toUpperCase()}`, PADDING, y)

  y += 100
  ctx.fillStyle = COLORS.foreground
  ctx.font = font(700, 88)
  ctx.fillText(fit(ctx, data.title, inner), PADDING, y)

  y += 70
  const stats: [string, string][] = [
    ['Series', String(data.workingSets)],
    ['Volumen', data.volume],
  ]
  if (data.duration !== null) {
    stats.unshift(['Duración', data.duration])
  }
  const gap = 24
  const statWidth = (inner - gap * (stats.length - 1)) / stats.length
  stats.forEach(([label, value], index) =>
    drawStat(ctx, PADDING + index * (statWidth + gap), y, statWidth, label, value),
  )
  y += 190

  if (data.records > 0) {
    y += 48
    const text = `${data.records} ${plural(data.records, 'récord nuevo', 'récords nuevos')}`
    ctx.font = font(700, 38)
    const pillWidth = ctx.measureText(text).width + 72
    roundedRect(ctx, PADDING, y, pillWidth, 80, 40)
    ctx.fillStyle = COLORS.primary
    ctx.fill()
    ctx.fillStyle = COLORS.primaryForeground
    ctx.fillText(text, PADDING + 36, y + 53)
    y += 80
  }

  if (data.topExercises.length > 0) {
    y += 84
    ctx.fillStyle = COLORS.muted
    ctx.font = font(500, 30)
    ctx.fillText('MEJORES SERIES', PADDING, y)
    y += 28
    for (const exercise of data.topExercises) {
      y += 98
      ctx.font = font(700, 44)
      ctx.fillStyle = COLORS.foreground
      const setWidth = ctx.measureText(exercise.bestSet).width
      ctx.fillText(fit(ctx, exercise.name, inner - setWidth - 40), PADDING, y)
      ctx.fillStyle = COLORS.primary
      ctx.fillText(exercise.bestSet, WIDTH - PADDING - setWidth, y)
      ctx.fillStyle = COLORS.border
      ctx.fillRect(PADDING, y + 36, inner, 2)
    }
  }

  ctx.fillStyle = COLORS.muted
  ctx.font = font(600, 32)
  ctx.fillText('Gym Tracker', PADDING, HEIGHT - PADDING)

  return canvas
}

/** The card as a PNG, ready for the share sheet or a download. */
export async function shareCardPng(data: ShareCardData): Promise<Blob> {
  const canvas = await drawShareCard(data)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error('Could not encode the card')) : resolve(blob)),
      'image/png',
    )
  })
}
