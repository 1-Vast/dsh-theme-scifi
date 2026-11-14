/**
 * Shared painter vocabulary for the sci-fi scenes: the per-frame input, the
 * ambient agent activity the scenes react to, event tracking with fade-in and
 * fade-out, and the drawing helpers (graph paper, contours, post effects).
 */
import type { ThemeStyle } from '../styles.ts'
import { at, clamp, rgba, type SceneBase, type SceneColors } from './palette.ts'

/** Full turn in radians. */
export const TAU = Math.PI * 2

/** Ambient agent activity, sensed from the shell and eased by the host. */
export interface SceneActivity {
  /** Eased busy level, 0 (idle) to 1 (streaming or running tools). */
  energy: number
  /** Phase clock in seconds; runs faster while busy. */
  ph: number
  /** Tool calls observed since the scene mounted. */
  events: number
  /** Clock (ms) of the latest tool call, or -1. */
  eventT: number
  /** Clock (ms) of the latest failed tool call, or -1. */
  errT: number
  /** Clock (ms) when the agent last settled, or -1. */
  doneT: number
}

/** One frame handed to a painter. */
export interface SceneFrame<S extends ThemeStyle> {
  /** Target context, already scaled to CSS pixels. */
  c: CanvasRenderingContext2D
  /** Width in CSS px. */
  w: number
  /** Height in CSS px. */
  h: number
  /** Clock in ms. */
  now: number
  /** Seconds since the previous painted frame (0 for a still frame). */
  dt: number
  /** Scene colors. */
  P: SceneColors<S>
  /** Layout scale: 1 at a 1200 px wide viewport. */
  s: number
  /** True when painting a still frame (reduced motion, Still, or a preview). */
  still: boolean
  /** Ambient activity. */
  A: SceneActivity
  /** Eased value keyed per painter: approaches target at rate per second. */
  sm: (key: string, target: number, rate: number) => number
}

/** A stateful painter for one style. */
export type ScenePainter<S extends ThemeStyle> = (frame: SceneFrame<S>) => void

/** Phase-clock seconds per wall-clock second at idle. */
export const PH_RATE = 0.55

/** Extra phase-clock speed at full energy (multiplier minus one). */
export const ENERGY_GAIN = 2.6

/** A quiet idle activity (previews and first paint). */
export const IDLE_ACTIVITY: Readonly<SceneActivity> = Object.freeze({
  energy: 0, ph: 26, events: 0, eventT: -1, errT: -1, doneT: -1,
})

/**
 * Seconds since a clock stamp.
 * @param stamp - ms stamp or -1.
 * @param now - current ms clock.
 * @returns elapsed seconds (Infinity when never stamped).
 */
export function age(stamp: number, now: number): number {
  return stamp < 0 ? Infinity : (now - stamp) / 1000
}

/**
 * Deterministic uniform generator (Park–Miller).
 * @param seed - positive integer seed.
 * @returns generator of values in (0, 1).
 */
export function seeded(seed: number): () => number {
  let x = seed
  return () => {
    x = (x * 16807) % 2147483647
    return (x - 1) / 2147483646
  }
}

/**
 * Approximate unit gaussian from four uniforms.
 * @param r - uniform generator.
 * @returns a sample with mean 0 and standard deviation about 1.
 */
export function gauss(r: () => number): number {
  return (r() + r() + r() + r() - 2) / 0.577
}

/**
 * Smoothstep between two edges.
 * @param a - lower edge.
 * @param b - upper edge.
 * @param x - input.
 * @returns eased 0..1.
 */
export function sstep(a: number, b: number, x: number): number {
  const u = clamp((x - a) / (b - a))
  return u * u * (3 - 2 * u)
}

/**
 * Monospace readout font scaled to the layout.
 * @param P - scene colors (carries the mono stack).
 * @param size - nominal size in px.
 * @param s - layout scale.
 * @returns CSS font shorthand.
 */
export function font(P: SceneBase, size: number, s: number): string {
  return `${Math.round(size * Math.min(1.1, Math.max(0.85, s)))}px ${P.mono}`
}

/**
 * Format a number with thin grouping.
 * @param n - value.
 * @param d - decimals.
 * @returns formatted string.
 */
export function fmt(n: number, d = 0): string {
  return n.toFixed(d).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

const GLYPHS = '▓▒░<>/\\|#01_=+*'

/**
 * Reveal a label left to right with scrambled glyphs past the cursor.
 * @param text - final label.
 * @param p - reveal progress 0..1.
 * @param t - seconds (drives the scramble).
 * @returns partially decoded label.
 */
export function decode(text: string, p: number, t: number): string {
  const n = Math.floor(clamp(p) * text.length)
  let out = text.slice(0, n)
  for (let i = n; i < text.length; i++) out += text[i] === ' ' ? ' ' : at(GLYPHS, (i * 7 + Math.floor(t * 24)) % GLYPHS.length)
  return out
}

/** One tracked event item. */
export interface Tracked<T> {
  /** Item payload. */
  item: T
  /** Event ordinal. */
  i: number
  /** Presence 0..1 (fades in when born, out when retired). */
  k: number
  /** Birth clock (ms). */
  t0: number
}

/**
 * Track one item per tool call: new items fade in, items beyond the newest
 * `keep` fade out instead of vanishing.
 */
export class EventTrack<T> {
  private items: Tracked<T>[] = []
  private seen = -1

  /** @param keep - how many recent items stay fully present. */
  constructor(private readonly keep: number) {}

  /**
   * Advance the track to the current activity.
   * @param A - ambient activity.
   * @param now - ms clock.
   * @param dt - seconds since the previous frame.
   * @param still - still frames snap presence instead of easing.
   * @param make - payload factory for event ordinal i.
   * @returns live items, oldest first.
   */
  update(A: SceneActivity, now: number, dt: number, still: boolean, make: (i: number) => T): readonly Tracked<T>[] {
    if (this.seen < 0) this.seen = A.events
    while (this.seen < A.events) {
      this.items.push({ item: make(this.seen), i: this.seen, k: still ? 1 : 0, t0: still ? now - 1e5 : now })
      this.seen += 1
    }
    const live = this.items.length - this.keep
    this.items.forEach((it, n) => {
      const target = n >= live ? 1 : 0
      it.k = still ? target : it.k + (target - it.k) * Math.min(1, dt * 2.2)
    })
    this.items = this.items.filter((it, n) => n >= live || it.k > 0.01)
    return this.items
  }
}

/**
 * Fill the scene background with a soft accent pool.
 * @param c - context.
 * @param w - width.
 * @param h - height.
 * @param P - scene colors.
 * @param cx - pool centre x.
 * @param cy - pool centre y.
 * @param R - pool radius.
 * @param pool - pool color.
 * @param poolA - pool strength.
 */
export function backdrop(
  c: CanvasRenderingContext2D, w: number, h: number, P: SceneBase, cx: number, cy: number, R: number, pool: string, poolA: number,
): void {
  c.fillStyle = P.scene
  c.fillRect(0, 0, w, h)
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, Math.max(1, R))
  g.addColorStop(0, rgba(pool, poolA))
  g.addColorStop(1, rgba(pool, 0))
  c.fillStyle = g
  c.fillRect(0, 0, w, h)
}

/**
 * Rule graph paper with every fifth line stronger.
 * @param c - context.
 * @param w - width.
 * @param h - height.
 * @param color - rule color.
 * @param step - spacing in px.
 * @param a1 - minor alpha.
 * @param a2 - major alpha.
 */
export function graphPaper(c: CanvasRenderingContext2D, w: number, h: number, color: string, step: number, a1: number, a2: number): void {
  c.lineWidth = 1
  for (const major of [false, true]) {
    c.strokeStyle = rgba(color, major ? a2 : a1)
    c.beginPath()
    let i = 0
    for (let x = 0; x < w; x += step, i++) {
      if ((i % 5 === 0) !== major) continue
      c.moveTo(Math.round(x) + 0.5, 0)
      c.lineTo(Math.round(x) + 0.5, h)
    }
    i = 0
    for (let y = 0; y < h; y += step, i++) {
      if ((i % 5 === 0) !== major) continue
      c.moveTo(0, Math.round(y) + 0.5)
      c.lineTo(w, Math.round(y) + 0.5)
    }
    c.stroke()
  }
}

/**
 * Append marching-squares segments of one level set to the current path.
 * @param c - context with an open path.
 * @param F - row-major field samples.
 * @param cols - samples per row.
 * @param rows - rows.
 * @param cs - cell size in px.
 * @param L - level.
 * @param ox - x offset of sample (0, 0).
 * @param oy - y offset of sample (0, 0).
 */
export function contour(
  c: CanvasRenderingContext2D, F: Float32Array, cols: number, rows: number, cs: number, L: number, ox = 0, oy = 0,
): void {
  for (let r = 0; r < rows - 1; r++) {
    for (let q = 0; q < cols - 1; q++) {
      const a = at(F, r * cols + q) - L
      const b = at(F, r * cols + q + 1) - L
      const d = at(F, (r + 1) * cols + q) - L
      const e = at(F, (r + 1) * cols + q + 1) - L
      const x0 = ox + q * cs
      const y0 = oy + r * cs
      const pts: number[] = []
      if ((a > 0) !== (b > 0)) pts.push(x0 + cs * a / (a - b), y0)
      if ((b > 0) !== (e > 0)) pts.push(x0 + cs, y0 + cs * b / (b - e))
      if ((d > 0) !== (e > 0)) pts.push(x0 + cs * d / (d - e), y0 + cs)
      if ((a > 0) !== (d > 0)) pts.push(x0, y0 + cs * a / (a - d))
      if (pts.length >= 4) {
        c.moveTo(at(pts, 0), at(pts, 1))
        c.lineTo(at(pts, 2), at(pts, 3))
      }
      if (pts.length === 8) {
        c.moveTo(at(pts, 4), at(pts, 5))
        c.lineTo(at(pts, 6), at(pts, 7))
      }
    }
  }
}

/**
 * Create a 2D canvas, or undefined where the engine has no 2D context.
 * @param w - pixel width.
 * @param h - pixel height.
 * @returns canvas and context pair.
 */
export function offscreen(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | undefined {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(w))
  canvas.height = Math.max(1, Math.round(h))
  const ctx = canvas.getContext('2d')
  return ctx === null ? undefined : { canvas, ctx }
}

/** Post effects: bloom, vignette, and film grain over a painted frame. */
export class PostFx {
  private grain: CanvasPattern | null | undefined
  private bloom: ReturnType<typeof offscreen>

  /**
   * Apply the post stack.
   * @param target - the painted canvas.
   * @param c - its context (CSS-pixel transform).
   * @param w - width in CSS px.
   * @param h - height in CSS px.
   * @param P - scene colors.
   * @param still - still frames use a fixed grain offset.
   */
  apply(target: HTMLCanvasElement, c: CanvasRenderingContext2D, w: number, h: number, P: SceneBase, still: boolean): void {
    if (P.bloom > 0) {
      const bw = Math.max(1, target.width >> 2)
      const bh = Math.max(1, target.height >> 2)
      if (this.bloom?.canvas.width !== bw || this.bloom.canvas.height !== bh) this.bloom = offscreen(bw, bh)
      if (this.bloom !== undefined) {
        const b = this.bloom.ctx
        b.filter = 'blur(3px)'
        b.clearRect(0, 0, bw, bh)
        b.drawImage(target, 0, 0, bw, bh)
        b.filter = 'none'
        c.save()
        c.setTransform(1, 0, 0, 1, 0, 0)
        c.globalCompositeOperation = P.bloomMode
        c.globalAlpha = P.bloom
        c.drawImage(this.bloom.canvas, 0, 0, target.width, target.height)
        c.restore()
      }
    }
    const vg = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62)
    vg.addColorStop(0, rgba(P.vig, 0))
    vg.addColorStop(1, rgba(P.vig, P.vigA))
    c.fillStyle = vg
    c.fillRect(0, 0, w, h)
    if (this.grain === undefined) this.grain = grainPattern(c)
    if (this.grain === null) return
    c.save()
    c.globalAlpha = P.grain
    c.fillStyle = this.grain
    const ox = still ? 0 : Math.floor(Math.random() * 128)
    const oy = still ? 0 : Math.floor(Math.random() * 128)
    c.translate(-ox, -oy)
    c.fillRect(0, 0, w + 128, h + 128)
    c.restore()
  }
}

function grainPattern(c: CanvasRenderingContext2D): CanvasPattern | null {
  const tile = offscreen(128, 128)
  if (tile === undefined) return null
  const img = tile.ctx.createImageData(128, 128)
  const r = seeded(77)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = r() > 0.5 ? 255 : 0
    img.data[i] = v
    img.data[i + 1] = v
    img.data[i + 2] = v
    img.data[i + 3] = 255 * r()
  }
  tile.ctx.putImageData(img, 0, 0)
  return c.createPattern(tile.canvas, 'repeat')
}

/**
 * Right-aligned footer readout in the scene's bottom margin.
 * @param f - frame.
 * @param text - readout.
 */
export function footer<S extends ThemeStyle>(f: SceneFrame<S>, text: string): void {
  const { c, w, h, P, s } = f
  if (w < 420) return
  c.font = font(P, 10.5, s)
  c.textAlign = 'right'
  c.fillStyle = rgba(P.ink2, 0.85)
  c.fillText(text, w - 24, h - 18)
  c.textAlign = 'left'
}
