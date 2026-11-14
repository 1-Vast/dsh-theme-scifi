/**
 * Host half of dsh-theme-scifi.
 *
 * It only declares the settings the browser half edits. Every field is
 * `.volatile()`: the Harness settings service projects volatile fields of a
 * plugin's Config into an editable form, which the browser reaches through
 * `configForms.get('theme-scifi')`, and persists edits into the profile's
 * cordis.patch.yml — a store that survives restarts and Desktop's per-launch
 * origin change. Changing this file needs a full Harness restart.
 */
import z from '@deepseek-ai/schemastery'

/** Package name. */
export const name = 'dsh-theme-scifi'

const STYLES = ['blackhole', 'orrery', 'lattice', 'field', 'signal']
const MOTIONS = ['live', 'still']

/** Settings edited from the 科幻主题设置 / Sci-fi theme settings section. */
export const Config = z.object({
  enabled: z.boolean().default(true).volatile()
    .description('Turn the sci-fi theme on or off.'),
  style: z.union(STYLES).default('blackhole').volatile()
    .description('Theme style: blackhole, orrery, lattice, field, or signal.'),
  motion: z.union(MOTIONS).default('live').volatile()
    .description('Scene motion: live animates the scene, still paints one frame.'),
})

/** The browser half owns all rendering; the Host half has nothing to start. */
export function apply() {}
