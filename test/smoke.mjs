/**
 * Smoke test: load the built client.js the way the Harness module loader does,
 * run it against fake theme / configForms / locale / slots services in jsdom,
 * render the settings section with React, and drive it. Also checks the Host
 * half's Config and the package's bundle patch and locale files.
 *
 *   node test/smoke.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { JSDOM, VirtualConsole } from 'jsdom'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'package.json'))

let passed = 0
async function check(label, fn) {
  try {
    await fn()
    passed++
    console.log(`ok   ${label}`)
  } catch (error) {
    console.error(`FAIL ${label}`)
    throw error
  }
}

// ---- jsdom window. Canvas is not implemented there: the plugin must cope.
const quiet = new VirtualConsole()
quiet.on('jsdomError', (error) => {
  if (!/Not implemented: HTMLCanvasElement/.test(String(error?.message))) console.error(error)
})
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', {
  url: 'http://127.0.0.1/',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
  virtualConsole: quiet,
})
const { window } = dom
globalThis.window = window
globalThis.document = window.document
globalThis.IS_REACT_ACT_ENVIRONMENT = true
for (const key of ['navigator', 'HTMLElement', 'Node', 'Event', 'MouseEvent', 'getComputedStyle']) {
  if (!(key in globalThis)) globalThis[key] = window[key]
}
const React = require('react')
const { createRoot } = require('react-dom/client')
const act = React.act ?? require('react-dom/test-utils').act

// ---- Load client.js through a fake module loader.
let loaded
window.__ModuleLoader__ = { load: (entry) => { loaded = entry } }
window.eval(readFileSync(join(root, 'client.js'), 'utf8'))

await check('client.js registers with the module loader', () => {
  assert.equal(loaded?.id, 'dsh-theme-scifi')
  assert.equal(typeof loaded.factory, 'function')
})

const plugin = loaded.factory((id) => {
  if (id === 'react') return React
  throw new Error(`unexpected require(${JSON.stringify(id)})`)
})

await check('exports name, inject, apply and the five styles', () => {
  assert.equal(plugin.name, 'dsh-theme-scifi')
  assert.deepEqual([...plugin.inject], ['theme'])
  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual([...plugin.styles], ['blackhole', 'orrery', 'lattice', 'field', 'signal'])
})

// ---- Fake services.
function createHarness({ withForm = true, initial } = {}) {
  const effects = []
  const events = new Map()
  const tokenLayers = []
  const writes = []
  const registered = []
  const localeCalls = []
  let scheme = 'light'

  // Mirrors ThemeRuntime.overrideTokens: one layer per source, a newer call
  // replaces the older layer, and a stale disposer is a no-op.
  const current = new Map()
  const theme = {
    getTheme: () => ({ active: { colorScheme: scheme } }),
    overrideTokens(source, tokens) {
      const previous = current.get(source)
      if (previous !== undefined) previous.live = false
      const layer = { source, tokens, live: true }
      current.set(source, layer)
      tokenLayers.push(layer)
      return () => {
        if (current.get(source) !== layer) return
        current.delete(source)
        layer.live = false
      }
    },
  }

  const formListeners = new Set()
  let snapshot = { status: 'ready', value: initial ?? {}, writable: true }
  const form = {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      formListeners.add(listener)
      return () => { formListeners.delete(listener) }
    },
    async set(field, value) {
      writes.push([field, value])
      snapshot = { ...snapshot, value: { ...snapshot.value, [field]: value } }
      for (const listener of formListeners) listener()
      return true
    },
  }
  // A class method, so a detached call would lose `this` and throw.
  class ConfigForms {
    constructor() { this.forms = new Map([['theme-scifi', form]]) }
    get(id) { return this.forms.get(id) }
  }

  let dicts
  const locale = {
    register(ns, value) {
      localeCalls.push(ns)
      dicts = value
      return () => { dicts = undefined }
    },
    bind: () => key => dicts?.en[key] ?? key,
  }

  const slots = {
    inject: (_key, callback) => callback(),
    register(options, component) {
      const entry = { options, component, live: true }
      registered.push(entry)
      return () => { entry.live = false }
    },
  }

  const services = { theme, locale, slots, ...withForm ? { configForms: new ConfigForms() } : {} }
  const ctx = {
    get: name => services[name],
    effect(setup) { effects.push(setup()) },
    on(event, listener) {
      events.set(event, listener)
      return () => { events.delete(event) }
    },
  }

  return {
    ctx,
    tokenLayers,
    writes,
    registered,
    localeCalls,
    get dicts() { return dicts },
    get formListeners() { return formListeners.size },
    emitForm(value) {
      snapshot = { ...snapshot, value }
      for (const listener of formListeners) listener()
    },
    setScheme(next) {
      scheme = next
      events.get('theme/change')?.()
    },
    dispose() {
      for (const dispose of effects.splice(0).reverse()) dispose?.()
    },
  }
}

const html = window.document.documentElement
const sheet = () => window.document.querySelector('style[data-plugin="dsh-theme-scifi"]')
const liveLayers = h => h.tokenLayers.filter(layer => layer.live)

await check('does nothing without the theme service', () => {
  const effects = []
  plugin.apply({ get: () => undefined, effect: (setup) => { effects.push(setup) }, on: () => () => {} })
  assert.equal(effects.length, 0)
  assert.equal(sheet(), null)
})

const h = createHarness({ initial: { enabled: true, style: 'orrery', motion: 'still' } })
plugin.apply(h.ctx)

await check('applies the saved style: stylesheet, attribute and token layer', () => {
  assert.ok(sheet(), 'stylesheet mounted')
  assert.match(sheet().textContent, /html\[data-dsh-scifi\]/)
  assert.equal(html.getAttribute('data-dsh-scifi'), 'orrery')
  const layers = liveLayers(h)
  assert.equal(layers.length, 1)
  assert.equal(layers[0].source, 'dsh-theme-scifi')
  const entries = Object.entries(layers[0].tokens)
  assert.ok(entries.length > 20, `expected a full token layer, got ${entries.length}`)
  for (const [key, pair] of entries) {
    assert.match(key, /^--/)
    assert.equal(typeof pair.light, 'string')
    assert.equal(typeof pair.dark, 'string')
    assert.ok(pair.light && pair.dark, `${key} has both values`)
  }
  assert.ok(window.localStorage.getItem('dsh-theme-scifi.prefs')?.includes('orrery'), 'first-paint mirror written')
})

await check('registers the locale with matching zh and en keys', () => {
  assert.deepEqual(h.localeCalls, ['settings.theme-scifi'])
  const zh = Object.keys(h.dicts.zh).sort()
  const en = Object.keys(h.dicts.en).sort()
  assert.deepEqual(zh, en)
  for (const lang of ['zh', 'en']) {
    for (const [key, value] of Object.entries(h.dicts[lang])) {
      assert.ok(typeof value === 'string' && value.trim(), `${lang}.${key} is empty`)
    }
  }
  assert.equal(h.dicts.zh.nav, '科幻主题设置')
  for (const id of plugin.styles) {
    assert.ok(h.dicts.en[`style.${id}.name`], `style.${id}.name`)
    assert.ok(h.dicts.en[`style.${id}.description`], `style.${id}.description`)
  }
})

await check('registers the settings section', () => {
  assert.equal(h.registered.length, 1)
  const { options } = h.registered[0]
  assert.equal(options.name, 'settings.section')
  assert.equal(options.id, 'theme-scifi')
  assert.equal(options.locale, 'settings.theme-scifi')
  assert.equal(options.label(), 'Sci-fi theme settings')
})

const container = window.document.getElementById('app')
const reactRoot = createRoot(container)
const Section = h.registered[0].component
await act(async () => { reactRoot.render(React.createElement(Section)) })
const q = selector => container.querySelector(selector)
const click = async (element) => {
  await act(async () => { element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
}

await check('renders the switch, motion segment and five cards', () => {
  assert.equal(q('.dsf-switch').getAttribute('aria-checked'), 'true')
  assert.equal(container.querySelectorAll('.dsf-card').length, 5)
  assert.equal(container.querySelectorAll('.dsf-card canvas').length, 5)
  assert.equal(q('.dsf-card[aria-pressed="true"]').dataset.themeStyle, 'orrery')
  const pressedMotion = q('.dsf-segment button[aria-pressed="true"]')
  assert.equal(pressedMotion.textContent, h.dicts.en['motion.still'])
  assert.equal(q('.dsf-note'), null, 'no window-only warning while the form is writable')
  assert.equal(q('.dsf-card[data-theme-style="blackhole"] .dsf-name').textContent, h.dicts.en['style.blackhole.name'])
})

await check('picking a card switches style and writes it to the form', async () => {
  await click(q('.dsf-card[data-theme-style="blackhole"]'))
  assert.equal(html.getAttribute('data-dsh-scifi'), 'blackhole')
  assert.deepEqual(h.writes.at(-1), ['style', 'blackhole'])
  assert.equal(liveLayers(h).length, 1, 'the previous layer was replaced')
  assert.equal(q('.dsf-card[aria-pressed="true"]').dataset.themeStyle, 'blackhole')
})

await check('the motion segment writes motion', async () => {
  const live = [...container.querySelectorAll('.dsf-segment button')].find(b => b.textContent === h.dicts.en['motion.live'])
  await click(live)
  assert.deepEqual(h.writes.at(-1), ['motion', 'live'])
  assert.equal(q('.dsf-segment button[aria-pressed="true"]').textContent, h.dicts.en['motion.live'])
})

await check('the switch turns the theme off and back on', async () => {
  await click(q('.dsf-switch'))
  assert.deepEqual(h.writes.at(-1), ['enabled', false])
  assert.equal(html.hasAttribute('data-dsh-scifi'), false)
  assert.equal(liveLayers(h).length, 0)
  assert.ok(q('.dsf-section').classList.contains('dsf-off'))
  // A card click while off picks the style and turns the theme on.
  await click(q('.dsf-card[data-theme-style="lattice"]'))
  assert.deepEqual(h.writes.slice(-2), [['style', 'lattice'], ['enabled', true]])
  assert.equal(html.getAttribute('data-dsh-scifi'), 'lattice')
  assert.equal(liveLayers(h).length, 1)
})

await check('follows settings saved elsewhere', async () => {
  await act(async () => { h.emitForm({ enabled: true, style: 'signal', motion: 'live' }) })
  assert.equal(html.getAttribute('data-dsh-scifi'), 'signal')
  assert.equal(q('.dsf-card[aria-pressed="true"]').dataset.themeStyle, 'signal')
  // Invalid values fall back to the current ones.
  await act(async () => { h.emitForm({ enabled: 'yes', style: 'nebula', motion: 'warp' }) })
  assert.equal(html.getAttribute('data-dsh-scifi'), 'signal')
})

await check('follows color-scheme changes', async () => {
  await act(async () => { h.setScheme('dark') })
  assert.equal(html.getAttribute('data-dsh-scifi'), 'signal')
})

await check('dispose releases everything', async () => {
  await act(async () => { reactRoot.unmount() })
  h.dispose()
  assert.equal(sheet(), null)
  assert.equal(html.hasAttribute('data-dsh-scifi'), false)
  assert.equal(liveLayers(h).length, 0)
  assert.equal(h.formListeners, 0)
  assert.equal(h.dicts, undefined)
  assert.equal(window.document.querySelector('canvas[data-dsh-scene]'), null)
})

await check('without a config form: uses the local mirror and warns', async () => {
  window.localStorage.setItem('dsh-theme-scifi.prefs', JSON.stringify({ enabled: true, style: 'field', motion: 'still' }))
  const local = createHarness({ withForm: false })
  plugin.apply(local.ctx)
  assert.equal(html.getAttribute('data-dsh-scifi'), 'field')
  const box = window.document.createElement('div')
  window.document.body.append(box)
  const r = createRoot(box)
  await act(async () => { r.render(React.createElement(local.registered[0].component)) })
  assert.ok(box.querySelector('.dsf-note'), 'window-only warning shown')
  await act(async () => { box.querySelector('.dsf-card[data-theme-style="orrery"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true })) })
  assert.equal(html.getAttribute('data-dsh-scifi'), 'orrery')
  assert.deepEqual(local.writes, [])
  await act(async () => { r.unmount() })
  local.dispose()
  box.remove()
})

// ---- Host half.
const host = await import(pathToFileURL(join(root, 'index.js')).href)

await check('Host Config: defaults, accepted and rejected values', () => {
  assert.equal(host.name, 'dsh-theme-scifi')
  assert.equal(typeof host.apply, 'function')
  // Volatile fields resolve to live cells; read them through get().
  const read = config => Object.fromEntries(Object.entries(config).map(([k, v]) => [k, typeof v?.get === 'function' ? v.get() : v]))
  assert.deepEqual(read(host.Config({})), { enabled: true, style: 'blackhole', motion: 'live' })
  assert.deepEqual(read(host.Config({ enabled: false, style: 'signal', motion: 'still' })), { enabled: false, style: 'signal', motion: 'still' })
  assert.throws(() => host.Config({ style: 'nebula' }))
  assert.throws(() => host.Config({ motion: 'warp' }))
})

// ---- Package metadata.
await check('bundle patch, manifest and locale files', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.equal(pkg.exports['./client'], './client.js')
  for (const file of ['index.js', 'client.js', 'cordis.patch.yml', 'locale', 'icon.svg', 'LICENSE']) {
    assert.ok(pkg.files.includes(file), `files lists ${file}`)
  }
  const patch = readFileSync(join(root, 'cordis.patch.yml'), 'utf8')
  assert.match(patch, /^- insert:\n\s+- id: theme-scifi\n\s+name: 'dsh-theme-scifi'/m)
  for (const lang of ['zh', 'en']) {
    const meta = JSON.parse(readFileSync(join(root, 'locale', `${lang}.json`), 'utf8')).meta
    assert.ok(meta.title && meta.description, `${lang} meta`)
  }
  assert.match(readFileSync(join(root, 'icon.svg'), 'utf8'), /^<svg[\s>]/)
})

console.log(`\n${passed} checks passed`)
window.close()
