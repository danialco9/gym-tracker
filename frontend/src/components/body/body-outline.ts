/*
 * The outline of the whole body, from the front and the back, in the same box as the muscle shapes of
 * `body-shapes.ts`: the muscles are laid on top of it, so it must enclose every one of them.
 *
 * Only the left half is written down; the right half is its mirror across x = 50. Each half runs from
 * the top of the head down the outside of the arm, round the hand, back up the inside of the arm, down
 * the side of the body and the outside of the leg, round the foot and up the inside of the leg to the
 * crotch.
 */

type Point = [number, number]

/**
 * A hand hanging from the wrist, fingers down and thumb out, in a frame where the wrist runs from
 * (0, -3.7) on the outside to (0, 3.7) on the inside and the hand grows along +u.
 */
const HAND: Point[] = [
  [0, -3.7],
  [2.4, -4.5],
  [5, -6],
  [6.4, -5.8],
  [6.2, -4.4],
  [6.6, -3.1],
  [11.4, -3],
  [12.2, -2.3],
  [11.7, -1.5],
  [7.4, -1.25],
  [12.8, -1.1],
  [13.4, -0.25],
  [12.8, 0.6],
  [7.5, 0.75],
  [12.2, 0.95],
  [12.6, 1.7],
  [12, 2.4],
  [7.3, 2.55],
  [10.6, 2.75],
  [10.8, 3.4],
  [10.2, 3.95],
  [6, 4.25],
  [2.4, 4.1],
  [0, 3.7],
]

/** The hand fitted to a wrist, from its outer to its inner side. */
function hand([ox, oy]: Point, [ix, iy]: Point): Point[] {
  const scale = Math.hypot(ix - ox, iy - oy) / 7.4
  const [vx, vy] = [(ix - ox) / (7.4 * scale), (iy - oy) / (7.4 * scale)]
  // Down the arm: the wrist's direction turned a quarter, towards the bottom of the figure.
  const [ux, uy] = [-vy, vx]
  const [cx, cy] = [(ox + ix) / 2, (oy + iy) / 2]
  return HAND.map(([u, v]) => [cx + (u * ux + v * vx) * scale, cy + (u * uy + v * vy) * scale])
}

const FRONT_LEFT: Point[] = [
  // Head and neck.
  [50, -0.6],
  [44.5, 0.6],
  [40.8, 4.2],
  [39.4, 10.5],
  [40.2, 16.5],
  [42.4, 20.6],
  [44.2, 24],
  [43.8, 28.4],
  // The slope of the trapezius to the shoulder.
  [40.2, 32.4],
  [34.4, 35.2],
  [28, 36.3],
  [23.4, 37.2],
  // Down the outside of the arm.
  [19.8, 40],
  [18.6, 45],
  [18.3, 51],
  [17.4, 56.5],
  [15.8, 63],
  [14.6, 69],
  [12.6, 72.6],
  [9.2, 76],
  [5.4, 86],
  [2.2, 94.4],
  ...hand([-0.6, 99.8], [7.6, 102.4]),
  // Back up the inside of the arm to the armpit.
  [13.9, 91.4],
  [19.4, 84.8],
  [22.3, 77.6],
  [23.6, 72.6],
  [26.6, 66.4],
  [30.4, 60.4],
  [31, 57],
  // Down the side of the body: waist, then hip.
  [31.6, 63],
  [32.8, 71],
  [33.2, 78.6],
  [32.4, 86],
  [30.4, 93],
  [28.2, 100],
  [26.4, 110],
  [25, 120],
  [24.6, 130],
  [25, 139],
  [26.1, 146],
  // Knee and calf.
  [26, 151],
  [24.4, 155.4],
  [21.4, 161],
  [19.6, 168],
  [20, 180],
  [20.6, 189],
  [20.6, 195.6],
  // The foot, seen from the front, turned a little out.
  [19.2, 199],
  [17.6, 202.4],
  [17.2, 205.2],
  [19, 206.8],
  [24, 207],
  [28.4, 206.2],
  [29.2, 203],
  [28.4, 199],
  [27.8, 195.6],
  // Up the inside of the leg to the crotch.
  [31.2, 188],
  [33.4, 182],
  [36, 176],
  [36.6, 167],
  [36.6, 160],
  [37.2, 152],
  [40.6, 147],
  [43.8, 137],
  [46, 127],
  [48.4, 117],
  [50, 112.6],
]

const BACK_LEFT: Point[] = [
  // Head and neck.
  [50, -0.6],
  [45.4, 0.6],
  [41.2, 4.6],
  [39.8, 11],
  [41, 16.4],
  [43.8, 20.4],
  [44.2, 24],
  // The slope of the trapezius to the shoulder.
  [40.4, 30.4],
  [34, 34.4],
  [27.6, 36.2],
  [21.6, 38.2],
  // Down the outside of the arm.
  [17.2, 43],
  [16.2, 50],
  [14.4, 57],
  [13, 66],
  [12.6, 75],
  [8.4, 83],
  [5.6, 93],
  [2.2, 101],
  ...hand([-1, 106.2], [7.4, 109.4]),
  // Back up the inside of the arm to the armpit.
  [10.6, 103],
  [16.6, 92.4],
  [21.2, 84.6],
  [23, 78],
  [25.6, 71],
  [27.4, 63],
  [27.6, 55.6],
  // Down the side of the body: waist, then hip.
  [29.4, 62],
  [32.6, 72],
  [34, 79],
  [33, 87],
  [30.6, 96],
  [29, 106],
  [28.6, 116],
  [27, 126],
  [26.6, 136],
  [27.6, 146],
  // Back of the knee and calf.
  [28, 154],
  [27, 162],
  [24.8, 172],
  [23.2, 183],
  [23.4, 193],
  [25.6, 199.6],
  [27.2, 205],
  [27.4, 209.8],
  // The heel, seen from behind.
  [26.6, 213.4],
  [26.4, 217.4],
  [27.6, 220.8],
  [30.2, 222.2],
  [32.8, 221],
  [34, 217.4],
  [33.8, 213.4],
  [33.2, 209.8],
  // Up the inside of the leg to the crotch.
  [34.6, 202],
  [37.8, 195],
  [39.6, 185],
  [39.8, 172],
  [41.2, 163],
  [43.8, 153],
  [45.4, 143],
  [47.6, 133],
  [50, 124.6],
]

/** The left half followed by its mirror, walked back the other way, into one closed loop. */
const wholeBody = (left: Point[]): Point[] => [
  ...left,
  ...left
    .slice(1, -1)
    .reverse()
    .map(([x, y]): Point => [100 - x, y]),
]

/** A smooth closed curve through every point (a Catmull-Rom spline drawn as cubic Béziers). */
function smoothPath(points: Point[]): string {
  const at = (index: number) => points[(index + points.length) % points.length]
  const f = (value: number) => value.toFixed(2)
  const curves = points.map((_, index) => {
    const [p0, p1, p2, p3] = [at(index - 1), at(index), at(index + 1), at(index + 2)]
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    return `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`
  })
  return `M${f(points[0][0])} ${f(points[0][1])}${curves.join('')}Z`
}

export const FRONT_OUTLINE = smoothPath(wholeBody(FRONT_LEFT))
export const BACK_OUTLINE = smoothPath(wholeBody(BACK_LEFT))
