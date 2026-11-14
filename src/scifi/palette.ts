/**
 * Sci-fi theme catalog: per-style shape, type pairing, and light/dark
 * palettes, plus the derivation from a palette to the `--dsw-*` alias tokens
 * the shell consumes and to the colors the animated scene paints with. The
 * scene background of every palette comes from {@link SCENE_BACKGROUNDS} so
 * Host boot CSS, tokens, and canvas agree on first paint.
 */
import { SCENE_BACKGROUNDS, type ThemeStyle } from '../styles.ts'

/** One concrete color scheme. */
export type ColorScheme = 'light' | 'dark'

/** Readable-ink palette of one style in one scheme. */
export interface InkPalette {
  /** Scene background (also the boot canvas color). */
  scene: string
  /** Opaque panel surface. */
  surface: string
  /** Primary text. */
  ink: string
  /** Secondary text. */
  ink2: string
  /** Tertiary text and captions. */
  ink3: string
  /** Brand accent for marks, fills, and focus. */
  accent: string
  /** Accent tuned for text-size contrast (links, labels). */
  link: string
  /** Success state. */
  ok: string
  /** Warning state. */
  warn: string
  /** Error state. */
  err: string
  /** Syntax keyword. */
  kw: string
  /** Syntax string. */
  str: string
  /** Syntax function. */
  fn: string
  /** Syntax comment. */
  cm: string
}

/** Scene parameters every painter reads. */
export interface SceneBase {
  /** Scene background. */
  scene: string
  /** Primary scene ink (strokes, labels). */
  ink: string
  /** Secondary scene ink. */
  ink2: string
  /** Tertiary scene ink. */
  ink3: string
  /** Accent marks. */
  accent: string
  /** Readout label color. */
  lab: string
  /** Fault color. */
  err: string
  /** Rulings and grids. */
  grid: string
  /** Vignette color. */
  vig: string
  /** Vignette strength. */
  vigA: number
  /** Film-grain strength. */
  grain: number
  /** Bloom strength (0 disables). */
  bloom: number
  /** Bloom composite mode. */
  bloomMode: GlobalCompositeOperation
  /** Monospace face the scene letters its readouts in. */
  mono: string
}

/** Style-specific scene parameters. */
export interface SceneExtras {
  /** Black hole: lensed graph paper, Luminet plate in light, glowing disk in dark. */
  blackhole: {
    /** Disk colour ramp from cool rim to hot core (dark) or ink densities (light). */
    ramp: readonly string[]
    /** Whether the disk adds light (dark) or deposits ink (light). */
    emissive: boolean
    /** Shadow fill. */
    shadow: string
    /** Photon-ring stroke. */
    ring: string
    /** Background stars. */
    star: string
  }
  /** Orrery: solar system over the Milky Way. */
  orrery: {
    /** Sun glow. */
    sun: string
    /** Milky Way band. */
    mw: string
    /** Milky Way band strength. */
    mwA: number
    /** Field stars. */
    star: string
    /** Planet dark limb. */
    body: string
    /** Planet lit limb. */
    lit: string
    /** Trojan asteroid tint. */
    trojan: string
  }
  /** Lattice: quasicrystal precession diffraction. */
  lattice: {
    /** Secondary spot family. */
    spot2: string
    /** Viewing-screen phosphor. */
    phosphor: string
  }
  /** Field: radiating Hertzian dipole. */
  field: {
    /** Positive-lobe colour. */
    pos: string
    /** Negative-lobe colour. */
    neg: string
    /** Lobe shading strength. */
    heat: number
  }
  /** Signal: L-band radio console. */
  signal: {
    /** Waterfall colour map, low to high. */
    cmap: readonly string[]
  }
}

/** Scene colors handed to the painter of style S. */
export type SceneColors<S extends ThemeStyle> = SceneBase & SceneExtras[S]

/** Corner shape, radii, and type pairing of one style. */
export interface ShapeSpec {
  /** `corner-shape` keyword or function. */
  corner: string
  /** Radius scale: sm, md, lg, xl, panel (px). */
  radii: readonly [number, number, number, number, number]
  /** UI font stack. */
  font: string
  /** Code font stack. */
  mono: string
}

/** Elevation treatment: hairline shadows or accent glow. */
export type ElevationStyle = 'hairline' | 'glow'

/** One style in one scheme. */
export interface ModeSpec<S extends ThemeStyle> {
  /** Elevation treatment. */
  elevation: ElevationStyle
  /** Readable-ink palette. */
  palette: InkPalette
  /** Scene parameters (the base fields come from the palette). */
  scene: Omit<SceneBase, 'scene' | 'ink' | 'ink2' | 'ink3' | 'accent' | 'lab' | 'err' | 'mono'> & SceneExtras[S]
}

/** One built-in sci-fi style. */
export interface StyleSpec<S extends ThemeStyle> {
  /** Style id. */
  id: S
  /** Shape and type. */
  shape: ShapeSpec
  /** Light-scheme palette and scene. */
  light: ModeSpec<S>
  /** Dark-scheme palette and scene. */
  dark: ModeSpec<S>
}

const CJK = "'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC'"
const SYS = `-apple-system, BlinkMacSystemFont, 'Segoe UI', ${CJK}, sans-serif`
const MONO_TAIL = "'SF Mono', 'JetBrains Mono', Consolas, monospace"

const ink = (scheme: ColorScheme, style: ThemeStyle, rest: Omit<InkPalette, 'scene'>): InkPalette =>
  ({ scene: SCENE_BACKGROUNDS[style][scheme], ...rest })

/** The five built-in styles. */
export const STYLE_SPECS: { readonly [S in ThemeStyle]: StyleSpec<S> } = {
  blackhole: {
    id: 'blackhole',
    shape: {
      corner: 'superellipse(1.4)', radii: [12, 16, 20, 24, 32],
      font: `'Space Grotesk', 'Segoe UI Variable Display', 'SF Pro Display', ${SYS}`,
      mono: `'IBM Plex Mono', 'Cascadia Mono', ${MONO_TAIL}`,
    },
    light: {
      elevation: 'hairline',
      palette: ink('light', 'blackhole', {
        surface: '#FFFFFF', ink: '#17130F', ink2: '#4A433B', ink3: '#62594F', accent: '#C2410C', link: '#9A3412',
        ok: '#1E7F55', warn: '#9A6A06', err: '#B91C1C', kw: '#9A3412', str: '#3F6212', fn: '#6D28D9', cm: '#857C72',
      }),
      scene: {
        grid: '#62594F', vig: '#B9AF9F', vigA: 0.2, grain: 0.035, bloom: 0, bloomMode: 'source-over',
        ramp: ['#E9E1D3', '#B9A48A', '#7A5A3C', '#3A2614', '#120B05'], emissive: false,
        shadow: '#F4F1EA', ring: '#7C2D12', star: '#17130F',
      },
    },
    dark: {
      elevation: 'glow',
      palette: ink('dark', 'blackhole', {
        surface: '#24203A', ink: '#F3EEE6', ink2: '#CBC2B6', ink3: '#A0978B', accent: '#FFA94D', link: '#FFBE76',
        ok: '#5ED3A0', warn: '#F2C063', err: '#FF7A6E', kw: '#FFBE76', str: '#9BD98A', fn: '#B9A3FF', cm: '#827B95',
      }),
      scene: {
        grid: '#9C93B8', vig: '#000000', vigA: 0.38, grain: 0.04, bloom: 0.7, bloomMode: 'screen',
        ramp: ['#3A0F0A', '#9A2C12', '#F06A22', '#FFC36B', '#FFF4DA'], emissive: true,
        shadow: '#050407', ring: '#FFE7C2', star: '#FFFFFF',
      },
    },
  },
  orrery: {
    id: 'orrery',
    shape: {
      corner: 'superellipse(1.8)', radii: [10, 14, 18, 22, 28],
      font: `'Geist', 'Segoe UI Variable Text', 'SF Pro Text', ${SYS}`,
      mono: `'Geist Mono', 'Cascadia Mono', ${MONO_TAIL}`,
    },
    light: {
      elevation: 'hairline',
      palette: ink('light', 'orrery', {
        surface: '#FFFFFF', ink: '#0F1F38', ink2: '#3D4C66', ink3: '#566479', accent: '#E0472B', link: '#B4321A',
        ok: '#1E8A5A', warn: '#B27A0A', err: '#C0254A', kw: '#B4321A', str: '#1E7A55', fn: '#2D5BC4', cm: '#8592A6',
      }),
      scene: {
        grid: '#3D5A86', vig: '#90A3C0', vigA: 0.2, grain: 0.03, bloom: 0.1, bloomMode: 'source-over',
        sun: '#E0A12B', mw: '#7F93B5', mwA: 0.12, star: '#1C2B47', body: '#16253F', lit: '#9AABC8', trojan: '#2D5BC4',
      },
    },
    dark: {
      elevation: 'hairline',
      palette: ink('dark', 'orrery', {
        surface: '#22324F', ink: '#EDF2FA', ink2: '#B6C2D6', ink3: '#8E9CB4', accent: '#FF7A5C', link: '#FF9478',
        ok: '#5CD6A0', warn: '#F2C063', err: '#FF6B88', kw: '#FF9478', str: '#7FD9B2', fn: '#8FB6FF', cm: '#7B89A3',
      }),
      scene: {
        grid: '#8FA6CC', vig: '#000000', vigA: 0.35, grain: 0.04, bloom: 0.55, bloomMode: 'screen',
        sun: '#FFC861', mw: '#7088C4', mwA: 0.2, star: '#E2E9FA', body: '#4A5C7E', lit: '#F4F7FF', trojan: '#8FB6FF',
      },
    },
  },
  lattice: {
    id: 'lattice',
    shape: {
      corner: 'bevel', radii: [5, 8, 11, 13, 16],
      font: `'Sora', 'Segoe UI Variable Display', 'Avenir Next', ${SYS}`,
      mono: `'Azeret Mono', 'Cascadia Code', ${MONO_TAIL}`,
    },
    light: {
      elevation: 'hairline',
      palette: ink('light', 'lattice', {
        surface: '#FFFFFF', ink: '#0F2320', ink2: '#3E5551', ink3: '#566C68', accent: '#0E8C86', link: '#0B6F6A',
        ok: '#2E8A45', warn: '#B57A12', err: '#BE2F3D', kw: '#0B6F6A', str: '#5A7A16', fn: '#6D4BC4', cm: '#879893',
      }),
      scene: {
        grid: '#4C7470', vig: '#8FB0AB', vigA: 0.18, grain: 0.03, bloom: 0.18, bloomMode: 'source-over',
        spot2: '#6D4BC4', phosphor: '#0E8C86',
      },
    },
    dark: {
      elevation: 'glow',
      palette: ink('dark', 'lattice', {
        surface: '#1F3B3C', ink: '#E8F5F3', ink2: '#AFC9C5', ink3: '#90ABA7', accent: '#4FD8CF', link: '#6FE0D8',
        ok: '#7AD68A', warn: '#EBC066', err: '#FF7C86', kw: '#6FE0D8', str: '#B8D97F', fn: '#B9A3FF', cm: '#6F8C88',
      }),
      scene: {
        grid: '#7FB3AD', vig: '#000000', vigA: 0.35, grain: 0.04, bloom: 0.7, bloomMode: 'screen',
        spot2: '#B9A3FF', phosphor: '#4FD8CF',
      },
    },
  },
  field: {
    id: 'field',
    shape: {
      corner: 'squircle', radii: [10, 16, 20, 24, 30],
      font: `'Red Hat Text', 'Segoe UI', 'Helvetica Neue', ${SYS}`,
      mono: `'Red Hat Mono', 'Cascadia Mono', ${MONO_TAIL}`,
    },
    light: {
      elevation: 'hairline',
      palette: ink('light', 'field', {
        surface: '#FFFFFF', ink: '#161A22', ink2: '#454B57', ink3: '#5D6471', accent: '#2563EB', link: '#1D4FC4',
        ok: '#16955F', warn: '#BA7A0C', err: '#D33A32', kw: '#1D4FC4', str: '#16805A', fn: '#B8338A', cm: '#8A909B',
      }),
      scene: {
        grid: '#5B6475', vig: '#A2AAB8', vigA: 0.14, grain: 0.025, bloom: 0, bloomMode: 'source-over',
        pos: '#E2483D', neg: '#2563EB', heat: 0.22,
      },
    },
    dark: {
      elevation: 'hairline',
      palette: ink('dark', 'field', {
        surface: '#283040', ink: '#EEF1F6', ink2: '#B8BFCC', ink3: '#9098A7', accent: '#7EA8FF', link: '#93B6FF',
        ok: '#5ED3A0', warn: '#F2C063', err: '#FF7A72', kw: '#93B6FF', str: '#7FDDB5', fn: '#FF9AD5', cm: '#7A8294',
      }),
      scene: {
        grid: '#9AA3B5', vig: '#000000', vigA: 0.35, grain: 0.035, bloom: 0.45, bloomMode: 'screen',
        pos: '#FF7A6B', neg: '#7EA8FF', heat: 0.28,
      },
    },
  },
  signal: {
    id: 'signal',
    shape: {
      corner: 'notch', radii: [4, 6, 8, 10, 12],
      font: `'Barlow', 'Bahnschrift', 'DIN Alternate', 'Roboto Condensed', ${SYS}`,
      mono: `'Share Tech Mono', 'Cascadia Mono', 'OCR A Extended', ${MONO_TAIL}`,
    },
    light: {
      elevation: 'hairline',
      palette: ink('light', 'signal', {
        surface: '#FFFFFF', ink: '#0F1A13', ink2: '#3D5044', ink3: '#56685B', accent: '#0F8A4C', link: '#0B7340',
        ok: '#1F8F70', warn: '#B27A0A', err: '#C9362C', kw: '#0B7340', str: '#6A7C12', fn: '#2F62B0', cm: '#879389',
      }),
      scene: {
        grid: '#4E6B57', vig: '#93AA98', vigA: 0.18, grain: 0.03, bloom: 0, bloomMode: 'source-over',
        cmap: ['#EFF4EF', '#C2E5CD', '#5FBE8A', '#13784A', '#062E1B'],
      },
    },
    dark: {
      elevation: 'glow',
      palette: ink('dark', 'signal', {
        surface: '#1D3429', ink: '#E8F7EE', ink2: '#ADC9B8', ink3: '#87A594', accent: '#3DF59A', link: '#6CF7B0',
        ok: '#4FD8C4', warn: '#F2C766', err: '#FF7466', kw: '#6CF7B0', str: '#C9E27A', fn: '#8CC0FF', cm: '#6D8A7A',
      }),
      scene: {
        grid: '#7FA894', vig: '#000000', vigA: 0.4, grain: 0.04, bloom: 0.6, bloomMode: 'screen',
        cmap: ['#12221B', '#103B2B', '#1C7A52', '#4FD08E', '#E2FFE9'],
      },
    },
  },
}

/**
 * Parse `#RRGGBB` into channels.
 * @param hex - six-digit hex color.
 * @returns red, green, blue in 0..255.
 */
export function rgbOf(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16)
  return [n >> 16, (n >> 8) & 255, n & 255]
}

/**
 * Clamp into a range.
 * @param v - value.
 * @param lo - lower bound.
 * @param hi - upper bound.
 * @returns v limited to lo..hi.
 */
export function clamp(v: number, lo = 0, hi = 1): number {
  return Math.max(lo, Math.min(hi, v))
}

/**
 * Read one slot of an array the caller has already bounded (lookup tables,
 * typed-array fields, fixed tuples); discharges noUncheckedIndexedAccess.
 * @param values - array, typed array, or string.
 * @param index - an index inside values.length.
 * @returns the stored value.
 */
export function at<T>(values: ArrayLike<T>, index: number): T {
  const value = values[index]
  /* v8 ignore next -- every caller reads an index inside a length it already bounded. */
  if (value === undefined) throw new RangeError(`scene read index ${index} outside length ${values.length}`)
  return value
}

/**
 * Hex color with alpha as a CSS `rgba()`.
 * @param hex - six-digit hex color.
 * @param a - alpha, clamped to 0..1.
 * @returns CSS color string.
 */
export function rgba(hex: string, a: number): string {
  return `rgba(${rgbOf(hex).join(', ')}, ${Math.round(clamp(a) * 1000) / 1000})`
}

/**
 * Linear mix of two hex colors.
 * @param a - start color.
 * @param b - end color.
 * @param f - fraction of b, clamped to 0..1.
 * @returns mixed `#RRGGBB`.
 */
export function mixHex(a: string, b: string, f: number): string {
  const p = rgbOf(a)
  const q = rgbOf(b)
  const g = clamp(f)
  return `#${p.map((v, i) => Math.round(v * (1 - g) + at(q, i) * g).toString(16).padStart(2, '0')).join('').toUpperCase()}`
}

/**
 * Colors the painter of one style reads in one scheme.
 * @param style - theme style.
 * @param scheme - active color scheme.
 * @returns scene colors (palette inks folded into the scene parameters).
 */
export function sceneColors<S extends ThemeStyle>(style: S, scheme: ColorScheme): SceneColors<S> {
  const spec: StyleSpec<S> = STYLE_SPECS[style]
  const mode = spec[scheme]
  const p = mode.palette
  const sc = mode.scene
  const base: SceneBase = {
    scene: p.scene, ink: p.ink, ink2: p.ink2, ink3: p.ink3, accent: p.accent, lab: p.link, err: p.err,
    grid: sc.grid, vig: sc.vig, vigA: sc.vigA, grain: sc.grain, bloom: sc.bloom, bloomMode: sc.bloomMode,
    mono: spec.shape.mono,
  }
  return { ...sc, ...base }
}

const tokenCache = new Map<string, Readonly<Record<string, string>>>()

/**
 * Alias-token layer of one style in one scheme: surfaces, inks, states,
 * syntax, elevation, corner shape, radii, and type. Shell backdrops go
 * transparent so the scene shows; menus and popovers stay opaque.
 * @param style - theme style.
 * @param scheme - active color scheme.
 * @returns frozen token dictionary (cached per style and scheme).
 */
export function themeTokens(style: ThemeStyle, scheme: ColorScheme): Readonly<Record<string, string>> {
  const key = `${style}:${scheme}`
  const cached = tokenCache.get(key)
  if (cached !== undefined) return cached
  const spec = STYLE_SPECS[style]
  const mode = spec[scheme]
  const p = mode.palette
  const dark = scheme === 'dark'
  const base = dark ? mixHex(p.scene, p.surface, 0.4) : p.surface
  const veil = dark ? 0.62 : 0.66
  const shade = dark ? '#000000' : p.ink
  const elevation = mode.elevation === 'glow'
    ? {
      '--dsw-elevation-stroke-color': rgba(p.accent, 0.45),
      '--dsw-elevation-panel': `0 0 0 1px ${rgba(p.accent, 0.28)}, 0 0 18px -8px ${rgba(p.accent, 0.5)}`,
      '--dsw-elevation-prominent': `0 0 0 1px ${rgba(p.accent, 0.55)}, 0 0 28px -6px ${rgba(p.accent, 0.5)}`,
    }
    : {
      '--dsw-elevation-stroke-color': rgba(p.ink, 0.22),
      '--dsw-elevation-panel': `0 0 0 1px ${rgba(p.ink, dark ? 0.16 : 0.11)}, 0 6px 18px -12px ${rgba(shade, dark ? 0.6 : 0.25)}`,
      '--dsw-elevation-prominent': `0 0 0 1px ${rgba(p.accent, 0.5)}, 0 12px 32px -16px ${rgba(shade, dark ? 0.7 : 0.4)}`,
    }
  const [sm, md, lg, xl, panel] = spec.shape.radii
  const tokens: Record<string, string> = {
    '--dsh-scene-bg': p.scene,
    '--dsw-specific-shell-fill': 'transparent',
    '--dsw-specific-reading-fill': `linear-gradient(90deg, ${rgba(p.scene, 0)} 0%, ${rgba(p.scene, veil)} 16%, ${rgba(p.scene, veil)} 84%, ${rgba(p.scene, 0)} 100%)`,
    '--dsw-specific-reading-mask': rgba(p.scene, dark ? 0.84 : 0.86),
    '--dsw-alias-bg-base': base,
    '--dsw-alias-bg-layer-1': rgba(p.surface, dark ? 0.86 : 0.9),
    '--dsw-alias-bg-layer-2': mixHex(base, p.ink, dark ? 0.06 : 0.035),
    '--dsw-alias-bg-overlay': base,
    '--dsw-menu-surface-fill': base,
    '--dsw-specific-menu': base,
    '--dsw-specific-sidebar-fill': rgba(p.surface, dark ? 0.74 : 0.78),
    '--dsw-specific-sidebar-nav-item-active': rgba(p.accent, dark ? 0.2 : 0.12),
    '--dsw-specific-sidebar-nav-item-active-accent': p.accent,
    '--dsw-specific-sidebar-nav-item-hover': rgba(p.ink, dark ? 0.07 : 0.05),
    '--dsw-specific-bubble': rgba(mixHex(p.surface, p.accent, dark ? 0.26 : 0.1), dark ? 0.9 : 0.94),
    '--dsw-specific-input-major': rgba(p.surface, dark ? 0.9 : 0.94),
    '--dsw-alias-markdown-code-block': dark ? rgba(mixHex(p.scene, '#000000', 0.18), 0.88) : rgba(mixHex(p.surface, p.scene, 0.55), 0.94),
    '--dsw-alias-markdown-inline-code': rgba(p.accent, dark ? 0.15 : 0.09),
    '--dsw-alias-border-l1': rgba(p.ink, dark ? 0.1 : 0.08),
    '--dsw-alias-border-l2': rgba(p.ink, dark ? 0.16 : 0.14),
    '--dsw-alias-border-l3': rgba(p.ink, dark ? 0.12 : 0.1),
    '--dsw-alias-border-l4': rgba(p.ink, dark ? 0.2 : 0.18),
    '--dsw-alias-label-primary': p.ink,
    '--dsw-alias-label-secondary': p.ink2,
    '--dsw-alias-label-tertiary': p.ink3,
    '--dsw-alias-label-caption': p.ink3,
    '--dsw-alias-label-primary-foreground': dark ? p.scene : '#FFFFFF',
    '--dsw-alias-brand-primary': dark ? p.accent : p.link,
    '--dsw-alias-state-business-primary': p.accent,
    '--dsw-alias-link': p.link,
    '--dsw-alias-button-primary-fill': dark ? p.accent : p.ink,
    '--dsw-alias-button-primary-hover': dark ? mixHex(p.accent, '#FFFFFF', 0.14) : mixHex(p.ink, p.accent, 0.3),
    '--dsw-alias-label-deep-diving': p.link,
    '--dsw-alias-label-deep-diving-shimmer': mixHex(p.accent, '#FFFFFF', dark ? 0.6 : 0.55),
    '--dsw-alias-state-success-primary': p.ok,
    '--dsw-alias-state-warn-primary': p.warn,
    '--dsw-alias-state-error-primary': p.err,
    '--dsw-alias-interactive-bg-hover': rgba(p.ink, dark ? 0.07 : 0.05),
    '--dsw-alias-interactive-bg-active': rgba(p.ink, dark ? 0.1 : 0.08),
    '--dsw-alias-bg-module-platform': rgba(p.accent, dark ? 0.14 : 0.08),
    ...elevation,
    '--shiki-token-keyword': p.kw,
    '--shiki-token-string': p.str,
    '--shiki-token-string-expression': p.str,
    '--shiki-token-function': p.fn,
    '--shiki-token-comment': p.cm,
    '--shiki-token-constant': p.link,
    '--shiki-token-parameter': p.ink2,
    '--shiki-token-punctuation': p.ink3,
    '--shiki-token-link': p.link,
    '--dsw-corner-shape': spec.shape.corner,
    '--dsw-radius-sm': `${sm}px`,
    '--dsw-radius-md': `${md}px`,
    '--dsw-radius-lg': `${lg}px`,
    '--dsw-radius-xl': `${xl}px`,
    '--dsw-radius-panel': `${panel}px`,
    '--dsw-font-family': spec.shape.font,
    '--ds-font-family-code': spec.shape.mono,
  }
  const frozen = Object.freeze(tokens)
  tokenCache.set(key, frozen)
  return frozen
}
