/**
 * The 科幻主题设置 / Sci-fi theme settings page: an on/off switch, the scene
 * motion switch, and one card per style with a still preview of its scene in
 * the active color scheme. The page reads a small external store owned by the
 * plugin run, so it follows saved settings and color-scheme changes without
 * re-registration.
 */
import * as React from 'react'
import type { ColorScheme } from '../scifi/palette.ts'
import { SCENE_MOTIONS, THEME_STYLES, type SceneMotion, type ThemeStyle } from '../styles.ts'
import type { CopyKey } from './locales.ts'

/** Settings the page edits. */
export interface Prefs {
  /** Whether the sci-fi theme is on. */
  enabled: boolean
  /** Selected style. */
  style: ThemeStyle
  /** Scene motion. */
  motion: SceneMotion
}

/** What the page renders from. */
export interface SectionState {
  /** Current settings. */
  prefs: Prefs
  /** Resolved color scheme of the app. */
  scheme: ColorScheme
  /** False when settings cannot be written to the profile. */
  durable: boolean
}

/** The plugin run's face for the page. */
export interface SectionFace {
  /** Current state (stable reference until the next change). */
  getState: () => SectionState
  /** Observe state replacements; returns the disposer. */
  subscribe: (listener: () => void) => () => void
  /** Write one setting. */
  set: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void
  /** Translate a copy key. */
  t: (key: CopyKey) => string
  /** Paint a still preview of a style into a canvas. */
  paint: (canvas: HTMLCanvasElement, style: ThemeStyle, scheme: ColorScheme) => void
}

const MOTION_KEYS: Readonly<Record<SceneMotion, CopyKey>> = { live: 'motion.live', still: 'motion.still' }

function Preview({ style, scheme, paint }: { style: ThemeStyle; scheme: ColorScheme; paint: SectionFace['paint'] }) {
  const ref = React.useCallback((canvas: HTMLCanvasElement | null) => {
    if (canvas !== null) paint(canvas, style, scheme)
  }, [paint, style, scheme])
  return <canvas ref={ref} aria-hidden="true" />
}

/**
 * Build the page component bound to one plugin run.
 * @param face - the run's store, writer, translator, and preview painter.
 * @returns the slot component.
 */
export function createSection(face: SectionFace): () => React.ReactElement {
  return function SciFiThemeSection() {
    const { prefs, scheme, durable } = React.useSyncExternalStore(face.subscribe, face.getState)
    const { t } = face
    return (
      <div className={prefs.enabled ? 'dsf-section' : 'dsf-section dsf-off'}>
        <div className="dsf-row">
          <div className="dsf-text">
            <div className="dsf-title">{t('enabled.title')}</div>
            <div className="dsf-description">{t('enabled.description')}</div>
            {durable ? null : <div className="dsf-note">{t('storage.local')}</div>}
          </div>
          <button
            type="button"
            role="switch"
            className="dsf-switch"
            aria-checked={prefs.enabled}
            aria-label={t('enabled.title')}
            onClick={() => { face.set('enabled', !prefs.enabled) }}
          />
        </div>
        <div className="dsf-group">
          <div className="dsf-head">
            <div className="dsf-text">
              <div className="dsf-title">{t('style.title')}</div>
              <div className="dsf-description">{t('style.description')}</div>
            </div>
            <div className="dsf-segment" role="group" aria-label={t('motion.label')}>
              {SCENE_MOTIONS.map(id => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={prefs.motion === id}
                  onClick={() => { face.set('motion', id) }}
                >
                  {t(MOTION_KEYS[id])}
                </button>
              ))}
            </div>
          </div>
          <div className="dsf-cards">
            {THEME_STYLES.map(id => (
              <button
                key={id}
                type="button"
                className="dsf-card"
                aria-pressed={prefs.style === id}
                data-theme-style={id}
                onClick={() => {
                  if (prefs.style !== id) face.set('style', id)
                  if (!prefs.enabled) face.set('enabled', true)
                }}
              >
                <Preview style={id} scheme={scheme} paint={face.paint} />
                <span className="dsf-name">{t(`style.${id}.name`)}</span>
                <span className="dsf-card-description">{t(`style.${id}.description`)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }
}
