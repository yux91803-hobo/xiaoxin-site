# xiaoxin-site

xiaoxin.liming-work.com 的源码（Cloudflare Worker + Workers Static Assets）。推送到 main 会自动部署，部署在带 `muse` 标签的自建 runner 上运行；PR 会先部署到测试站 https://xiaoxin-site-staging.liming-work.workers.dev 。
不要改主站 liming-work.com，不要把任何密钥写进仓库。

## v3：电影感地球

- 开场：镜头从深空穿过星海俯冲到地球（每个浏览器会话只播一次，可「跳过」；系统开了「减少动态效果」就不播）。
- 真实昼夜：按当前时刻的太阳位置算晨昏线（`src/scene/astro.js`），夜面是城市灯光，晨昏线有暖色过渡。
- 流动云层 + 云影、大气散射辉光（Fresnel）、海面太阳高光、星空 + 程序化银河（星星会闪）。
- 后期：UnrealBloom 辉光、胶片颗粒、暗角；转场时有径向模糊、色差和闪光。
- 12 个地点之间的大圆航线光轨（粒子彗星尾），选中地点时相关航线变亮、标记发出冲击波。
- 「俯冲进卫星实景」：地球镜头一路扎向地面 → 闪白 → 切进 CesiumJS + Google 3D 实景；「回到地球」时反向拉出。实景里按当天当地「下午太阳约 32° 高」的时刻打光（高纬度冬天取正午高度的 80%），开大气光照和薄雾；Google 3D 瓦片自带烘焙阴影，实时阴影贴图会在屋顶和水面出条纹，所以不开。
- 卡片显示当地时间和白天/夜晚。

## 画质分级

右上角「画质」按钮在 自动 / 高 / 中 / 低 之间切换（存在 localStorage，也可用 `?q=high|medium|low`）。
自动模式按显卡/设备判断（软件渲染、省流量、弱 GPU → 低；手机 → 中；桌面 → 高），运行中如果帧率一直偏低会自动降一档。

| | 高 | 中 | 低 |
|---|---|---|---|
| 像素比上限 | 2 | 1.5 | 1 |
| 贴图 | 2k 先出图，再换 4k | 同左 | 2k |
| 后期（Bloom/颗粒/转场模糊） | 有，含色差 | 有，无色差 | 不加载后期代码 |
| 云影 / 星星数 / 航线粒子 | 有 / 9000 / 150 每条 | 有 / 5000 / 90 | 无 / 2500 / 40 |
| 实景细节（屏幕空间误差） | 12 | 16 | 24 |

## 代码结构

Vite 构建（`npm run build` → `dist/`，wrangler 从 `./dist` 发布静态文件；`public/` 里的贴图、`_headers`、CesiumJS 原样拷贝）。

```
index.html                 页面骨架（中文 UI）
src/main.js                组装：store/bus、画质、场景、转场、懒加载
src/state/                 store.js（小型状态仓库）· bus.js（事件总线）
src/core/                  renderer · quality.js（分级规则，纯函数）· quality-manager.js（检测 + 帧率调速）· textures.js
src/scene/                 astro.js（太阳位置/大圆，纯函数）· earth · sky · markers · arcs · camera-rig
src/effects/               post.js（后期链，懒加载）· transitions.js（转场参数补间）
src/shaders/*.glsl         地球、云、大气、星空、银河、航线、电影后期
src/ui/                    列表/卡片、工具栏、开场、拾取、提示
src/photoreal/index.js     卫星实景（懒加载，再按需加载 /vendor/cesium/Cesium.js）
src/data/                  地点、航线
```

首屏只加载 three.js + 应用代码（约 145 KiB gzip）；后期和实景是单独的 chunk，Cesium 只在进实景时下载。

## 卫星实景（看房子）

- Google Photorealistic 3D Tiles（Cesium ion asset 2275207）。加载失败（没配 token、连不上 Google、额度用完）会提示并拉回地球仪。
- CesiumJS 不进仓库：`npm ci` 时 `scripts/copy-cesium.mjs`（postinstall）把 `node_modules/cesium/Build/Cesium` 复制到 `public/vendor/cesium/`。
- Token 不进仓库：GitHub Actions secret `CESIUM_ION_TOKEN` 在部署时写成 Worker secret，页面从 `/config.json` 读取。该 token 在 Cesium ion 里只允许正式站和测试站域名，本地 `wrangler dev` 下会提示并回到地球仪，这是预期的。

## 本地开发与测试

```
npm ci            # 也会复制 CesiumJS
npm run build     # → dist/
npm test          # 单元 + 构建产物 + 渲染测试
npx wrangler dev  # 用真实 Worker 预览 dist/
```

`npm test` 在两个工作流里都在部署前运行（顺序：npm ci → npm run build → npm test → 部署）。
`test/render.test.mjs` 用无头 Chromium（SwiftShader 软件 WebGL）分别以 高/中/低 画质打开页面，检查能出帧、后期按档加载、控制台没有报错；机器上找不到 Chromium 时这一项会显示为 skipped（不会算通过），可用 `CHROMIUM_PATH` 指定。
部署后的冒烟测试会核对 `/version.json` 里的 commit，确认线上就是这次构建。

## 素材与参考

- 地球贴图：NASA Blue Marble / Black Marble（公有领域），经 three-globe 示例转存；云图来自 NASA Blue Marble Clouds（经 turban/webgl-earth 处理成透明图）。全部转成 WebP 自托管在 `public/textures/`，法线贴图由地形高度图生成。
- 参考：three.js 示例 `webgl_postprocessing_unreal_bloom`；vasturiano/globe.gl、three-globe（航线弧、云层做法）；bobbyroe/threejs-earth、sreya-satheesh/realistic-earth（昼夜贴图混合、海面高光、晨昏暖色、Fresnel 大气）；CesiumJS Sandcastle「Google Photorealistic 3D Tiles」「Shadows」。
