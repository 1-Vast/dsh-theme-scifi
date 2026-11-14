/**
 * Settings copy for the 科幻主题设置 / Sci-fi theme settings section. zh is the
 * source of the key set; en must stay complete against it (test/smoke.mjs
 * compares the two key sets).
 */

/** Chinese settings copy. */
export const ZH = {
  nav: '科幻主题设置',
  'enabled.title': '科幻主题',
  'enabled.description': '在界面背后实时演算一幕科学场景，并随智能体的工作而变化',
  'style.title': '风格',
  'style.description': '配色随「通用设置 › 外观」在浅色与深色之间切换',
  'motion.label': '场景动画',
  'motion.live': '动态',
  'motion.still': '静止',
  'style.blackhole.name': '黑洞',
  'style.blackhole.description': '史瓦西黑洞：逐像素光线追踪的吸积盘与引力透镜',
  'style.orrery.name': '星仪',
  'style.orrery.description': '开普勒轨道、特洛伊小行星群与霍曼转移',
  'style.lattice.name': '晶格',
  'style.lattice.description': '准晶体十次对称的旋进电子衍射',
  'style.field.name': '场',
  'style.field.description': '赫兹偶极子辐射：电场线脱离天线向外传播',
  'style.signal.name': '信号',
  'style.signal.description': 'L 波段瀑布图、色散的快速射电暴与脉冲星',
  'storage.local': '当前连接无法写入配置文件，这些设置只在本窗口生效',
} as const

/** A settings copy key. */
export type CopyKey = keyof typeof ZH

/** English settings copy. */
export const EN: Readonly<Record<CopyKey, string>> = {
  nav: 'Sci-fi theme settings',
  'enabled.title': 'Sci-fi theme',
  'enabled.description': 'Computes a live scientific scene behind the interface that responds to the agent at work',
  'style.title': 'Style',
  'style.description': 'Colors switch between light and dark with General › Appearance',
  'motion.label': 'Scene motion',
  'motion.live': 'Live',
  'motion.still': 'Still',
  'style.blackhole.name': 'Black Hole',
  'style.blackhole.description': 'A Schwarzschild black hole: ray-traced accretion disk and gravitational lensing',
  'style.orrery.name': 'Orrery',
  'style.orrery.description': 'Kepler orbits, Trojan swarms, and Hohmann transfers',
  'style.lattice.name': 'Lattice',
  'style.lattice.description': 'Ten-fold precession electron diffraction of a quasicrystal',
  'style.field.name': 'Field',
  'style.field.description': 'Hertzian dipole radiation: field lines pinch off and travel outward',
  'style.signal.name': 'Signal',
  'style.signal.description': 'An L-band waterfall, dispersed fast radio bursts, and a pulsar',
  'storage.local': "This connection can't write the profile, so these settings last for this window only",
}
