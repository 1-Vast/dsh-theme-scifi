/**
 * FIELD — a radiating Hertzian dipole, the figure Hertz confirmed in 1888.
 *
 * The electric field lines of an oscillating point dipole are the level sets
 * of Q(r, θ, t) = sin²θ · [cos(kr − ωt)/(kr) − sin(kr − ωt)]. Contouring Q
 * every frame shows the near field (bound to the antenna) pinching off into
 * closed loops that travel outward at c — the moment light leaves its
 * source. Lobes are shaded by the sign of Q; the dashed circle kr = 1 marks
 * the near/far boundary, and the inset plots the far-field pattern
 * dP/dΩ ∝ sin²θ. Each tool call launches a wavefront marker that rides
 * outward at the phase speed; a failed call slips the drive phase by π.
 */
import { at, clamp, rgbOf, rgba } from '../palette.ts'
import {
  age, backdrop, contour, decode, EventTrack, font, footer, offscreen, TAU,
  type SceneFrame, type ScenePainter,
} from '../paint.ts'

/**
 * Field-line function of a Hertzian dipole along the screen's vertical axis.
 * @param kr - radius in units of 1/k.
 * @param sinT - sin θ from the dipole axis.
 * @param wt - drive phase ωt.
 * @returns Q; electric field lines are its level sets.
 */
export function dipoleLines(kr: number, sinT: number, wt: number): number {
  const x = Math.max(kr, 0.35)
  return sinT * sinT * (Math.cos(x - wt) / x - Math.sin(x - wt))
}

const LEVELS = [-1.6, -0.95, -0.5, -0.18, 0.18, 0.5, 0.95, 1.6]

/**
 * Create the FIELD painter.
 * @returns a stateful painter.
 */
export function createFieldScene(): ScenePainter<'field'> {
  const fronts = new EventTrack<{ ph0: number }>(4)
  let heat: ReturnType<typeof offscreen>
  let img: ImageData | undefined
  let F = new Float32Array(0)
  return (f: SceneFrame<'field'>): void => {
    const { c, w, h, P, s, A, now, still } = f
    const ms = Math.max(s, 0.6)
    const cx = w * 0.7
    const cy = h * 0.48
    const L = Math.min(w, h) * 0.055
    backdrop(c, w, h, P, cx, cy, Math.min(w, h) * 0.8, P.accent, 0.04)
    const slip = f.sm('slip', age(A.errT, now) < 2.2 ? 1 : 0, 2.5)
    const wt = A.ph * 2.2 + slip * Math.PI
    // Sample Q on a coarse grid over the whole scene.
    const cs = Math.max(7, 10 * s)
    const cols = Math.ceil(w / cs) + 2
    const rows = Math.ceil(h / cs) + 2
    if (F.length !== cols * rows) F = new Float32Array(cols * rows)
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const dx = q * cs - cx
        const dy = r * cs - cy
        const rr = Math.hypot(dx, dy)
        F[r * cols + q] = dipoleLines(rr / L, Math.abs(dx) / Math.max(rr, 1e-9), wt)
      }
    }
    // Lobe shading by the sign of Q.
    if (heat?.canvas.width !== cols || heat.canvas.height !== rows) {
      heat = offscreen(cols, rows)
      img = heat?.ctx.createImageData(cols, rows)
    }
    if (heat !== undefined && img !== undefined) {
      const d = img.data
      const pc = rgbOf(P.pos)
      const nc = rgbOf(P.neg)
      for (let i = 0; i < F.length; i++) {
        const v = Math.tanh(at(F, i) * 0.9)
        const col = v > 0 ? pc : nc
        d[i * 4] = col[0]
        d[i * 4 + 1] = col[1]
        d[i * 4 + 2] = col[2]
        d[i * 4 + 3] = Math.abs(v) * P.heat * 255
      }
      heat.ctx.putImageData(img, 0, 0)
      c.imageSmoothingEnabled = true
      c.drawImage(heat.canvas, -cs / 2, -cs / 2, cols * cs, rows * cs)
    }
    // Field lines: contours of Q.
    c.lineWidth = 1.1
    for (const sign of [1, -1]) {
      c.strokeStyle = rgba(sign > 0 ? P.pos : P.neg, 0.55)
      c.beginPath()
      for (const lv of LEVELS) if (Math.sign(lv) === sign) contour(c, F, cols, rows, cs, lv)
      c.stroke()
    }
    c.lineWidth = 1
    // Near/far boundary kr = 1 and wavelength ruler.
    c.setLineDash([3, 5])
    c.strokeStyle = rgba(P.ink, 0.35)
    c.beginPath()
    c.arc(cx, cy, L, 0, TAU)
    c.stroke()
    c.setLineDash([])
    const labels = w > 420
    if (labels) {
      c.font = font(P, 9.5, s)
      c.fillStyle = rgba(P.ink2, 0.9)
      c.fillText('kr = 1 · near ↔ far', cx + L * 0.75, cy - L * 0.75)
      const y0 = cy + L * 6.4
      c.strokeStyle = rgba(P.ink, 0.45)
      c.beginPath()
      c.moveTo(cx, y0)
      c.lineTo(cx + TAU * L, y0)
      c.moveTo(cx, y0 - 4)
      c.lineTo(cx, y0 + 4)
      c.moveTo(cx + TAU * L, y0 - 4)
      c.lineTo(cx + TAU * L, y0 + 4)
      c.stroke()
      c.fillText('λ = 2πc / ω', cx + TAU * L / 2 - 30, y0 - 6)
    }
    // Wavefront markers, one per tool call, riding outward at c.
    const items = fronts.update(A, now, f.dt, still, () => ({ ph0: A.ph }))
    items.forEach((it, n) => {
      const ag = (now - it.t0) / 1000
      const rr = still ? L * 3 : (A.ph - it.item.ph0) * 2.2 * L
      const a = it.k * clamp(1 - rr / (Math.max(w, h) * 0.9))
      if (a < 0.02) return
      c.strokeStyle = rgba(P.accent, 0.8 * a)
      c.lineWidth = 2
      c.beginPath()
      c.arc(cx, cy, rr, 0, TAU)
      c.stroke()
      c.lineWidth = 1
      if (labels && n === items.length - 1) {
        const lab = `wavefront · r = ${(rr / (TAU * L)).toFixed(2)} λ · t = r/c`
        c.font = font(P, 10, s)
        c.fillStyle = rgba(P.lab, a)
        c.fillText(still ? lab : decode(lab, ag / 0.8, now / 1000), cx + rr * 0.72 + 6, cy - rr * 0.72)
      }
    })
    // The antenna: two charges ±q cos ωt.
    const qv = Math.cos(wt)
    const d0 = L * 0.42
    c.strokeStyle = rgba(P.ink, 0.7)
    c.lineWidth = 2 * ms
    c.beginPath()
    c.moveTo(cx, cy - d0)
    c.lineTo(cx, cy + d0)
    c.stroke()
    c.lineWidth = 1
    for (const [y, sgn] of [[cy - d0, 1], [cy + d0, -1]] as const) {
      const q = qv * sgn
      const col = q > 0 ? P.pos : P.neg
      const R = (3 + 3 * Math.abs(q)) * ms
      const g = c.createRadialGradient(cx, y, 0, cx, y, R * 2.6)
      g.addColorStop(0, rgba(col, 0.95))
      g.addColorStop(0.4, rgba(col, 0.5))
      g.addColorStop(1, rgba(col, 0))
      c.fillStyle = g
      c.beginPath()
      c.arc(cx, y, R * 2.6, 0, TAU)
      c.fill()
    }
    if (slip > 0.05 && labels) {
      c.font = font(P, 10.5, s)
      c.fillStyle = rgba(P.err, slip)
      c.fillText('DRIVE · phase slip π', cx - 60, cy - L * 1.5)
    }
    // Far-field pattern inset: dP/dΩ ∝ sin²θ.
    if (labels) {
      const ix = w * 0.92
      const iy = h * 0.8
      const ir = Math.min(w, h) * 0.07
      c.strokeStyle = rgba(P.ink, 0.25)
      c.beginPath()
      c.moveTo(ix, iy - ir * 1.2)
      c.lineTo(ix, iy + ir * 1.2)
      c.moveTo(ix - ir * 1.2, iy)
      c.lineTo(ix + ir * 1.2, iy)
      c.stroke()
      c.strokeStyle = rgba(P.accent, 0.85)
      c.beginPath()
      for (let j = 0; j <= 96; j++) {
        const th = j / 96 * TAU
        const rr = ir * Math.sin(th) ** 2
        const x = ix + rr * Math.sin(th)
        const y = iy - rr * Math.cos(th)
        if (j) c.lineTo(x, y)
        else c.moveTo(x, y)
      }
      c.stroke()
      c.font = font(P, 9, s)
      c.fillStyle = rgba(P.ink2, 0.9)
      c.fillText('dP/dΩ ∝ sin²θ', ix - ir * 1.2, iy + ir * 1.2 + 14)
    }
    footer(f, `Hertzian dipole · P = q₀²d²ω⁴ / 12πε₀c³ · ωt ${((wt % TAU) / TAU * 360).toFixed(0)}° · ${LEVELS.length} field-line levels`)
  }
}
