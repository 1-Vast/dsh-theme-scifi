/**
 * Browser half of dsh-theme-scifi.
 *
 * One plugin run owns four things, all released on dispose:
 *   1. settings: the Host entry's ConfigForm (`configForms.get('theme-scifi')`,
 *      persisted in the profile patch) with a localStorage mirror for first
 *      paint only — Desktop binds a new origin per launch, so the mirror can
 *      be empty and is never the authority;
 *   2. the style's alias-token layer through `theme.overrideTokens`, swapped
 *      inside a view transition so a style switch cross-fades;
 *   3. the scene canvas behind the shell (SceneHost) plus one stylesheet that
 *      clears the shell's opaque backdrops while `html[data-dsh-scifi]` is set;
 *   4. the 科幻主题设置 / Sci-fi theme settings section.
 */
import { paintPreview, SceneHost } from '../scifi/scene-host.ts'
import { themeTokens, type ColorScheme } from '../scifi/palette.ts'
import {
  DEFAULT_MOTION, DEFAULT_STYLE, isSceneMotion, isThemeStyle, THEME_STYLES, type ThemeStyle,
} from '../styles.ts'
import { EN, ZH, type CopyKey } from './locales.ts'
import { createSection, type Prefs, type SectionState } from './section.tsx'
import { SHEET } from './sheet.ts'

/** Package name; also the token-override source and the stylesheet marker. */
export const name = 'dsh-theme-scifi'

/** The theme service is required; slots, locale, and configForms are read when present. */
export const inject = ['theme']

/** Host entry id in the profile patch; the ConfigForm namespace. */
const ENTRY = 'theme-scifi'
/** Locale namespace of the settings copy. */
const NS = 'settings.theme-scifi'
/** First-paint mirror of the saved settings. */
const CACHE_KEY = 'dsh-theme-scifi.prefs'
/** Attribute that turns the shell stylesheet on. */
const ATTR = 'data-dsh-scifi'

const DEFAULTS: Prefs = Object.freeze({ enabled: true, style: DEFAULT_STYLE, motion: DEFAULT_MOTION })

type TokenPairs = Record<string, { light: string; dark: string }>

const pairCache = new Map<ThemeStyle, TokenPairs>()

/**
 * The style's token layer in the `{ light, dark }` shape `overrideTokens` takes.
 * @param style - style id.
 * @returns token pairs (cached).
 */
function tokenPairs(style: ThemeStyle): TokenPairs {
  const cached = pairCache.get(style)
  if (cached !== undefined) return cached
  const light = themeTokens(style, 'light')
  const dark = themeTokens(style, 'dark')
  const pairs: TokenPairs = {}
  for (const key of Object.keys(light)) pairs[key] = { light: light[key] ?? '', dark: dark[key] ?? '' }
  pairCache.set(style, pairs)
  return pairs
}

/**
 * Fold stored values over a base, keeping only valid fields.
 * @param raw - stored section or cache payload.
 * @param base - values to keep where raw is missing or invalid.
 * @returns settings.
 */
function normalize(raw: unknown, base: Prefs): Prefs {
  if (typeof raw !== 'object' || raw === null) return base
  const r = raw as Record<string, unknown>
  return {
    enabled: typeof r.enabled === 'boolean' ? r.enabled : base.enabled,
    style: isThemeStyle(r.style) ? r.style : base.style,
    motion: isSceneMotion(r.motion) ? r.motion : base.motion,
  }
}

function readCache(): Prefs {
  try {
    const text = globalThis.localStorage?.getItem(CACHE_KEY)
    return text ? normalize(JSON.parse(text), DEFAULTS) : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

function writeCache(prefs: Prefs): void {
  try {
    globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(prefs))
  } catch { /* storage blocked: the Host copy still holds the settings */ }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* Minimal shapes of the services this plugin reads; the plugin imports no
   Harness client package, so these mirror only the members it calls. */
interface ThemeSnapshotLike { active: { colorScheme: ColorScheme } }
interface ThemeLike {
  getTheme: () => ThemeSnapshotLike
  overrideTokens: (source: string, tokens: TokenPairs) => () => void
}
interface FormSnapshotLike { status: 'loading' | 'ready' | 'unavailable'; value: unknown; writable: boolean }
interface FormLike {
  getSnapshot: () => FormSnapshotLike
  subscribe: (listener: () => void) => () => void
  set: (field: string, value: unknown) => Promise<boolean>
}
interface LocaleLike {
  register: (ns: string, dicts: Record<string, Readonly<Record<string, string>>>) => () => void
  bind: (ns: string) => (key: string) => string
}
interface SlotsLike {
  inject: (key: string, callback: () => () => void) => () => void
  register: (options: Record<string, unknown>, component: unknown) => () => void
}
interface ContextLike {
  get: (name: string) => unknown
  effect: (setup: () => () => void, label?: string) => void
  on: (event: string, listener: (...args: never[]) => void) => () => void
}

function has<K extends string>(value: unknown, ...keys: K[]): value is Record<K, unknown> {
  return typeof value === 'object' && value !== null && keys.every(k => typeof (value as Record<string, unknown>)[k] === 'function')
}

/**
 * Plugin entry.
 * @param ctx - the plugin's client context.
 */
export function apply(ctx: ContextLike): void {
  const theme = ctx.get('theme')
  if (!has(theme, 'getTheme', 'overrideTokens')) return
  const themeService = theme as unknown as ThemeLike
  const doc = document

  // ---- Settings: Host form first, local mirror for the first paint.
  const forms = ctx.get('configForms')
  const form: FormLike | undefined = has(forms, 'get') ? (forms as unknown as { get: (id: string) => FormLike }).get(ENTRY) : undefined
  let prefs = readCache()
  let durable = form !== undefined
  const adopt = (): void => {
    if (form === undefined) return
    const snap = form.getSnapshot()
    if (snap.status === 'ready') {
      prefs = normalize(snap.value, prefs)
      durable = snap.writable
      writeCache(prefs)
    } else if (snap.status === 'unavailable') {
      durable = false
    }
  }
  adopt()

  // ---- Page state for the settings section.
  const scheme = (): ColorScheme => themeService.getTheme().active.colorScheme
  let state: SectionState = { prefs, scheme: scheme(), durable }
  const listeners = new Set<() => void>()
  const publish = (): void => {
    const next = { prefs, scheme: scheme(), durable }
    if (next.prefs === state.prefs && next.scheme === state.scheme && next.durable === state.durable) return
    state = next
    for (const listener of listeners) listener()
  }

  // ---- Visuals.
  let sheet: HTMLStyleElement | undefined
  let host: SceneHost | undefined
  let dropTokens: (() => void) | undefined
  let tokenStyle: ThemeStyle | undefined

  const setTokens = (style: ThemeStyle): void => {
    dropTokens = themeService.overrideTokens(name, tokenPairs(style))
    tokenStyle = style
  }

  const reconcile = (): void => {
    if (!prefs.enabled) {
      dropTokens?.()
      dropTokens = undefined
      tokenStyle = undefined
      doc.documentElement.removeAttribute(ATTR)
      host?.dispose()
      host = undefined
      return
    }
    const style = prefs.style
    if (tokenStyle !== style) {
      const first = tokenStyle === undefined
      const swap = (): void => {
        setTokens(style)
        doc.documentElement.setAttribute(ATTR, style)
      }
      const vt = (doc as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition
      if (!first && typeof vt === 'function' && !prefersReducedMotion()) vt.call(doc, swap)
      else swap()
    }
    host ??= new SceneHost(doc)
    host.update({ style, scheme: scheme(), motion: prefs.motion })
  }

  ctx.effect(() => {
    sheet = doc.createElement('style')
    sheet.setAttribute('data-plugin', name)
    sheet.textContent = SHEET
    doc.head.appendChild(sheet)
    reconcile()
    return () => {
      dropTokens?.()
      dropTokens = undefined
      tokenStyle = undefined
      host?.dispose()
      host = undefined
      doc.documentElement.removeAttribute(ATTR)
      sheet?.remove()
      sheet = undefined
    }
  }, 'dsh-theme-scifi: theme layer and scene')

  if (form !== undefined) {
    ctx.effect(() => form.subscribe(() => {
      adopt()
      reconcile()
      publish()
    }), 'dsh-theme-scifi: settings')
  }

  ctx.effect(() => ctx.on('theme/change', () => {
    if (host !== undefined && prefs.enabled) host.update({ style: prefs.style, scheme: scheme(), motion: prefs.motion })
    publish()
  }), 'dsh-theme-scifi: color scheme')

  const set = <K extends keyof Prefs>(key: K, value: Prefs[K]): void => {
    if (prefs[key] === value) return
    prefs = { ...prefs, [key]: value }
    writeCache(prefs)
    reconcile()
    publish()
    if (form !== undefined && form.getSnapshot().status !== 'unavailable') {
      form.set(key, value).catch(() => { /* the form reloads Host state on refusal */ })
    }
  }

  // ---- Settings section.
  const locale = ctx.get('locale')
  let t = (key: CopyKey): string => ZH[key]
  let localeReady = false
  if (has(locale, 'register', 'bind')) {
    const service = locale as unknown as LocaleLike
    ctx.effect(() => service.register(NS, { zh: ZH, en: EN }), 'dsh-theme-scifi: locale')
    const bound = service.bind(NS)
    t = (key: CopyKey) => bound(key)
    localeReady = true
  }
  const slots = ctx.get('slots')
  if (has(slots, 'inject', 'register')) {
    const registry = slots as unknown as SlotsLike
    const Section = createSection({
      getState: () => state,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      set,
      t: key => t(key),
      paint: paintPreview,
    })
    registry.inject('settings.section', () => registry.register({
      name: 'settings.section',
      id: ENTRY,
      order: 35,
      label: () => t('nav'),
      ...localeReady ? { locale: NS } : {},
    }, Section))
  }
}

/** Every style id, for tests and tooling. */
export const styles = THEME_STYLES
