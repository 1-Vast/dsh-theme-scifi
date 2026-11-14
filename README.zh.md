# dsh-theme-scifi

[English](README.md)

为 DeepSeek Harness 桌面端与网页端提供五种科幻主题。每种主题重新设定界面配色，并在界面背后绘制一幕实时场景。场景随智能体的工作而变化：回复生成时变亮，每次工具调用发出一次脉冲，出错时闪烁。

| 风格 | 场景 |
| --- | --- |
| **黑洞** | 逐像素光线追踪的史瓦西黑洞：带多普勒增亮的吸积盘、光子环，以及背景星光的引力透镜 |
| **星仪** | 恒星周围的开普勒轨道、L4 与 L5 处的特洛伊小行星群，以及轨道间的霍曼转移 |
| **晶格** | 十次对称准晶体的旋进电子衍射 |
| **场** | 赫兹偶极子辐射：电场线脱离天线向外传播 |
| **信号** | L 波段射电瀑布图，含色散的快速射电暴与脉冲星 |

每种风格都有浅色与深色两套配色，跟随「通用设置 › 外观」切换。正文对比度高于 10:1，次要文字高于 6.5:1，说明文字、链接与错误提示高于 4.5:1。系统要求减少动态效果时，场景只绘制一帧静止画面。

## 安装

本插件用于替换 `dsh-theme-endfield`。请先移除终末地主题，避免两个主题同时改写界面：

```bash
dsh plugin --profile desktop remove dsh-theme-endfield
```

```bash
dsh plugin --profile desktop add github:1-Vast/dsh-theme-scifi
```

也可以从本地源码打包后安装：

```bash
pnpm install && pnpm run pack:local
```

```bash
dsh plugin --profile desktop add ./dsh-theme-scifi.tgz
```

安装后重启 DeepSeek Harness。桌面端的 `dsh` 位于安装目录下的 `resources/runtime/cli/bin`。

## 设置

打开「设置 › 科幻主题设置」，共三项：

- **科幻主题**：开启或关闭主题。
- **风格**：从五幕场景中选择一种。每张卡片按当前配色显示静止预览。
- **场景动画**：「动态」播放动画，「静止」只绘制一帧。

设置保存在配置档的 `cordis.patch.yml` 中 `theme-scifi` 条目下，重启后仍然有效：

```yaml
- id: theme-scifi
  name: dsh-theme-scifi
  config:
    enabled: true
    style: blackhole   # blackhole | orrery | lattice | field | signal
    motion: live       # live | still
```

## 工作原理

插件分为两部分：

- **宿主部分（`index.js`）** 声明 `Config` 结构。字段都标记为 volatile，Harness 据此把它们显示为可编辑的设置表单。
- **浏览器部分（`client.js`）** 负责全部渲染：
  - 通过 `theme.overrideTokens` 写入当前风格的配色变量。切换风格时，新旧配色在视图过渡中交叉淡入淡出。
  - 把场景画布固定在界面背后。
  - 加入一份样式表，把界面不透明的背景改为透明，让场景透出来。
  - 注册设置页面。

插件被关闭或移除时，以上内容全部撤销。

## 开发

```bash
pnpm install
```

```bash
pnpm test
```

`client.js` 与 `src/` 不一致时，`pnpm test` 会失败。它还会运行 `test/smoke.mjs`：在 jsdom 中用模拟的 Harness 服务加载构建产物，并逐项点击设置页面。

```bash
pnpm run build
```

```bash
pnpm run typecheck
```

`src/scifi/` 中是场景绘制代码，与 deepseek-harness 的 `ui-theme` 包共用。

## 许可

MIT。部分代码源自 deepseek-harness（MIT）。
