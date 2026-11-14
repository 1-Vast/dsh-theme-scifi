/**
 * SIGNAL — an L-band radio console listening at 1250–1550 MHz.
 *
 * A waterfall scrolls past the 21 cm hydrogen line (1420.406 MHz) with a
 * phosphor spectrum trace above it and a stacked-pulse plot of PSR B1919+21
 * (P = 1.3373 s) beside it. Each tool call injects a fast radio burst with
 * the real cold-plasma delay Δt = 4.149 ms · DM · ν_GHz⁻², so it sweeps the
 * band from high to low frequency. Alongside, a dedispersion search prints
 * its detection statistic in the Big Ear intensity code (blank, 1–9, then
 * A–Z for S/N ≥ 10, as on the 1977 "Wow!" printout), one character per
 * integration, newest on top. A failed call floods the band with RFI.
 */
import { at, clamp, mixHex, rgbOf, rgba } from '../palette.ts'
import {
  age, backdrop, decode, EventTrack, fmt, font, footer, graphPaper, offscreen, seeded,
  type SceneFrame, type ScenePainter,
} from '../paint.ts'

const FB = [1250, 1550] as const
const HI_F = (1420.406 - FB[0]) / (FB[1] - FB[0])
const ROW_S = 0.0041
const FRB_DM = [312.4, 557.1, 189.9, 941.3]
const CODE_ROWS = 14
const BIG_EAR = ' 123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Dispersion delay relative to the top of the band, in waterfall rows.
 * @param dm - dispersion measure (pc cm⁻³).
 * @param fMHz - observing frequency.
 * @returns delay in rows of {@link ROW_S} seconds.
 */
export function dmDelayRows(dm: number, fMHz: number): number {
  return 4.149e-3 * dm * ((fMHz / 1000) ** -2 - (FB[1] / 1000) ** -2) / ROW_S
}

/**
 * Big Ear intensity code for a signal-to-noise ratio.
 * @param snr - detection statistic in σ.
 * @returns one character: blank below 1, digits to 9, letters from 10 (Z caps at 35).
 */
export function bigEarCode(snr: number): string {
  return at(BIG_EAR, clamp(Math.floor(snr), 0, BIG_EAR.length - 1))
}

function pulseProfile(n: number, r: () => number): Float32Array {
  const p = new Float32Array(72)
  const drift = ((n * 0.09) % 0.5) - 0.25
  for (let i = 0; i < 72; i++) {
    const x = i / 71 - 0.5
    let v = r() * 0.05
    v += 0.9 * Math.exp(-(((x - drift * 0.35) / 0.035) ** 2)) * (0.55 + 0.45 * r())
    v += 0.5 * Math.exp(-(((x - drift * 0.35 - 0.09) / 0.025) ** 2)) * r()
    v += 0.25 * Math.exp(-(((x + 0.11) / 0.03) ** 2)) * r()
    p[i] = v
  }
  return p
}

interface Burst {
  row0: number
  dm: number
  amp: number
  del: Float32Array
  sc: Float32Array
  peak: number
}

/**
 * Create the SIGNAL painter.
 * @returns a stateful painter.
 */
export function createSignalScene(): ScenePainter<'signal'> {
  const bursts = new EventTrack<Burst>(3)
  let wf: ReturnType<typeof offscreen>
  let ww = 0
  let wh = 0
  let rowCount = 0
  let row = new Float32Array(0)
  let trace = new Float32Array(0)
  let trail: Float32Array[] = []
  const pulses: Float32Array[] = []
  let pk = -1
  let pn = 0
  const codes: { ch: string; snr: number }[] = []
  let codeAcc = 0
  let codeRows = 0
  return (f: SceneFrame<'signal'>): void => {
    const { c, w, h, P, s, A, now, still } = f
    backdrop(c, w, h, P, w * 0.62, h * 0.45, w * 0.6, P.accent, 0.05)
    graphPaper(c, w, h, P.grid, Math.max(8, 20 * s), 0.03, 0.06)
    const E = A.energy
    const errA = age(A.errT, now)
    const errK = f.sm('err', errA < 1.8 ? 1 : 0, 4)
    const ms = Math.max(s, 0.55)
    const x0 = Math.round(w * 0.42)
    const x1 = Math.round(w * 0.8)
    const ty0 = h * 0.08
    const ty1 = h * 0.24
    const wy0 = Math.round(h * 0.28)
    const wy1 = Math.round(h * 0.86)
    const rw = Math.max(8, x1 - x0)
    const rh = Math.max(8, wy1 - wy0)
    const cm = P.cmap.map(rgbOf)
    const nst = cm.length - 1
    const cmap = (v: number, o: number, d: Uint8ClampedArray): void => {
      const u = clamp(v) * nst
      const i = Math.min(nst - 1, Math.floor(u))
      const fr = u - i
      const a = at(cm, i)
      const b = at(cm, i + 1)
      d[o] = a[0] + (b[0] - a[0]) * fr
      d[o + 1] = a[1] + (b[1] - a[1]) * fr
      d[o + 2] = a[2] + (b[2] - a[2]) * fr
      d[o + 3] = 255
    }
    const fMHz = (x: number): number => FB[0] + x / rw * (FB[1] - FB[0])
    const mkBurst = (row0: number, dm: number, amp: number, seed: number): Burst => {
      const del = new Float32Array(rw)
      const sc = new Float32Array(rw)
      for (let x = 0; x < rw; x++) {
        del[x] = dmDelayRows(dm, fMHz(x))
        sc[x] = 0.45 + 0.55 * Math.sin(x * 0.07 + seed) ** 2
      }
      return { row0, dm, amp, del, sc, peak: 18 + amp * 12 }
    }
    const rowGen = (R: number, rnd: () => number, e: number, rfi: boolean, list: readonly Burst[], out: Float32Array): Float32Array => {
      const fc = 0.21 + 0.05 * Math.sin(A.ph * 0.04)
      for (let x = 0; x < rw; x++) {
        const fx = x / rw
        const bp = 1 - 0.4 * (2 * fx - 1) ** 6
        let v = (0.07 + rnd() * 0.2) * bp
        v += 0.3 * Math.exp(-(((fx - HI_F) * rw / 2.2) ** 2))
        if (e > 0.05) v += e * 0.8 * Math.exp(-(((fx - fc) * rw / 1.6) ** 2))
        for (const fb of list) {
          const dd = R - fb.row0 - at(fb.del, x)
          if (dd > -5 && dd < 8) v += fb.amp * at(fb.sc, x) * Math.exp(-((dd / 1.5) ** 2))
        }
        if (rfi) v += 0.45 + rnd() * 0.35
        out[x] = v
      }
      return out
    }
    if (ww !== rw || wh !== rh) {
      ww = rw
      wh = rh
      wf = offscreen(rw, rh)
      rowCount = 0
      row = new Float32Array(rw)
      trace = new Float32Array(rw)
      trail = []
      const r = seeded(13)
      const demo = [mkBurst(-Math.round(rh * 0.82), 557.1, 0.9, 1.3)]
      const img = wf?.ctx.createImageData(rw, rh)
      for (let y = 0; y < rh; y++) {
        rowGen(-y, r, 0.25 * (0.5 + 0.5 * Math.sin(y * 0.03)), false, demo, row)
        if (img !== undefined) for (let x = 0; x < rw; x++) cmap(at(row, x), (y * rw + x) * 4, img.data)
      }
      if (img !== undefined) wf?.ctx.putImageData(img, 0, 0)
      trace.set(row)
    }
    const items = bursts.update(A, now, f.dt, still, i => mkBurst(still ? -1e6 : rowCount + 3, at(FRB_DM, i % FRB_DM.length), 1.1, i * 2.7))
    const list = items.map(it => it.item)
    if (!still) {
      const n = 1 + Math.round(E * 2)
      wf?.ctx.drawImage(wf.canvas, 0, n)
      const img = wf?.ctx.createImageData(rw, n)
      for (let y = 0; y < n; y++) {
        const R = rowCount + n - y
        rowGen(R, Math.random, E, errA < 1, list, row)
        if (img !== undefined) for (let x = 0; x < rw; x++) cmap(at(row, x), (y * rw + x) * 4, img.data)
        // Dedispersion search: each burst peaks once its sweep has fully arrived.
        let snr = Math.random() * 1.9 + (errA < 1 ? 6 + Math.random() * 3 : 0)
        for (const fb of list) {
          const dd = R - fb.row0 - at(fb.del, 0)
          snr += fb.peak * Math.exp(-((dd / 9) ** 2))
        }
        codeAcc += snr
        codeRows += 1
        if (codeRows >= CODE_ROWS) {
          const mean = codeAcc / CODE_ROWS
          codes.unshift({ ch: bigEarCode(mean), snr: mean })
          if (codes.length > 48) codes.pop()
          codeAcc = 0
          codeRows = 0
        }
      }
      if (img !== undefined) wf?.ctx.putImageData(img, 0, 0)
      rowCount += n
      for (let x = 0; x < rw; x++) trace[x] = at(trace, x) + (at(row, x) - at(trace, x)) * 0.35
      trail.unshift(Float32Array.from(trace))
      if (trail.length > 5) trail.pop()
    }
    if (wf !== undefined) {
      c.globalAlpha = 0.95
      c.drawImage(wf.canvas, x0, wy0)
      c.globalAlpha = 1
    }
    c.strokeStyle = rgba(P.ink, 0.5)
    c.lineWidth = 1
    c.strokeRect(x0 + 0.5, wy0 + 0.5, rw, rh)
    // Spectrum trace with persistence.
    const smooth = (v: Float32Array, x: number): number => {
      let a = 0
      for (let j = -2; j <= 2; j++) a += at(v, Math.max(0, Math.min(rw - 1, x + j)))
      return a / 5
    }
    const traceCol = mixHex(P.accent, P.err, errK)
    const TY = (v: number): number => ty1 - clamp(v * 0.9) * (ty1 - ty0)
    const traces = trail.length ? trail : [trace]
    traces.slice(1).forEach((v, ti) => {
      c.strokeStyle = rgba(traceCol, 0.2 / (ti + 1))
      c.beginPath()
      for (let x = 0; x < rw; x += 2) {
        const y = TY(smooth(v, x))
        if (x) c.lineTo(x0 + x, y)
        else c.moveTo(x0 + x, y)
      }
      c.stroke()
    })
    const fg = c.createLinearGradient(0, ty0, 0, ty1)
    fg.addColorStop(0, rgba(traceCol, 0.22))
    fg.addColorStop(1, rgba(traceCol, 0))
    c.beginPath()
    for (let x = 0; x < rw; x += 2) {
      const y = TY(smooth(at(traces, 0), x))
      if (x) c.lineTo(x0 + x, y)
      else c.moveTo(x0 + x, y)
    }
    c.strokeStyle = rgba(traceCol, 0.95)
    c.lineWidth = 1.3
    c.stroke()
    c.lineTo(x0 + rw, ty1)
    c.lineTo(x0, ty1)
    c.closePath()
    c.fillStyle = fg
    c.fill()
    c.lineWidth = 1
    c.strokeStyle = rgba(P.ink, 0.45)
    c.beginPath()
    c.moveTo(x0, ty1 + 0.5)
    c.lineTo(x1, ty1 + 0.5)
    c.stroke()
    // H I marker and axis.
    c.setLineDash([3, 3])
    c.beginPath()
    c.moveTo(x0 + HI_F * rw, ty0)
    c.lineTo(x0 + HI_F * rw, wy1)
    c.stroke()
    c.setLineDash([])
    const labels = w > 420
    if (labels) {
      c.font = font(P, 9.5, s)
      c.fillStyle = rgba(P.ink, 0.85)
      c.fillText('H I 1420.406 MHz', x0 + HI_F * rw + 5, ty0 + 10)
      c.fillStyle = rgba(P.ink3, 0.95)
      c.textAlign = 'center'
      for (const q of [0, 0.25, 0.5, 0.75, 1]) c.fillText(String(Math.round(FB[0] + q * 300)), x0 + q * rw, wy1 + 14)
      c.textAlign = 'right'
      c.fillText('ν / MHz', x1, wy1 + 28)
      c.textAlign = 'left'
    }
    // Burst tracks.
    items.forEach((it, n) => {
      const fb = it.item
      let top: [number, number] | undefined
      c.setLineDash([2, 3])
      c.strokeStyle = rgba(P.ink, 0.6 * it.k)
      c.beginPath()
      let on = false
      for (let x = 0; x < rw; x += 4) {
        const y = wy0 + rowCount - (fb.row0 + at(fb.del, x)) - 6
        if (y < wy0 || y > wy1) {
          on = false
          continue
        }
        if (top === undefined || y < top[1]) top = [x0 + x, y]
        if (on) c.lineTo(x0 + x, y)
        else c.moveTo(x0 + x, y)
        on = true
      }
      c.stroke()
      c.setLineDash([])
      if (top !== undefined && labels) {
        const lab = `FRB · DM ${fb.dm} pc cm⁻³ · Δt ${(4.149 * fb.dm * ((FB[0] / 1000) ** -2 - (FB[1] / 1000) ** -2)).toFixed(0)} ms`
        c.font = font(P, 10, s)
        c.fillStyle = rgba(P.lab, it.k)
        const shown = n === items.length - 1 ? decode(lab, (now - it.t0) / 900, now / 1000) : lab
        c.fillText(shown, top[0] + 6, Math.max(wy0 + 12, top[1] - 6))
      }
    })
    if (errK > 0.01 && labels) {
      c.font = font(P, 11, s)
      c.fillStyle = rgba(P.err, errK)
      c.fillText('RFI · BROADBAND BURST', x0 + rw * 0.55, ty0 - 4)
    }
    // Big Ear printout of the dedispersion statistic, newest on top.
    if (labels) {
      const px = x0 - 34 * ms
      const lh = Math.max(9, rh / 40)
      c.font = font(P, 11, s)
      c.textAlign = 'center'
      codes.forEach((cd, i) => {
        const y = wy0 + 10 + i * lh
        if (y > wy1) return
        c.fillStyle = cd.snr >= 10 ? rgba(P.lab, 0.95) : rgba(P.ink2, 0.75)
        c.fillText(cd.ch === ' ' ? '·' : cd.ch, px, y)
      })
      c.textAlign = 'left'
      c.font = font(P, 9, s)
      c.fillStyle = rgba(P.ink3, 0.95)
      c.fillText('S/N', px - 9, wy0 - 4)
    }
    // Stacked pulses of PSR B1919+21.
    const ix0 = w * 0.83
    const ix1 = w * 0.97
    const iy0 = h * 0.12
    const iy1 = h * 0.62
    const pkNow = A.ph / 0.75
    const pki = Math.floor(pkNow)
    const frac = still ? 0 : pkNow - pki
    if (pulses.length === 0) {
      const r = seeded(3)
      for (let j = 0; j < 18; j++) pulses.push(pulseProfile(j, r))
      pk = pki
      pn = 18
    }
    if (!still && pki !== pk) {
      pk = pki
      pulses.push(pulseProfile(pn++, Math.random))
      pulses.shift()
    }
    const NL = pulses.length
    const spc = (iy1 - iy0) / (NL + 1)
    const amp = spc * 3.4
    const iw = ix1 - ix0
    pulses.forEach((pr, j) => {
      const base = iy0 + (j + 1 - frac) * spc + amp * 0.3
      const a = j === 0 ? 1 - frac : 1
      const profile = (): void => {
        c.beginPath()
        for (let i = 0; i < pr.length; i++) {
          const x = ix0 + i / (pr.length - 1) * iw
          const y = base - at(pr, i) * amp
          if (i) c.lineTo(x, y)
          else c.moveTo(x, y)
        }
      }
      // Occlude the profiles behind, then stroke this one.
      profile()
      c.lineTo(ix1, base + 2)
      c.lineTo(ix0, base + 2)
      c.closePath()
      c.fillStyle = P.scene
      c.fill()
      profile()
      c.strokeStyle = rgba(j === NL - 1 ? P.accent : P.ink, (j === NL - 1 ? 0.95 : 0.7) * a)
      c.lineWidth = 1.1
      c.stroke()
    })
    c.lineWidth = 1
    if (labels) {
      c.font = font(P, 9.5, s)
      c.fillStyle = rgba(P.ink, 0.85)
      c.fillText('PSR B1919+21 · P 1.3373 s', ix0, iy0 - 6)
    }
    footer(f, `Tsys 21 K · Δν 300 MHz · ${1 + Math.round(E * 2)} row/frame · row ${fmt(rowCount)} · Big Ear code per ${CODE_ROWS} rows`)
  }
}
