/**
 * Scene host: owns the fixed full-viewport canvas behind the shell and runs
 * the active style's painter. Frames are capped near 30 fps at a device
 * pixel ratio of at most 1.5, the loop stops while the document is hidden,
 * and `still` motion or `prefers-reduced-motion` paints a single frame.
 * Style and scheme switches cross-fade from a snapshot of the old frame.
 *
 * The host senses agent activity from the shell's own markers without
 * importing any feature package: `[data-streaming]` and running tool rows
 * mean busy, new `[data-tool][data-state]` rows are tool calls, and new
 * `data-state="error"` rows are failures. Painters only ever see the eased
 * {@link SceneActivity}.
 */
import type { SceneMotion, ThemeStyle } from '../styles.ts'
import { sceneColors, type ColorScheme } from './palette.ts'
import {
  ENERGY_GAIN, IDLE_ACTIVITY, offscreen, PH_RATE, PostFx,
  type SceneActivity, type SceneFrame, type ScenePainter,
} from './paint.ts'
import { createBlackHoleScene } from './scenes/blackhole.ts'
import { createFieldScene } from './scenes/field.ts'
import { createLatticeScene } from './scenes/lattice.ts'
import { createOrreryScene } from './scenes/orrery.ts'
import { createSignalScene } from './scenes/signal.ts'

/** What the host should show. */
export interface SceneTarget {
  /** Theme style. */
  style: ThemeStyle
  /** Resolved color scheme. */
  scheme: ColorScheme
  /** Motion preference. */
  motion: SceneMotion
}

/**
 * A painter bound to its style: the caller supplies the frame and the scheme,
 * the binding resolves that style's scene colors.
 */
export type BoundPainter = (frame: Omit<SceneFrame<ThemeStyle>, 'P'>, scheme: ColorScheme) => void

function bind<S extends ThemeStyle>(style: S, make: () => ScenePainter<S>): () => BoundPainter {
  return () => {
    const painter = make()
    return (frame, scheme) => { painter({ ...frame, P: sceneColors(style, scheme) }) }
  }
}

const FACTORIES: Readonly<Record<ThemeStyle, () => BoundPainter>> = {
  blackhole: bind('blackhole', createBlackHoleScene),
  orrery: bind('orrery', createOrreryScene),
  lattice: bind('lattice', createLatticeScene),
  field: bind('field', createFieldScene),
  signal: bind('signal', createSignalScene),
}

/**
 * Create a fresh stateful painter for a style.
 * @param style - theme style.
 * @returns the bound painter.
 */
export function createScenePainter(style: ThemeStyle): BoundPainter {
  return FACTORIES[style]()
}

/** Minimum ms between painted frames (≈ 30 fps). */
const FRAME_MS = 33
/** Device-pixel-ratio ceiling for the scene canvas. */
const MAX_DPR = 1.5
/** Cross-fade length in ms. */
const FADE_MS = 700
/** Activity probe period in ms. */
const PROBE_MS = 400
/** A jump of more tool rows than this is a view switch, not new calls. */
const MAX_EVENT_JUMP = 3

const BUSY_SELECTOR = '[data-streaming], [data-tool][data-state="running"], [data-tool][data-state="preparing"]'
const TOOL_SELECTOR = '[data-tool][data-state]'
const ERROR_SELECTOR = '[data-tool][data-state="error"]'

/**
 * Layout scale for a viewport width.
 * @param w - width in CSS px.
 * @returns 1 at 1200 px, clamped to 0.6..1.15.
 */
export function layoutScale(w: number): number {
  return Math.max(0.6, Math.min(1.15, w / 1200))
}

/**
 * Paint one still frame of a style into an arbitrary canvas (settings
 * previews). Each call uses fresh painter state.
 * @param canvas - target canvas; its client size sets the frame size.
 * @param style - theme style.
 * @param scheme - color scheme.
 */
export function paintPreview(canvas: HTMLCanvasElement, style: ThemeStyle, scheme: ColorScheme): void {
  const w = canvas.clientWidth || 300
  const h = canvas.clientHeight || 132
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  const c = canvas.getContext('2d')
  if (c === null) return
  c.setTransform(dpr, 0, 0, dpr, 0, 0)
  paintStyle(createScenePainter(style), c, w, h, scheme, performance.now(), 0, true, { ...IDLE_ACTIVITY }, snapEase)
  new PostFx().apply(canvas, c, w, h, sceneColors(style, scheme), true)
}

const snapEase = (_key: string, target: number): number => target

function paintStyle(
  painter: BoundPainter, c: CanvasRenderingContext2D, w: number, h: number, scheme: ColorScheme,
  now: number, dt: number, still: boolean, A: SceneActivity, sm: SceneFrame<ThemeStyle>['sm'],
): void {
  c.save()
  painter({ c, w, h, now, dt, s: layoutScale(w), still, A, sm }, scheme)
  c.restore()
}

/** Full-viewport scene canvas behind the shell. */
export class SceneHost {
  private readonly doc: Document
  /** Mounted canvas and its context; absent until first shown, or for good where the engine has no 2D context. */
  private surface: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | undefined
  private mounted = false
  private readonly painters = new Map<ThemeStyle, BoundPainter>()
  private readonly post = new PostFx()
  private target: SceneTarget | undefined
  private readonly activity: SceneActivity = { ...IDLE_ACTIVITY }
  private readonly eased = new Map<string, number>()
  private raf = 0
  private prev = 0
  private last = -Infinity
  private probeAt = -Infinity
  private busy = false
  private tools = -1
  private errors = -1
  private ghost: ReturnType<typeof offscreen>
  private fadeStart = -Infinity
  private w = 0
  private h = 0
  private readonly reduced: MediaQueryList | undefined
  private readonly cleanups: (() => void)[] = []

  /** @param doc - document to mount into. */
  constructor(doc: Document = document) {
    this.doc = doc
    const view = doc.defaultView
    this.reduced = typeof view?.matchMedia === 'function' ? view.matchMedia('(prefers-reduced-motion: reduce)') : undefined
    const onVisible = (): void => { this.kick() }
    const onResize = (): void => {
      this.w = 0
      this.kick()
    }
    doc.addEventListener('visibilitychange', onVisible)
    view?.addEventListener('resize', onResize, { passive: true })
    this.reduced?.addEventListener('change', onVisible)
    this.cleanups.push(() => {
      doc.removeEventListener('visibilitychange', onVisible)
      view?.removeEventListener('resize', onResize)
      this.reduced?.removeEventListener('change', onVisible)
    })
  }

  /**
   * Show a style, scheme, and motion; switching style or scheme cross-fades.
   * @param next - what to show.
   */
  update(next: SceneTarget): void {
    const prev = this.target
    if (prev?.style === next.style && prev.scheme === next.scheme && prev.motion === next.motion) return
    this.mount()
    if (prev !== undefined && (prev.style !== next.style || prev.scheme !== next.scheme) && !this.reducedMotion()) {
      this.snapshotGhost()
    }
    this.target = next
    this.kick()
  }

  /** Remove the canvas and stop the loop. */
  dispose(): void {
    if (this.raf !== 0) cancelAnimationFrame(this.raf)
    this.raf = 0
    for (const off of this.cleanups.splice(0)) off()
    this.surface?.canvas.remove()
    this.surface = undefined
  }

  private reducedMotion(): boolean {
    return this.reduced?.matches === true
  }

  private still(): boolean {
    return this.target?.motion === 'still' || this.reducedMotion()
  }

  private mount(): void {
    if (this.mounted) return
    this.mounted = true
    const canvas = this.doc.createElement('canvas')
    canvas.setAttribute('data-dsh-scene', '')
    canvas.setAttribute('aria-hidden', 'true')
    Object.assign(canvas.style, {
      position: 'fixed', inset: '0', width: '100%', height: '100%', zIndex: '-1', pointerEvents: 'none', display: 'block',
    })
    const ctx = canvas.getContext('2d')
    // Engines without a 2D context keep the plain scene background: nothing to mount.
    if (ctx === null) return
    this.doc.body.prepend(canvas)
    this.surface = { canvas, ctx }
  }

  private snapshotGhost(): void {
    const cv = this.surface?.canvas
    if (cv === undefined) return
    if (this.ghost?.canvas.width !== cv.width || this.ghost.canvas.height !== cv.height) this.ghost = offscreen(cv.width, cv.height)
    if (this.ghost === undefined) return
    this.ghost.ctx.clearRect(0, 0, cv.width, cv.height)
    this.ghost.ctx.drawImage(cv, 0, 0)
    this.fadeStart = performance.now()
  }

  /** Paint now and keep the loop running while there is motion to show. */
  private kick(): void {
    if (this.raf !== 0 || this.target === undefined || this.surface === undefined || this.doc.hidden) return
    this.raf = requestAnimationFrame((now) => { this.frame(now) })
  }

  private frame(now: number): void {
    this.raf = 0
    const target = this.target
    const surface = this.surface
    /* v8 ignore next -- kick() schedules only with a target and a surface, and dispose() cancels the frame */
    if (target === undefined || surface === undefined) return
    if (this.doc.hidden) return
    const c = surface.ctx
    const dt = this.prev > 0 ? Math.min(0.1, (now - this.prev) / 1000) : 0
    this.prev = now
    const still = this.still()
    const fading = now - this.fadeStart < FADE_MS
    if (!still || fading) this.raf = requestAnimationFrame((t) => { this.frame(t) })
    if (!still) this.sense(now, dt)
    if (now - this.last < FRAME_MS && this.w !== 0) return
    const frameDt = this.last === -Infinity ? 0 : Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    this.resize(surface.canvas, c)
    const w = this.w
    const h = this.h
    const A = still ? { ...this.activity, energy: 0 } : this.activity
    const sm = (key: string, value: number, rate: number): number => {
      const cur = this.eased.get(key) ?? value
      const next = still ? value : cur + (value - cur) * Math.min(1, frameDt * rate)
      this.eased.set(key, next)
      return next
    }
    paintStyle(this.painterFor(target.style), c, w, h, target.scheme, now, still ? 0 : frameDt, still, A, sm)
    this.post.apply(surface.canvas, c, w, h, sceneColors(target.style, target.scheme), still)
    if (fading && this.ghost !== undefined) {
      const k = (now - this.fadeStart) / FADE_MS
      c.save()
      c.setTransform(1, 0, 0, 1, 0, 0)
      c.globalAlpha = 1 - k * k * (3 - 2 * k)
      c.drawImage(this.ghost.canvas, 0, 0)
      c.restore()
    }
  }

  private painterFor(style: ThemeStyle): BoundPainter {
    let painter = this.painters.get(style)
    if (painter === undefined) {
      painter = createScenePainter(style)
      this.painters.set(style, painter)
    }
    return painter
  }

  private resize(cv: HTMLCanvasElement, c: CanvasRenderingContext2D): void {
    const view = this.doc.defaultView
    const w = Math.max(1, view?.innerWidth ?? 0)
    const h = Math.max(1, view?.innerHeight ?? 0)
    if (w === this.w && h === this.h) return
    this.w = w
    this.h = h
    const dpr = Math.min(view?.devicePixelRatio ?? 1, MAX_DPR)
    cv.width = Math.round(this.w * dpr)
    cv.height = Math.round(this.h * dpr)
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /** Probe the shell's activity markers and ease the energy. */
  private sense(now: number, dt: number): void {
    const A = this.activity
    if (now - this.probeAt >= PROBE_MS) {
      this.probeAt = now
      const busy = this.doc.querySelector(BUSY_SELECTOR) !== null
      const tools = this.doc.querySelectorAll(TOOL_SELECTOR).length
      const errors = this.doc.querySelectorAll(ERROR_SELECTOR).length
      if (this.tools >= 0 && tools > this.tools && tools - this.tools <= MAX_EVENT_JUMP) {
        A.events += tools - this.tools
        A.eventT = now
      }
      if (this.errors >= 0 && errors > this.errors && errors - this.errors <= MAX_EVENT_JUMP) A.errT = now
      if (this.busy && !busy) A.doneT = now
      this.tools = tools
      this.errors = errors
      this.busy = busy
    }
    const target = this.busy ? 1 : 0
    A.energy += (target - A.energy) * Math.min(1, dt * (target > A.energy ? 1.5 : 0.8))
    A.ph += dt * PH_RATE * (1 + A.energy * ENERGY_GAIN)
  }
}
