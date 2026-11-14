# dsh-theme-scifi

[简体中文](README.zh.md)

This plugin adds five sci-fi themes to the DeepSeek Harness desktop app and web UI. Each theme recolors the interface and draws a live scene behind it. The scene reacts to what the agent is doing: it brightens while a reply streams, pulses for each tool call and flickers on errors.

| Style | Scene |
| --- | --- |
| **Black Hole** | A Schwarzschild black hole, ray-traced per pixel: an accretion disk with Doppler beaming, a photon ring and gravitational lensing of the stars behind it |
| **Orrery** | Kepler orbits around a star, Trojan asteroid swarms at L4 and L5, and Hohmann transfers between orbits |
| **Lattice** | Precession electron diffraction of a quasicrystal with ten-fold symmetry |
| **Field** | Radiation from a Hertzian dipole: electric field lines pinch off the antenna and travel outward |
| **Signal** | An L-band radio waterfall with dispersed fast radio bursts and a pulsar |

Every style has a light and a dark palette and follows **General › Appearance**. Body text has a contrast ratio above 10:1 and secondary text above 6.5:1. Captions, links and errors are above 4.5:1. When the system asks for reduced motion, the scene paints one still frame.

## Install

The plugin replaces `dsh-theme-endfield`. Remove that plugin first so the two themes don't both restyle the shell:

```bash
dsh plugin --profile desktop remove dsh-theme-endfield
```

```bash
dsh plugin --profile desktop add github:1-Vast/dsh-theme-scifi
```

To install from a local checkout, build a tarball and add it instead:

```bash
pnpm install && pnpm run pack:local
```

```bash
dsh plugin --profile desktop add ./dsh-theme-scifi.tgz
```

Restart DeepSeek Harness after installing. On the desktop app, `dsh` is in `resources/runtime/cli/bin` under the install folder.

## Settings

Open **Settings › Sci-fi theme settings** (科幻主题设置). It has three settings:

- **Sci-fi theme** turns the theme on or off.
- **Style** picks one of the five scenes. Each card shows a still preview in the current color scheme.
- **Scene motion** is either **Live** (animated) or **Still** (one painted frame).

The settings are saved to the profile's `cordis.patch.yml` under the `theme-scifi` entry, so they survive restarts:

```yaml
- id: theme-scifi
  name: dsh-theme-scifi
  config:
    enabled: true
    style: blackhole   # blackhole | orrery | lattice | field | signal
    motion: live       # live | still
```

## How it works

The plugin has two halves:

- **Host half (`index.js`)** declares the `Config` schema. Its fields are volatile, which tells Harness to show them as an editable settings form.
- **Browser half (`client.js`)** does all the rendering:
  - It adds the style's color tokens through `theme.overrideTokens`. When you switch styles, the old and new colors cross-fade in a view transition.
  - It mounts the scene as a fixed canvas behind the shell.
  - It adds a stylesheet that makes the shell's opaque backgrounds transparent so the scene shows through.
  - It registers the settings section.

When the plugin is disabled or removed, it releases all of this.

## Development

```bash
pnpm install
```

```bash
pnpm test
```

`pnpm test` fails if `client.js` is out of date with `src/`. It also runs `test/smoke.mjs`, which loads the built bundle in jsdom against stand-in Harness services and clicks through the settings section.

```bash
pnpm run build
```

```bash
pnpm run typecheck
```

`src/scifi/` holds the scene painters. They are shared with the `ui-theme` package in deepseek-harness.

## License

MIT. Portions are derived from deepseek-harness (MIT).
