# xiaoxin-site

xiaoxin.liming-work.com 的源码（Cloudflare Worker）。推送到 main 会自动部署，部署在带 `muse` 标签的自建 runner 上运行。
不要改主站 liming-work.com，不要把任何密钥写进仓库。

## 卫星实景（看房子）

- 首页仍是 three.js 地球仪；地点卡片里的「卫星实景 · 看看房子」或右上角「实景」按需加载 CesiumJS（`public/photoreal.js`），用 Cesium ion 上的 Google Photorealistic 3D Tiles（asset 2275207）飞到地标上空。加载失败（没配 token、连不上 Google、额度用完）会提示并回到地球仪。
- CesiumJS 不进仓库：`npm ci` 时 `scripts/copy-cesium.mjs`（postinstall）把 `node_modules/cesium/Build/Cesium` 复制到 `public/vendor/cesium/`。
- Token 不进仓库：GitHub Actions secret `CESIUM_ION_TOKEN` 在部署时写成 Worker secret，页面从 `/config.json` 读取。该 token 在 Cesium ion 里只允许正式站和测试站域名，本地 `wrangler dev` 下会显示提示信息，这是预期的。
- `npm test` 在两个工作流里都会在部署前运行。
