/**
 * BLACK HOLE — a Schwarzschild black hole seen at 78° inclination.
 *
 * Photon orbits u'' = 3u² − u (u = M/r, G = c = 1) are integrated once per
 * impact parameter; every pixel of a low-resolution buffer then looks up its
 * own null geodesic to find where it first crosses the thin disk between the
 * ISCO (6M) and 24M — primary and higher-order images included — or whether
 * it falls inside the shadow. The disk shades by a Novikov–Thorne-like
 * emissivity times g⁴, with g = √(1 − 3M/r) / (1 + Ω b sin i cos χ) folding
 * gravitational redshift and Doppler beaming together, so the approaching
 * side burns brighter. A turbulent texture shears at the Keplerian rate
 * Ω = r^−3/2 (two texture layers cross-fade so shear never winds up).
 *
 * A dashed curve traces the primary image of the ISCO: the level set
 * r = 6M of the radius field where each ray first meets the disk plane,
 * drawn by marching squares over the traced buffer.
 *
 * Behind it, graph paper and stars sit on a source plane and are re-imaged
 * through the lens equation θ± = (β ± √(β² + 4θ_E²)) / 2, bending into
 * arcs around the photon ring. In light mode the plate is a negative in the
 * manner of Luminet's 1979 plot: ink for light, paper for the shadow.
 *
 * Activity: busy speeds the clock and lifts the accretion rate; each tool
 * call releases a hot spot that spirals through the ISCO and plunges;
 * a failed call flares the inner disk red.
 */
import { at, clamp, rgbOf, rgba } from '../palette.ts'
import {
  age, contour, decode, ENERGY_GAIN, EventTrack, font, footer, offscreen, PH_RATE, seeded, TAU,
  type SceneFrame, type ScenePainter,
} from '../paint.ts'

const INCL = 78 * Math.PI / 180
const SIN_I = Math.sin(INCL)
const COS_I = Math.cos(INCL)
const R_IN = 6
const R_OUT = 24
const B_CRIT = 3 * Math.sqrt(3)
const B_MAX = 30
const NB = 600
const DPSI = 0.012
const PSI_MAX = 3 * Math.PI
const STEPS = Math.ceil(PSI_MAX / DPSI) + 2
/** Einstein radius of the source plane in M (weak-field lens for the paper and stars). */
const B_E = 9.5
/** Disk time per phase-clock second, in M (ISCO period ≈ 5 s of wall clock at idle). */
const TAU_RATE = 34
/** GM/c³ for Sgr A* (4.3 × 10⁶ M☉), in seconds. */
const T_M = 21.18
/** Texture cycle length in M; two layers cross-fade so shear never winds up. */
const TEX_CYCLE = 420

/** Geodesics by impact parameter: u = M/r sampled every DPSI, with fate. */
interface Orbit {
  u: Float32Array
  n: number
  captured: boolean
}

let orbits: Orbit[] | undefined

function integrate(b: number): Orbit {
  const u = new Float32Array(STEPS)
  let y = 0
  let v = 1 / b
  let n = 0
  const f = (uu: number): number => 3 * uu * uu - uu
  for (; n < STEPS - 1; n++) {
    u[n] = y
    const k1y = v
    const k1v = f(y)
    const k2y = v + DPSI / 2 * k1v
    const k2v = f(y + DPSI / 2 * k1y)
    const k3y = v + DPSI / 2 * k2v
    const k3v = f(y + DPSI / 2 * k2y)
    const k4y = v + DPSI * k3v
    const k4v = f(y + DPSI * k3y)
    y += DPSI / 6 * (k1y + 2 * k2y + 2 * k3y + k4y)
    v += DPSI / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
    if (y >= 0.5) return { u, n: n + 1, captured: true }
    if (y < 0) return { u, n: n + 1, captured: false }
  }
  return { u, n, captured: false }
}

/**
 * Null geodesics for impact parameters 0.05M..30M (computed once, shared).
 * @returns the orbit table.
 */
export function photonOrbits(): Orbit[] {
  orbits ??= Array.from({ length: NB }, (_, k) => integrate((k + 1) * B_MAX / NB))
  return orbits
}

/** One disk-hit pixel of the buffer. */
interface Hit {
  /** Buffer pixel index. */
  px: number
  /** Disk radius in M. */
  r: number
  /** Disk azimuth. */
  phi: number
  /** Emissivity × g⁴ (static part of the intensity). */
  eg4: number
  /** Keplerian angular velocity. */
  om: number
}

/** Lensing map of one buffer size. */
interface LensMap {
  bw: number
  bh: number
  hits: Hit[]
  shadow: Uint32Array
  /**
   * Radius (M) where each pixel's primary image crosses the disk plane: 2 when
   * the ray is swallowed first, FAR outside the traced field. Its level set at
   * r = 6M is the primary ISCO isoradial.
   */
  r0: Float32Array
  gMin: number
  gMax: number
}

/** Horizon radius in M (Schwarzschild, r = 2M). */
const R_HORIZON = 2
/** Stand-in radius for pixels outside the traced field. */
const FAR = 1000

/**
 * Impact parameter of the primary ISCO image on the approaching side, where
 * χ = π and the ray meets the disk plane at ψ = π/2.
 * @returns b in M (≈ 6.8M; straight-line optics would give 6M).
 */
export function iscoImpact(): number {
  const table = photonOrbits()
  const i = Math.round(Math.PI / 2 / DPSI)
  for (let k = 0; ; k++) {
    const orbit = at(table, k)
    if (orbit.n > i + 1 && at(orbit.u, i) < 1 / R_IN) return (k + 1) * B_MAX / NB
  }
}

const emissivity = (r: number): number => Math.max(0, 1 - Math.sqrt(R_IN / r)) / (r * r * r)
const EMISS_MAX = emissivity(8.17)

/**
 * Trace every buffer pixel through the orbit table.
 * @param bw - buffer width.
 * @param bh - buffer height.
 * @param rx - half-width covered, in M.
 * @param ry - half-height covered, in M.
 * @returns the lensing map.
 */
export function traceLens(bw: number, bh: number, rx: number, ry: number): LensMap {
  const table = photonOrbits()
  const hits: Hit[] = []
  const shadow: number[] = []
  const r0 = new Float32Array(bw * bh).fill(FAR)
  let gMin = Infinity
  let gMax = 0
  for (let py = 0; py < bh; py++) {
    for (let px = 0; px < bw; px++) {
      const X = (px + 0.5) / bw * 2 * rx - rx
      const Y = ry - (py + 0.5) / bh * 2 * ry
      const b = Math.hypot(X, Y)
      if (b >= B_MAX) continue
      const orbit = at(table, clamp(Math.round(b / B_MAX * NB) - 1, 0, NB - 1))
      const chi = Math.atan2(Y, X)
      const psi0 = Math.atan2(COS_I, -Math.sin(chi) * SIN_I)
      let hit = false
      for (let order = 0; order < 3 && !hit; order++) {
        const psi = psi0 + order * Math.PI
        const fi = psi / DPSI
        const i0 = Math.floor(fi)
        if (i0 + 1 >= orbit.n) {
          if (order === 0) r0[py * bw + px] = R_HORIZON
          break
        }
        const u = at(orbit.u, i0) + (at(orbit.u, i0 + 1) - at(orbit.u, i0)) * (fi - i0)
        const r = Math.min(FAR, 1 / u)
        if (order === 0) r0[py * bw + px] = r
        if (r < R_IN || r > R_OUT) continue
        const nx = Math.sin(psi) * Math.cos(chi)
        const ny = -Math.cos(psi) * SIN_I + Math.sin(psi) * Math.sin(chi) * COS_I
        const om = Math.pow(r, -1.5)
        const g = Math.sqrt(1 - 3 / r) / (1 + om * b * SIN_I * Math.cos(chi))
        gMin = Math.min(gMin, g)
        gMax = Math.max(gMax, g)
        hits.push({ px: py * bw + px, r, phi: Math.atan2(ny, nx), eg4: emissivity(r) / EMISS_MAX * g ** 4, om })
        hit = true
      }
      if (!hit && orbit.captured) shadow.push(py * bw + px)
    }
  }
  return { bw, bh, hits, shadow: Uint32Array.from(shadow), r0, gMin, gMax }
}

function noiseTable(seed: number): Float32Array {
  const r = seeded(seed)
  const NR = 48
  const NP = 256
  const modes = Array.from({ length: 7 }, (_, m) => ({
    kp: 2 + Math.floor(r() * (4 + m * 3)), kr: (r() - 0.5) * (8 + m * 4), ph: r() * TAU, a: 0.6 / (1 + m * 0.55),
  }))
  const out = new Float32Array(NR * NP)
  for (let i = 0; i < NR; i++) {
    for (let j = 0; j < NP; j++) {
      const rho = i / (NR - 1)
      const phi = j / NP * TAU
      let v = 0
      for (const md of modes) v += md.a * Math.cos(md.kp * phi + md.kr * rho + md.ph)
      out[i * NP + j] = clamp(0.78 + 0.36 * v, 0.22, 1.5)
    }
  }
  return out
}

function lut(stops: readonly string[]): Uint8ClampedArray {
  const cs = stops.map(rgbOf)
  const out = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) {
    const u = i / 255 * (cs.length - 1)
    const k = Math.min(cs.length - 2, Math.floor(u))
    const f = u - k
    for (let ch = 0; ch < 3; ch++) out[i * 3 + ch] = at(at(cs, k), ch) + (at(at(cs, k + 1), ch) - at(at(cs, k), ch)) * f
  }
  return out
}

interface HotSpot {
  phi0: number
}

/**
 * Create the BLACK HOLE painter.
 * @returns a stateful painter.
 */
export function createBlackHoleScene(): ScenePainter<'blackhole'> {
  const texA = noiseTable(31)
  const texB = noiseTable(47)
  const stars = (() => {
    const r = seeded(11)
    return Array.from({ length: 340 }, () => ({ x: r(), y: r(), m: r(), tw: r() * TAU }))
  })()
  const spots = new EventTrack<HotSpot>(3)
  const iscoB = iscoImpact()
  let lens: LensMap | undefined
  let buffer: ReturnType<typeof offscreen>
  let image: ImageData | undefined
  let rampKey = ''
  let ramp: Uint8ClampedArray = new Uint8ClampedArray(0)
  let tau = 0
  let lastPh = -1

  return (f: SceneFrame<'blackhole'>): void => {
    const { c, w, h, P, s, A, now, still } = f
    const cx = w * 0.7
    const cy = h * 0.47
    const mpx = Math.min(w * 0.24, h * 0.56) / 18
    const rx = 26
    const ry = 17
    // Background: scene, a warm accretion halo in emissive mode.
    c.fillStyle = P.scene
    c.fillRect(0, 0, w, h)
    if (P.emissive) {
      const g = c.createRadialGradient(cx, cy, mpx * 4, cx, cy, mpx * 30)
      g.addColorStop(0, rgba(P.accent, 0.16 + 0.1 * A.energy))
      g.addColorStop(1, rgba(P.accent, 0))
      c.fillStyle = g
      c.fillRect(0, 0, w, h)
    }

    // Disk clock in M: runs with the phase clock (busy runs faster).
    if (lastPh < 0 || still) tau = A.ph * TAU_RATE
    else tau += (A.ph - lastPh) * TAU_RATE
    lastPh = A.ph

    // Lensed graph paper on the source plane, drifting slowly.
    const step = 5
    const drift = (A.ph * 0.35) % step
    const left = -cx / mpx - 8
    const right = (w - cx) / mpx + 8
    const top = cy / mpx + 8
    const bottom = -(h - cy) / mpx - 8
    const lensed = (bx: number, by: number, sign: 1 | -1): [number, number] | undefined => {
      const beta = Math.max(1e-6, Math.hypot(bx, by))
      const th = (beta + sign * Math.sqrt(beta * beta + 4 * B_E * B_E)) / 2
      if (Math.abs(th) < B_CRIT * 1.03) return undefined
      return [cx + bx / beta * th * mpx, cy - by / beta * th * mpx]
    }
    c.lineWidth = 1
    for (const sign of [1, -1] as const) {
      c.strokeStyle = rgba(P.grid, sign === 1 ? 0.2 : 0.16)
      c.beginPath()
      for (let axis = 0; axis < 2; axis++) {
        const lo = axis === 0 ? left : bottom
        const hi = axis === 0 ? right : top
        const lo2 = axis === 0 ? bottom : left
        const hi2 = axis === 0 ? top : right
        for (let k = Math.floor(lo / step) * step; k <= hi; k += step) {
          const line = axis === 0 ? k + drift : k
          let pen = false
          let prev: [number, number] | undefined
          for (let q = lo2; q <= hi2; q += 0.6) {
            const p = axis === 0 ? lensed(line, q, sign) : lensed(q, k, sign)
            if (p === undefined || (prev !== undefined && Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 40 * s)) {
              pen = false
              prev = p
              continue
            }
            if (pen) c.lineTo(p[0], p[1])
            else c.moveTo(p[0], p[1])
            pen = true
            prev = p
          }
        }
      }
      c.stroke()
    }

    // Stars, each re-imaged into its two lensed images.
    c.fillStyle = P.star
    const span = right - left
    const spanY = top - bottom
    for (const st of stars) {
      const bx = left + ((st.x * span + A.ph * 0.6) % span)
      const by = bottom + st.y * spanY
      const beta = Math.max(1e-6, Math.hypot(bx, by))
      const u = beta / B_E
      const base = (0.15 + 0.6 * st.m * st.m) * (still ? 1 : 0.8 + 0.2 * Math.sin(now / 900 + st.tw))
      for (const sign of [1, -1] as const) {
        const p = lensed(bx, by, sign)
        if (p === undefined) continue
        const mu = Math.abs((u * u + 2) / (2 * u * Math.sqrt(u * u + 4)) + sign / 2)
        const a = clamp(base * Math.min(1.6, mu))
        if (a < 0.02) continue
        const stretch = Math.min(5, Math.max(1, mu))
        const ang = Math.atan2(p[1] - cy, p[0] - cx) + Math.PI / 2
        c.globalAlpha = a
        c.beginPath()
        c.ellipse(p[0], p[1], (0.5 + 1.1 * st.m) * stretch, 0.5 + 1.1 * st.m, ang, 0, TAU)
        c.fill()
      }
    }
    c.globalAlpha = 1

    // Ray-traced disk and shadow.
    const bw = Math.max(48, Math.min(300, Math.round(rx * 2 * mpx / 3.6)))
    const bh = Math.round(bw * ry / rx)
    if (lens?.bw !== bw || lens.bh !== bh) {
      lens = traceLens(bw, bh, rx, ry)
      buffer = offscreen(bw, bh)
      image = buffer?.ctx.createImageData(bw, bh)
    }
    const key = P.ramp.join()
    if (key !== rampKey) {
      rampKey = key
      ramp = lut(P.ramp)
    }
    const errK = f.sm('err', age(A.errT, now) < 1.8 ? 1 : 0, 3)
    const items = spots.update(A, now, f.dt, still, () => ({ phi0: (A.ph * 1.7) % TAU }))
    const hot = items.map((it) => {
      const life = (now - it.t0) / 1000
      const rr = R_IN + 5.5 * Math.exp(-life / 4.5) - Math.max(0, life - 7) * 0.9
      const phi = it.item.phi0 + life * TAU_RATE * PH_RATE * Math.pow(Math.max(rr, 4), -1.5) * (1 + A.energy * ENERGY_GAIN)
      return { r: rr, phi, a: it.k * clamp(1.2 - Math.max(0, life - 6) / 3), it }
    }).filter(sp => sp.a > 0.01 && sp.r > 2.4)
    if (buffer !== undefined && image !== undefined) {
      const d = image.data
      d.fill(0)
      const [sr, sg, sb] = rgbOf(P.shadow)
      for (const px of lens.shadow) {
        const o = px * 4
        d[o] = sr
        d[o + 1] = sg
        d[o + 2] = sb
        d[o + 3] = 255
      }
      const t1 = tau % TEX_CYCLE
      const t2 = (tau + TEX_CYCLE / 2) % TEX_CYCLE
      const w1 = Math.sin(Math.PI * t1 / TEX_CYCLE) ** 2
      const gain = (0.85 + 0.75 * A.energy) * (1 + errK * 0.8)
      const lnSpan = Math.log(R_OUT / R_IN)
      const [er, eg, eb] = rgbOf(P.err)
      for (const hp of lens.hits) {
        const ri = Math.min(47, Math.floor(Math.log(hp.r / R_IN) / lnSpan * 47))
        const pa = ((hp.phi - hp.om * t1) / TAU % 1 + 1) % 1
        const pb = ((hp.phi - hp.om * t2) / TAU % 1 + 1) % 1
        const tex = at(texA, ri * 256 + Math.floor(pa * 256) % 256) * w1 + at(texB, ri * 256 + Math.floor(pb * 256) % 256) * (1 - w1)
        let I = hp.eg4 * tex * gain
        for (const sp of hot) {
          const dr = hp.r - sp.r
          let dp = hp.phi - sp.phi
          dp -= TAU * Math.round(dp / TAU)
          I += 3.2 * sp.a * Math.exp(-(dr * dr) / 1.1 - (dp * hp.r) ** 2 / 2.2) * hp.eg4 / Math.max(0.15, emissivity(hp.r) / EMISS_MAX)
        }
        const v = 1 - Math.exp(-1.25 * I)
        const li = Math.round(clamp(v) * 255) * 3
        const o = hp.px * 4
        const hotMix = errK * clamp(1.4 - hp.r / 10)
        d[o] = at(ramp, li) + (er - at(ramp, li)) * hotMix
        d[o + 1] = at(ramp, li + 1) + (eg - at(ramp, li + 1)) * hotMix
        d[o + 2] = at(ramp, li + 2) + (eb - at(ramp, li + 2)) * hotMix
        d[o + 3] = 255 * clamp(v * (P.emissive ? 1.7 : 1.35))
      }
      buffer.ctx.putImageData(image, 0, 0)
      c.imageSmoothingEnabled = true
      c.drawImage(buffer.canvas, cx - rx * mpx, cy - ry * mpx, rx * 2 * mpx, ry * 2 * mpx)
    }

    // Photon ring (critical curve) and the dashed ISCO isoradial of the primary image.
    c.strokeStyle = rgba(P.ring, P.emissive ? 0.9 : 0.85)
    c.lineWidth = Math.max(1.2, mpx * 0.09)
    c.beginPath()
    c.arc(cx, cy, B_CRIT * mpx, 0, TAU)
    c.stroke()
    if (P.emissive) {
      c.strokeStyle = rgba(P.ring, 0.22)
      c.lineWidth = Math.max(3, mpx * 0.35)
      c.beginPath()
      c.arc(cx, cy, B_CRIT * mpx * 1.02, 0, TAU)
      c.stroke()
    }
    c.save()
    c.translate(cx - rx * mpx, cy - ry * mpx)
    c.scale(rx * 2 * mpx / lens.bw, ry * 2 * mpx / lens.bh)
    c.beginPath()
    contour(c, lens.r0, lens.bw, lens.bh, 1, R_IN, 0.5, 0.5)
    c.restore()
    c.setLineDash([2.5, 3.5])
    c.strokeStyle = rgba(P.lab, 0.75)
    c.lineWidth = 1
    c.stroke()
    c.setLineDash([])

    // Annotations.
    const ms = Math.max(0.6, s)
    if (w > 420) {
      c.font = font(P, 10, s)
      c.strokeStyle = rgba(P.ink, 0.35)
      const ra = -0.72
      const qx = cx + Math.cos(ra) * B_CRIT * mpx
      const qy = cy + Math.sin(ra) * B_CRIT * mpx
      c.beginPath()
      c.moveTo(qx, qy)
      c.lineTo(qx + 34 * ms, qy - 30 * ms)
      c.lineTo(qx + 120 * ms, qy - 30 * ms)
      c.stroke()
      c.fillStyle = rgba(P.ink2, 0.9)
      c.fillText('photon ring · b = 3√3 M', qx + 38 * ms, qy - 35 * ms)
      const lx = cx - iscoB * mpx
      c.beginPath()
      c.moveTo(lx, cy)
      c.lineTo(lx - 22 * ms, cy + 40 * ms)
      c.stroke()
      c.fillText('ISCO · r = 6M', lx - 90 * ms, cy + 54 * ms)
      c.fillStyle = rgba(P.lab, 0.9)
      c.fillText(`approaching · g ${lens.gMax.toFixed(2)}`, cx - R_OUT * 0.78 * mpx, cy + 7.2 * mpx)
      c.textAlign = 'right'
      c.fillText(`receding · g ${lens.gMin.toFixed(2)}`, cx + R_OUT * 0.8 * mpx, cy + 7.2 * mpx)
      c.textAlign = 'left'
      for (const sp of hot) {
        if (sp.it !== items[items.length - 1]) continue
        const readout = `hot spot · r ${Math.max(R_IN, sp.r).toFixed(1)}M · P ${(TAU / Math.pow(Math.max(sp.r, R_IN), -1.5) * T_M / 60).toFixed(1)} min`
        c.fillStyle = rgba(P.lab, sp.a)
        c.fillText(decode(readout, (now - sp.it.t0) / 900, now / 1000), cx + 7 * mpx, cy - 9.5 * mpx)
      }
      if (errK > 0.05) {
        c.fillStyle = rgba(P.err, errK)
        c.fillText('FLARE · inner disk ×1.8', cx - 4 * mpx, cy - 11 * mpx)
      }
    }
    const rate = TAU_RATE * PH_RATE * (1 + ENERGY_GAIN * A.energy) * T_M / 60
    footer(f, `Sgr A* model · M 4.30×10⁶ M☉ · i 78° · shadow 53 µas · P_ISCO 32.6 min · 1 s ≈ ${rate.toFixed(1)} min`)
  }
}
