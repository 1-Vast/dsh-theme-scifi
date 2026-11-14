/**
 * ORRERY — the inner solar system to Saturn on a tilted ecliptic.
 *
 * Mercury to Saturn and a long-period comet move on Kepler orbits (Kepler's
 * equation by Newton iteration), with a 420-body main belt at Kepler speeds
 * and Jupiter's Trojan swarms librating about L4 and L5, 60° ahead of and
 * behind the planet. Jupiter carries its Laplace sphere of influence
 * a·(m/M)^(2/5) ≈ 0.32 AU. Each tool call flies a Hohmann transfer labelled
 * with its real Δv and time of flight (Earth → Mars: 5.60 km/s, 259 d). A
 * failed call aborts the live transfer in red. Busy agents run the clock
 * faster; the footer keeps a live Julian date.
 */
import { at, clamp, mixHex, rgba } from '../palette.ts'
import {
  age, backdrop, decode, EventTrack, fmt, font, footer, gauss, seeded, TAU,
  type SceneFrame, type ScenePainter,
} from '../paint.ts'

interface Planet {
  n: string
  a: number
  e: number
  w: number
  M0: number
  r: number
  comet?: boolean
  label?: boolean
}

const PLANETS: readonly Planet[] = [
  { n: 'Mercury', a: 0.387, e: 0.206, w: 1.35, M0: 3.05, r: 2.0 },
  { n: 'Venus', a: 0.723, e: 0.007, w: 2.30, M0: 0.88, r: 3.2 },
  { n: 'Earth', a: 1.000, e: 0.017, w: 1.80, M0: 6.24, r: 3.4, label: true },
  { n: 'Mars', a: 1.524, e: 0.093, w: 5.00, M0: 0.34, r: 2.7, label: true },
  { n: 'Jupiter', a: 5.203, e: 0.049, w: 0.26, M0: 0.35, r: 6.2, label: true },
  { n: 'Saturn', a: 9.537, e: 0.057, w: 1.61, M0: 5.53, r: 5.2, label: true },
  { n: 'C/2026 V1', a: 4.6, e: 0.78, w: 3.6, M0: 0.4, r: 1.6, comet: true, label: true },
]
const JUPITER = at(PLANETS, 4)
/** Laplace sphere of influence of Jupiter: a (m_J / M_☉)^(2/5) in AU. */
const JUPITER_SOI = 5.203 * (9.5458e-4) ** 0.4

/**
 * Solve Kepler's equation M = E − e sin E.
 * @param M - mean anomaly.
 * @param e - eccentricity.
 * @returns eccentric anomaly.
 */
export function kepler(M: number, e: number): number {
  let E = e > 0.6 ? Math.PI : M
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
  return E
}

const kepPolar = (p: Planet, M: number): [number, number] => {
  const MM = ((M % TAU) + TAU) % TAU
  const E = kepler(MM, p.e)
  const r = p.a * (1 - p.e * Math.cos(E))
  const nu = 2 * Math.atan2(Math.sqrt(1 + p.e) * Math.sin(E / 2), Math.sqrt(1 - p.e) * Math.cos(E / 2))
  return [r, nu + p.w]
}

const PATHS = PLANETS.map(p => Array.from({ length: 160 }, (_, j) => kepPolar(p, j / 160 * TAU)))
const BELT = (() => { const r = seeded(21); return Array.from({ length: 420 }, () => [2.15 + r() * 1.15, r() * TAU, r()] as const) })()
const TROJANS = (() => {
  const r = seeded(29)
  return Array.from({ length: 220 }, (_, i) => [
    (i % 2 ? 1 : -1) * Math.PI / 3 + gauss(r) * 0.16, 5.203 + gauss(r) * 0.09, r(), r() * TAU,
  ] as const)
})()
const MILKY = (() => { const r = seeded(5); return Array.from({ length: 700 }, () => [r(), gauss(r) * 0.07, r()] as const) })()
const STARS = (() => { const r = seeded(9); return Array.from({ length: 160 }, () => [r(), r(), r()] as const) })()
const XFERS: readonly (readonly [number, number])[] = [[2, 3], [2, 1], [3, 4], [2, 4]]
const AU = 1.495978707e8
const MU_SUN = 1.32712440018e11

/**
 * Hohmann transfer between circular orbits.
 * @param a1 - departure radius (AU).
 * @param a2 - arrival radius (AU).
 * @returns total Δv in km/s and time of flight in days.
 */
export function hohmann(a1: number, a2: number): { dv: number; tof: number } {
  const R1 = a1 * AU
  const R2 = a2 * AU
  const at = (R1 + R2) / 2
  const dv = Math.abs(Math.sqrt(MU_SUN / R1) * (Math.sqrt(2 * R2 / (R1 + R2)) - 1))
    + Math.abs(Math.sqrt(MU_SUN / R2) * (1 - Math.sqrt(2 * R1 / (R1 + R2))))
  return { dv, tof: Math.PI * Math.sqrt(at ** 3 / MU_SUN) / 86400 }
}

interface Transfer {
  p1: Planet
  p2: Planet
  th0: number
  dv: number
  tof: number
}

/**
 * Create the ORRERY painter.
 * @returns a stateful painter.
 */
export function createOrreryScene(): ScenePainter<'orrery'> {
  const transfers = new EventTrack<Transfer>(2)
  let lastYrs = Number.NaN
  return (f: SceneFrame<'orrery'>): void => {
    const { c, w, h, P, s, A, now, still } = f
    const ms = Math.max(s, 0.6)
    const errK = f.sm('err', age(A.errT, now) < 1.8 ? 1 : 0, 4)
    const cx = w * 0.7
    const cy = h * 0.5
    const SC = Math.min(w * 0.36, h * 0.9)
    backdrop(c, w, h, P, cx, cy, SC * 1.1, P.accent, 0.06)
    // Milky Way band and field stars.
    const bx0 = -0.05 * w
    const by0 = h * 0.92
    const bdx = w * 1.1
    const bdy = h * 0.02 - by0
    const bl = Math.hypot(bdx, bdy)
    const nx = -bdy / bl
    const ny = bdx / bl
    c.save()
    c.translate(bx0 + bdx / 2, by0 + bdy / 2)
    c.rotate(Math.atan2(bdy, bdx))
    const gw = h * 0.2
    const mg = c.createLinearGradient(0, -gw, 0, gw)
    mg.addColorStop(0, rgba(P.mw, 0))
    mg.addColorStop(0.5, rgba(P.mw, P.mwA))
    mg.addColorStop(1, rgba(P.mw, 0))
    c.fillStyle = mg
    c.fillRect(-bl / 2, -gw, bl, gw * 2)
    c.restore()
    c.fillStyle = P.star
    for (const [u, o, b] of MILKY) {
      c.globalAlpha = clamp(0.08 + 0.4 * b * b)
      c.fillRect(bx0 + bdx * u + nx * o * h, by0 + bdy * u + ny * o * h, 1.2, 1.2)
    }
    STARS.forEach(([a, b, z], i) => {
      const tw = still ? 1 : 0.8 + 0.2 * Math.sin(now / 770 + i)
      c.globalAlpha = clamp((0.12 + 0.4 * z * z) * tw)
      c.beginPath()
      c.arc(a * w, b * h, (0.5 + 1.3 * z * z) * ms, 0, TAU)
      c.fill()
    })
    c.globalAlpha = 1

    // Camera: ecliptic tilted 63°, slowly turning with the phase clock.
    const tilt = 1.1
    const ct = Math.cos(tilt)
    const az = A.ph * 0.004
    const disp = (r: number): number => SC * Math.sqrt(Math.max(0, r) / 9.6)
    const proj = (r: number, ang: number): [number, number, number] => {
      const R = disp(r)
      const a = ang + az
      return [cx + R * Math.cos(a), cy + R * Math.sin(a) * ct, Math.sin(a)]
    }
    c.lineWidth = 1
    for (const a of [1, 2, 5, 10]) {
      c.strokeStyle = rgba(P.grid, a === 10 ? 0.22 : 0.13)
      c.beginPath()
      c.ellipse(cx, cy, disp(a), disp(a) * ct, 0, 0, TAU)
      c.stroke()
    }
    c.strokeStyle = rgba(P.grid, 0.08)
    c.beginPath()
    for (let j = 0; j < 12; j++) {
      const [x1, y1] = proj(0.25, j * TAU / 12)
      const [x2, y2] = proj(10.6, j * TAU / 12)
      c.moveTo(x1, y1)
      c.lineTo(x2, y2)
    }
    c.stroke()
    c.strokeStyle = rgba(P.grid, 0.24)
    c.beginPath()
    for (let j = 0; j < 72; j++) {
      const [x1, y1] = proj(10, j * TAU / 72)
      const [x2, y2] = proj(j % 6 ? 10.3 : 10.75, j * TAU / 72)
      c.moveTo(x1, y1)
      c.lineTo(x2, y2)
    }
    c.stroke()
    const labels = w > 420
    if (labels) {
      c.font = font(P, 9, s)
      c.fillStyle = rgba(P.ink3, 0.95)
      c.textAlign = 'center'
      for (let j = 0; j < 12; j++) {
        const [x, y, d] = proj(11.5, j * TAU / 12)
        if (d > -0.3) c.fillText(`${j * 30}°`, x, y + 3)
      }
      c.textAlign = 'left'
      for (const a of [1, 2, 5]) {
        const [x, y] = proj(a, -az)
        c.fillText(`${a} AU`, x + 4, y - 4)
      }
    }

    // Main belt, then Jupiter's Trojans riding its mean longitude ±60°.
    const yrs = A.ph * 0.045
    c.fillStyle = P.ink
    for (const [a, th0, b] of BELT) {
      const [x, y] = proj(a, th0 + TAU / Math.pow(a, 1.5) * yrs)
      c.globalAlpha = clamp(0.12 + 0.25 * b)
      c.fillRect(x, y, 1.1 * ms, 1.1 * ms)
    }
    const jM = JUPITER.M0 + TAU / Math.pow(JUPITER.a, 1.5) * yrs
    const jLon = kepPolar(JUPITER, jM)[1]
    c.fillStyle = P.trojan
    for (const [off, a, b, lib] of TROJANS) {
      const [x, y] = proj(a, jLon + off + 0.12 * Math.sin(yrs * 0.6 + lib))
      c.globalAlpha = clamp(0.2 + 0.4 * b)
      c.fillRect(x, y, 1.3 * ms, 1.3 * ms)
    }
    c.globalAlpha = 1

    // Orbits, trails, bodies.
    const bodies = PLANETS.map((p, pi) => {
      c.strokeStyle = rgba(P.ink, 0.2)
      c.lineWidth = 1
      if (p.comet === true) c.setLineDash([2, 4])
      c.beginPath()
      at(PATHS, pi).forEach(([r, an], j) => {
        const [x, y] = proj(r, an)
        if (j) c.lineTo(x, y)
        else c.moveTo(x, y)
      })
      c.closePath()
      c.stroke()
      c.setLineDash([])
      const M = p.M0 + TAU / Math.pow(p.a, 1.5) * yrs
      const pos = (MM: number): [number, number, number] => {
        const [r, an] = kepPolar(p, MM)
        return proj(r, an)
      }
      let prev = pos(M)
      c.lineWidth = 1.6
      for (let j = 1; j <= 20; j++) {
        const nx2 = pos(M - 0.9 * j / 20)
        c.strokeStyle = rgba(P.ink, (1 - j / 20) * 0.55)
        c.beginPath()
        c.moveTo(prev[0], prev[1])
        c.lineTo(nx2[0], nx2[1])
        c.stroke()
        prev = nx2
      }
      const [x, y, d] = pos(M)
      return { p, x, y, d }
    })
    c.lineWidth = 1
    const drawSun = (): void => {
      const R0 = 30 * s + 8
      const sg = c.createRadialGradient(cx, cy, 0, cx, cy, R0)
      sg.addColorStop(0, rgba(P.sun, 0.95))
      sg.addColorStop(0.18, rgba(P.sun, 0.75))
      sg.addColorStop(0.4, rgba(P.sun, 0.18))
      sg.addColorStop(1, rgba(P.sun, 0))
      c.fillStyle = sg
      c.beginPath()
      c.arc(cx, cy, R0, 0, TAU)
      c.fill()
      c.strokeStyle = rgba(P.sun, 0.22)
      c.beginPath()
      for (let j = 0; j < 16; j++) {
        const a = j * TAU / 16 + A.ph * 0.01
        const r1 = R0 * 0.35
        const r2 = R0 * (j % 2 ? 0.8 : 1.2)
        c.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1)
        c.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2)
      }
      c.stroke()
    }
    const drawBody = (b: typeof bodies[number]): void => {
      const R = b.p.r * ms
      const dx = cx - b.x
      const dy = cy - b.y
      const L = Math.max(1, Math.hypot(dx, dy))
      if (b.p.comet === true) {
        const tl = Math.min(70, 2600 / L) * s + 6
        const tg = c.createLinearGradient(b.x, b.y, b.x - dx / L * tl, b.y - dy / L * tl)
        tg.addColorStop(0, rgba(P.ink, 0.55))
        tg.addColorStop(1, rgba(P.ink, 0))
        c.strokeStyle = tg
        c.lineWidth = 2.2
        c.beginPath()
        c.moveTo(b.x, b.y)
        c.lineTo(b.x - dx / L * tl, b.y - dy / L * tl)
        c.stroke()
        c.lineWidth = 1
      }
      const g = c.createRadialGradient(b.x + dx / L * R * 0.45, b.y + dy / L * R * 0.45, R * 0.1, b.x, b.y, R * 1.05)
      g.addColorStop(0, rgba(P.lit, 1))
      g.addColorStop(1, rgba(P.body, 1))
      c.fillStyle = g
      c.beginPath()
      c.arc(b.x, b.y, R, 0, TAU)
      c.fill()
      if (b.p === PLANETS[5]) {
        c.strokeStyle = rgba(P.ink, 0.55)
        c.beginPath()
        c.ellipse(b.x, b.y, R * 2.2, R * 2.2 * ct, -0.2, 0, TAU)
        c.stroke()
      }
      if (b.p === JUPITER) {
        const soi = disp(JUPITER.a + JUPITER_SOI) - disp(JUPITER.a)
        c.setLineDash([2, 3])
        c.strokeStyle = rgba(P.trojan, 0.6)
        c.beginPath()
        c.ellipse(b.x, b.y, soi, soi * ct, 0, 0, TAU)
        c.stroke()
        c.setLineDash([])
      }
      if (labels && b.p.label === true) {
        c.font = font(P, 9.5, s)
        c.fillStyle = rgba(P.ink2, 0.9)
        c.strokeStyle = rgba(P.ink, 0.3)
        c.beginPath()
        c.moveTo(b.x + R + 2, b.y - R - 2)
        c.lineTo(b.x + R + 10, b.y - R - 10)
        c.stroke()
        const extra = b.p === JUPITER ? `  SOI ${JUPITER_SOI.toFixed(2)} AU · L4/L5 Trojans` : ''
        c.fillText(`${b.p.n}  a ${b.p.a.toFixed(3)} AU  e ${b.p.e.toFixed(3)}${extra}`, b.x + R + 12, b.y - R - 10)
      }
    }
    bodies.filter(b => b.d < 0).forEach(drawBody)
    drawSun()
    bodies.filter(b => b.d >= 0).forEach(drawBody)

    // One Hohmann transfer per tool call.
    const items = transfers.update(A, now, f.dt, still, (i) => {
      const [a, b] = at(XFERS, i % XFERS.length)
      const p1 = at(PLANETS, a)
      const p2 = at(PLANETS, b)
      return { p1, p2, th0: kepPolar(p1, p1.M0 + TAU / Math.pow(p1.a, 1.5) * yrs)[1], ...hohmann(p1.a, p2.a) }
    })
    items.forEach((x, n) => {
      const latest = n === items.length - 1
      const fl = still ? 1 : clamp((now - x.t0) / 2800)
      const out = x.item.p2.a > x.item.p1.a
      const r1 = x.item.p1.a
      const r2 = x.item.p2.a
      const et = Math.abs(r2 - r1) / (r1 + r2)
      const pp = (r1 + r2) / 2 * (1 - et * et)
      const pt = (q: number): [number, number, number] => {
        const nu = Math.PI * q
        const r = out ? pp / (1 + et * Math.cos(nu)) : pp / (1 - et * Math.cos(nu))
        return proj(r, x.item.th0 + nu)
      }
      const col = latest ? mixHex(P.accent, P.err, errK) : P.accent
      c.setLineDash([3, 4])
      c.strokeStyle = rgba(col, 0.4 * x.k)
      c.beginPath()
      for (let q = fl; q <= 1.0001; q += 1 / 60) {
        const [a, b] = pt(q)
        if (q === fl) c.moveTo(a, b)
        else c.lineTo(a, b)
      }
      c.stroke()
      c.setLineDash([])
      c.strokeStyle = rgba(col, 0.95 * x.k)
      c.lineWidth = 1.6
      c.beginPath()
      for (let q = 0; q <= fl + 1e-4; q += 1 / 60) {
        const [a, b] = pt(Math.min(q, fl))
        if (q === 0) c.moveTo(a, b)
        else c.lineTo(a, b)
      }
      c.stroke()
      c.lineWidth = 1
      const [qx, qy] = pt(fl)
      const pg = c.createRadialGradient(qx, qy, 0, qx, qy, 9 * ms)
      pg.addColorStop(0, rgba(col, 0.9 * x.k))
      pg.addColorStop(1, rgba(col, 0))
      c.fillStyle = pg
      c.beginPath()
      c.arc(qx, qy, 9 * ms, 0, TAU)
      c.fill()
      const ar = (now - x.t0) / 1000 - 2.8
      if (!still && ar > 0 && ar < 1.8) {
        c.strokeStyle = rgba(col, (1 - ar / 1.8) * 0.85 * x.k)
        c.beginPath()
        c.arc(qx, qy, 4 + ar * 22 * s, 0, TAU)
        c.stroke()
      }
      if (latest && labels) {
        const [mx2, my2] = pt(0.5)
        const lab = errK > 0.5 ? 'ABORT · Δv margin −0.4 km/s' : `${x.item.p1.n} → ${x.item.p2.n} · Δv ${x.item.dv.toFixed(2)} km/s · ${fmt(x.item.tof)} d`
        c.font = font(P, 10, s)
        c.fillStyle = rgba(errK > 0.5 ? P.err : P.lab, x.k)
        c.fillText(still ? lab : decode(lab, (now - x.t0) / 900, now / 1000), mx2 + 10, my2 - 4)
      }
    })
    const rate = f.sm('rate', f.dt > 0 && !Number.isNaN(lastYrs) ? (yrs - lastYrs) / f.dt : 0.025, 2)
    lastYrs = yrs
    const jd = Date.now() / 86400000 + 2440587.5 + yrs * 365.25
    footer(f, `JD ${jd.toFixed(3)} · 1 s ≈ ${(rate * 365.25).toFixed(1)} d · ecliptic J2000 · view i ${(tilt * 57.2958).toFixed(0)}°`)
  }
}
