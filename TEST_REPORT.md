# 测试记录（TEST_REPORT）

> 只记录**实际执行过**的命令与结果。环境：Windows 11 / Node v22.22.2 / npm 10.9.7 /
> Edge（Chromium）无头 / 2026-10-30（北京时间）。

## 2026-10-30 · 第一轮（几何核心完成）

| 命令 | 结果 | 备注 |
|---|---|---|
| `npx tsc --noEmit` | 通过（0 error） | 首轮曾报 3 处类型错误（`PaperPatch.region` 不存在、`toClip` 嵌套层级、未使用变量），已修复 |
| `npx vitest run` | 27 passed / 1 failed | 失败项为**测试自身**的常数写成 `0.5657`（应为 `0.4√2`），断言过严；修正为 `0.4*Math.SQRT2` |
| `npx vitest run`（复跑） | **27 passed** | — |
| `npx vite build` | 成功 | `dist/` 226.8 kB JS / 24.8 kB CSS |

## 2026-10-30 · 第二轮（界面与端到端）

| 命令 | 结果 | 备注 |
|---|---|---|
| `npx vitest run` | **29 passed**（新增 2 个导出用例） | `keeps the diamond hole as a separate sub-path`、`produces a stable downloadable file name` |
| `npx vite build` | 成功 | JS 228.2 kB / gzip 77.3 kB；CSS 25.4 kB / gzip 6.4 kB |
| `tools/ui_check.py`（Edge CDP，1440×980 + 390×844） | **23 / 23 PASS**，`console issues: 0` | 见下表明细 |

### 浏览器检查明细

| # | 检查 | 结果 |
|---|---|---|
| 1 | 首页标题含 Foldyssey | PASS |
| 2 | 首页 6 个关卡卡片 | PASS（6） |
| 3 | 首页 hero 画布有纸张路径 | PASS（12 条 path） |
| 4 | 首页无横向溢出 | PASS（1425 ≤ 1440） |
| 5 | 关卡页标题 | PASS |
| 6 | 关卡页绘制 4 个片区 | PASS（12 条 path） |
| 7 | 标准解可由滑块精确取到 | PASS |
| 8 | 「剪一刀」可点击 | PASS |
| 9 | **标准解通关** | PASS（完全匹配） |
| 10 | 指标显示 | PASS（IoU 100.0% / 对称差 0.0% / 实得面积 3.36） |
| 11 | 评分卡无需滚动可见 | PASS |
| 12 | 滑块联动读数 | PASS（0.52） |
| 13 | 工坊双画布 | PASS（2） |
| 14 | 工坊导出按钮 | PASS |
| 15 | 工坊「保存到我的作品」可点 | PASS |
| 16 | 作品集出现保存的作品 | PASS（1 件） |
| 17 | 作品集「编辑」可回到工坊 | PASS |
| 18 | 载入的作品正常渲染 | PASS（2 个画布） |
| 19 | 数学页 5 张卡片 | PASS（5） |
| 20 | 关于页能力边界 | PASS |
| 21 | 移动端无横向溢出 | PASS（390 ≤ 390） |
| 22 | 移动端画布宽度 | PASS（358 px） |
| 23 | `prefers-reduced-motion` 下仍渲染 | PASS（8 条 path） |

截图：`tools/shots/01-home-desktop.png` … `11-mobile-studio.png`（11 张）。

## 2026-10-30 · 第三轮（AI 创意设计师 / v0.2.0）

| 命令 | 结果 | 备注 |
|---|---|---|
| `npm install @tencent-ai/workbuddy-cloud-sdk@dev` | 成功 | `0.1.4-dev.ca27990.202610161713` |
| `node tools/ai_smoke.mjs` | 成功 | 模型列表 33 个；流式返回 `{"ok":true}`；860 tokens |
| `npm run test` | **46 passed \| 1 skipped** | 新增 `ai.test.ts` 17 例；连跑 3 次结果一致 |
| `FOLDYSSEY_LIVE_AI=1 npx vitest run src/tests/ai.live.test.ts` | **通过** | `glm-5.3-flash`，3181 ms，760 tokens，输出合法 JSON 且可渲染 |
| `npm run build` | 成功 | 主包 231.8 kB；`AiPage` 独立 chunk 139.1 kB（懒加载） |
| `tools/ai_check.py`（本地 preview，1440×980） | **13 / 13 PASS**，`console issues: 0` | 见下表 |

### AI 浏览器检查明细

| # | 检查 | 结果 |
|---|---|---|
| 1 | 首页导航出现「AI 灵感」 | PASS |
| 2 | AI 页渲染（懒加载 chunk 加载成功） | PASS |
| 3 | 披露文案（无需 API Key） | PASS |
| 4 | 输入接受 | PASS |
| 5 | 「生成设计」可点 | PASS |
| 6 | 模型返回可渲染设计 | PASS（「八瓣红窗花 / 八瓣迎春窗花」） |
| 7 | 几何摘要（折叠 / 切口数 / 保留率 / 耗时） | PASS |
| 8 | 预览是真实路径 | PASS（3 条 path） |
| 9 | 5 秒内第二次请求被拒 | PASS（「慢一点，2 秒后再生成」） |
| 10 | 失败后保留上一张设计 | PASS |
| 11 | 「在工坊中打开」交接成功 | PASS（`#/studio`） |
| 12 | 工坊载入 AI 切口 | PASS |
| 13 | 核心关卡不受 AI 影响 | PASS（14 条 path） |

### 本轮修复

| 现象 | 根因 | 修复 |
|---|---|---|
| `npm run test` 只跑到一个测试文件，伴随 `EPERM ...\Temp\...\ssr\...` | 多个 worker 同时启动时争抢 Vitest 模块缓存的临时目录 | `vite.config.ts` 设 `test.fileParallelism: false`（串行加载） |
| 限流失败会把上一张成功的设计清空 | 「生成结果」按 `status === 'success'` 渲染 | 改为只要有 `result` 就继续渲染，错误只在左侧提示 |
| `ai.live.test.ts` 报 `Cannot find name 'process'` | 缺 Node 类型 | 装 `@types/node` 并在 `tsconfig` 的 `types` 里加 `node` |
| 浏览器检查误判「关卡页只有 3 条 path」 | 断言在折叠动画开始前取值（平铺态只有并集路径） | 等待 1.8s 再计数 |


## 第二轮发现并修复的缺陷（有据可查）

| 现象 | 根因 | 修复 |
|---|---|---|
| 折叠完成后纸只剩顶部一条，且出框 | 绘制组带 `scale(1,-1)`，但折叠相机的 `viewBox` y 用的是**数学中心**而非 SVG 中心 | `packetView()` 中 `cy = -(minY+maxY)/2`；`toMath()` 同步改为 `-(vb.y+vb.h/2) - dy/scale` |
| 展开后纸面上有十字接缝 | 四个片区各自填充，公共边抗锯齿露出底色 | `foldedness < 0.02` 时改画**并集**路径 |
| 切区预览在红纸上看不见 | 预览填充用的是相近的红色 | 改为 45° 白色斜纹 hatch + 强调色虚线 |
| 进关后约 1 秒内「剪一刀」不可点 | 折叠动画期间按钮 disabled | 允许在 `ready/folding` 下点击并吸附到折叠态；状态转移改为函数式并校验当前态 |
| 通关后评分卡在视口外 | 侧栏顺序靠后 | `.score-card { order: -1 }` |
| 手机上导航换行挤成两行 | `flex-wrap` + `margin-left:auto` | ≤720px 时品牌独占一行、导航横向滚动 |

## 未执行 / 未覆盖

| 项 | 原因 | 影响 |
|---|---|---|
| Firefox / Safari 实测 | 环境只有 Edge | 使用标准 SVG/CSS，风险低但未证 |
| 真机触控 | 无真机 | 仅 390×844 视口 + 指针事件代码审查 |
| 浏览器内下载 SVG/PNG 的落盘校验 | CDP 下载较繁琐 | 导出函数已有单元测试；路径与孔洞正确性已断言 |
| 在线链接验证 | 第二轮发布后已验证；v0.2.0 的 AI 功能需重新发布后再核验 | 记录在 `submission/publish_verification.md` |
| 运行时 AI 的真实调用 | 已通过 `ai.live.test.ts` 与 `tools/ai_check.py` 验证 | 见上方第三轮 |
