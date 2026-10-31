# 开发指南（DEVELOPMENT）

## 环境

| 项 | 版本 / 说明 |
|---|---|
| Node.js | ≥ 18（实测 v22.22.2） |
| 包管理 | npm 10.x |
| 浏览器 | 任意现代浏览器；端到端验证用本机 Edge |
| Python（仅验证脚本） | 3.11+，需 `websocket-client` |

依赖版本由 `package-lock.json` 锁定。国内网络可用
`npm install --registry=https://registry.npmmirror.com`。

## 脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | Vite 开发服务器（`127.0.0.1:5173`） |
| `npm run build` | `tsc --noEmit && vite build` → `dist/` |
| `npm run preview` | 预览生产包（`127.0.0.1:4173`） |
| `npm run test` | Vitest 跑全部单元测试 |
| `npm run test:watch` | 监听模式 |
| `npm run typecheck` | 仅类型检查 |

> `lint` 脚本**未配置**，因此任何文档都不会写"lint 通过"。

## 编码约定

1. **几何是纯函数**：`src/geometry/**` 不 import React、不访问 `window`、
   不读时间/随机数。所有结果由输入唯一决定。
2. **类型不放水**：核心几何不使用 `unknown`；`MultiPolygon` 有明确结构，
   输入在边界处校验（`normalizeCut`、`cleanRing`、`isFiniteMultiPolygon`）。
3. **渲染不改数据**：动画只改变渲染矩阵，绝不修改 `outcome`。
4. **命名**：几何用 `P / packet / patch / cut / region`；页面用 `phase`；
   避免 `shape`、`result` 这类含糊词。
5. **注释解释"为什么"**：例如 `packetView` 里为什么 y 要取反、
   `PaperStage` 里为什么平铺时改画并集（抗锯齿接缝）。

## 目录速查

```
src/geometry/vec.ts       向量与 clamp/smoothstep 的基础件
src/geometry/clip.ts      polygon-clipping 的适配层（唯一依赖第三方几何的地方）
src/geometry/polygon.ts   类型、面积、布尔运算、路径生成
src/geometry/fold.ts      五种预设、片区、折叠插值矩阵
src/geometry/cut.ts       半平面、逐层逆映射、CutOutcome
src/geometry/score.ts     IoU / 对称差 / 判定
src/puzzle/levels.ts      16 个关卡（目标 = 标准解的正向构造）
src/components/PaperStage  SVG 渲染器（相机、拖拽、图层）
src/services/export.ts    SVG / PNG 导出
src/services/storage.ts   localStorage 读写与 schema 校验
```

## 调试入口

- **看几何对不对**：`npx vitest run -t "golden diamond"`；
  或在 Node 里 `applyCuts('orthogonal2', [cutFromAngle(45,0.4,'negative')])` 直接打印面积。
- **看路径串**：`multiPolygonToPath(outcome.paper)` 输出 `M…L…Z`，孔洞是第二个子路径。
- **看相机问题**：折叠后纸被裁掉一半 → 十有八九是 `viewBox` 的 y 没取反（见 `packetView`）。
- **看拖拽漂移**：`toMath()` 必须用当前 `viewBox`，不能用固定常量。

## 提交前自检

```bash
npm run typecheck && npm run test && npm run build
git status --short          # 确认没有把 dist/、node_modules/、.env 加进来
```

任何影响用户行为或数据格式的改动，必须同步更新：代码、测试、`docs/` 对应文档、
`CHANGELOG.md`。
