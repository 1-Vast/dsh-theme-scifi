/**
 * Style ids, motion preferences, and the scene background of every style.
 * Shared by the painters, the token layer, and the settings section.
 */

/** The five sci-fi styles, in display order. */
export const THEME_STYLES = ['blackhole', 'orrery', 'lattice', 'field', 'signal'] as const

/** One sci-fi style. */
export type ThemeStyle = typeof THEME_STYLES[number]

/** Style shown before the user picks one. */
export const DEFAULT_STYLE: ThemeStyle = 'blackhole'

/** Scene motion: `live` animates the scene, `still` paints one frame. */
export const SCENE_MOTIONS = ['live', 'still'] as const

/** Scene motion preference. */
export type SceneMotion = typeof SCENE_MOTIONS[number]

/** Motion used before the user picks one. */
export const DEFAULT_MOTION: SceneMotion = 'live'

/** Scene background colors for one style. */
export interface SceneBackground {
  /** Scene background under the light palette. */
  readonly light: string
  /** Scene background under the dark palette. */
  readonly dark: string
}

/** Scene background per style and color scheme; every token and scene builds on it. */
export const SCENE_BACKGROUNDS: Readonly<Record<ThemeStyle, SceneBackground>> = Object.freeze({
  blackhole: Object.freeze({ light: '#F4F1EA', dark: '#15131F' }),
  orrery: Object.freeze({ light: '#ECF0F5', dark: '#15223A' }),
  lattice: Object.freeze({ light: '#EDF4F3', dark: '#142A2B' }),
  field: Object.freeze({ light: '#F8F9FB', dark: '#1B202A' }),
  signal: Object.freeze({ light: '#EFF4EF', dark: '#12221B' }),
})

/**
 * Narrow a stored value to a style id.
 * @param value - value read from settings or storage.
 * @returns whether it names a style.
 */
export function isThemeStyle(value: unknown): value is ThemeStyle {
  return THEME_STYLES.some(style => style === value)
}

/**
 * Narrow a stored value to a motion preference.
 * @param value - value read from settings or storage.
 * @returns whether it names a motion preference.
 */
export function isSceneMotion(value: unknown): value is SceneMotion {
  return SCENE_MOTIONS.some(motion => motion === value)
}
