/**
 * The plugin's one stylesheet.
 *
 * Shell rules apply only while `html[data-dsh-scifi]` is set, so switching the
 * theme off restores every stock surface. The app frame, the centre column,
 * the conversation root, and the composer seat each paint an opaque
 * `--dsw-alias-bg-base` in the stock shell; they are cleared (or given the
 * translucent reading veil) so the scene canvas at `z-index: -1` shows
 * through. Selectors match CSS-module suffixes (`[class$='_frame']`), which
 * survive the hash prefix of each build. The section rules (`.dsf-*`) style
 * the settings page and are always on.
 */
export const SHEET = String.raw`
/* dsh-theme-scifi */
html[data-dsh-scifi] {
  background: transparent !important;
}
html[data-dsh-scifi] body {
  background: var(--dsh-scene-bg) !important;
}
html[data-dsh-scifi] [class$='_frame']:has(> [class$='_centerCol']),
html[data-dsh-scifi] [class$='_frame']:has(> [class$='_centerCol'])::before,
html[data-dsh-scifi] [class$='_centerCol'] {
  background: transparent !important;
}
html[data-dsh-scifi] [class$='_centerCol'] [class$='_root'][data-phase] {
  background: var(--dsw-specific-reading-fill) !important;
}
html[data-dsh-scifi] :is([data-phase='active'], [data-content-phase='active']) [class$='_composerSeat'] {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--dsw-specific-reading-mask) 0%, transparent) 0px,
    var(--dsw-specific-reading-mask) 36px
  ) !important;
}
/* Windows: the desktop shell colours its native title-bar overlay from this
   probe's background; clearing it lets the scene run under the window
   buttons. The probe's text colour, which draws the button glyphs, is kept. */
html[data-dsh-scifi] body > span[style*='--dsw-specific-sidebar-fill'] {
  background-color: transparent !important;
}

.dsf-section {
  display: flex;
  flex-direction: column;
  width: 100%;
}
.dsf-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.dsf-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px 0;
}
.dsf-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.dsf-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dsf-title {
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-primary);
}
.dsf-description {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}
.dsf-note {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-warn-primary);
}
.dsf-switch {
  position: relative;
  flex-shrink: 0;
  width: 36px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: var(--dsw-alias-border-l4);
  cursor: pointer;
  transition: background-color 160ms ease;
}
.dsf-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #FFFFFF;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: transform 160ms ease;
}
.dsf-switch[aria-checked='true'] {
  background: var(--dsw-alias-state-business-primary);
}
.dsf-switch[aria-checked='true']::after {
  transform: translateX(16px);
}
.dsf-switch:focus-visible,
.dsf-segment button:focus-visible,
.dsf-card:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}
.dsf-segment {
  display: inline-flex;
  flex-shrink: 0;
  padding: 2px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-sm);
}
.dsf-segment button {
  padding: 2px 10px;
  border: 0;
  border-radius: var(--dsw-radius-xs, 4px);
  background: transparent;
  font: inherit;
  font-size: 12px;
  line-height: 20px;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.dsf-segment button:hover:not([aria-pressed='true']) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsf-segment button[aria-pressed='true'] {
  background: var(--dsw-alias-bg-module-platform);
  color: var(--dsw-alias-label-primary);
}
.dsf-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}
.dsf-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 2px;
  padding: 6px 6px 10px;
  overflow: hidden;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-lg);
  background: transparent;
  font: inherit;
  text-align: left;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
}
.dsf-card:hover:not([aria-pressed='true']) {
  background: var(--dsw-alias-interactive-bg-hover);
}
.dsf-card[aria-pressed='true'] {
  border-color: var(--dsw-alias-state-business-primary);
  background: var(--dsw-alias-bg-module-platform);
  box-shadow: 0 0 0 1px var(--dsw-alias-state-business-primary);
}
.dsf-card canvas {
  display: block;
  width: 100%;
  height: 96px;
  margin-bottom: 6px;
  border-radius: var(--dsw-radius-md);
}
.dsf-name {
  padding: 0 4px;
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  line-height: 18px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.dsf-card-description {
  padding: 0 4px;
  font-size: 12px;
  line-height: 17px;
  color: var(--dsw-alias-label-secondary);
}
.dsf-off .dsf-cards,
.dsf-off .dsf-segment {
  opacity: 0.5;
}
@media (prefers-reduced-motion: reduce) {
  .dsf-switch,
  .dsf-switch::after {
    transition: none;
  }
}
`
