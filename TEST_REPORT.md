# 测试记录（TEST_REPORT）

> 只记录**实际执行过**的命令与结果。环境：Windows 11 / Node v22.22.2 / npm 10.9.7 /
> Edge（Chromium）无头 / 2026-10-30（北京时间）。
> 注：**2026-10-31 起本机的 Edge 与 Chromium 均无法启动**（见第八轮），
> 浏览器级检查停在 10-30 的 45/45；之后改用不依赖浏览器的结构渲染测试。

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

## 2026-10-30 · 第四轮（八折团花 + 折剪 / v0.3.0）

| 命令 | 结果 | 备注 |
|---|---|---|
| `npx vitest run` | **53 passed \| 1 skipped** | 几何 36（新增八折铺满、折叠终点、折剪不变量）+ AI 17 |
| `tools/ui_check.py`（1440×980 + 390×844） | **26 / 26 PASS**，`console issues: 0` | 新增团花关的切口标签页与折剪面板检查 |
| `npm run build` | 成功 | 主包 238.8 kB |

### 本轮的关键结论（实测得出，不是推断）

| 观察 | 证据 |
|---|---|
| **单条直线 + 八重镜像只能得到凸多边形**（正八边形 / 十字 / 环） | 12 个候选渲染成图：`tools/shots/patterns.png` |
| 要让纸出现**花瓣与尖角**，剪刀必须在纸包里拐弯 | 引入折剪后：`tools/shots/patterns3.png` |
| **22.5° 与 67.5° 在 D4 下属于同一轨道**，两个折剪会重复 | 终章关改用 0° 才长出第二层次尖角 |
| 8 层是正方形的上限（D4 有 8 个元素） | `radial8 patches tile the square exactly once` |

### 本轮修复

| 现象 | 根因 | 修复 |
|---|---|---|
| 折叠动画终点与 `forward` 不符 | 手写的扇区表把 s3/s7 的镜像轴写反 | 改为按折序推导，并加「终点必须等于 forward」的测试兜底 |
| 折剪的张口朝内，导致花心被吃掉 | `notchTriangle` 的底边方向取反 | 底边改为沿 +u 方向（向外张开） |
| 团花关与八角星关几乎相同 | 折剪吃掉了中心，直线花心变成冗余 | 改成外张式折剪，花心由直线独立控制 |
| 旧作品加载后切线失效 | 数据里没有 `kind` 字段 | `normalizeCut` 缺省按 `line` 处理，并有回归测试 |

## 未执行 / 未覆盖

| 项 | 原因 | 影响 |
|---|---|---|
| Firefox / Safari 实测 | 环境只有 Edge | 使用标准 SVG/CSS，风险低但未证 |
| 真机触控 | 无真机 | 仅 390×844 视口 + 指针事件代码审查 |
| 浏览器内下载 SVG/PNG 的落盘校验 | CDP 下载较繁琐 | 导出函数已有单元测试；路径与孔洞正确性已断言 |
| 在线链接验证 | 第二轮发布后已验证；v0.2.0 的 AI 功能需重新发布后再核验 | 记录在 `submission/publish_verification.md` |
| 运行时 AI 的真实调用 | 已通过 `ai.live.test.ts` 与 `tools/ai_check.py` 验证 | 见上方第三轮 |

## 2026-10-31 · 第五轮（AI 图案质量 + 校验容错 / v0.4.0）

### 1. 现场诊断（先取证，再改代码）

用 12 条中文 prompt 直接打真实模型（`glm-5.3-flash`，temperature 0.8），
逐条记录原始回复与校验错误：

| 指标 | 结果 |
|---|---|
| 失败率 | **9 / 12** |
| `theme` 枚举不匹配 | 7（`winter_snowflake` / `modern_minimal` / `flower` / `zodiac_rabbit` …） |
| 漏字段 `motifs.1.size` | 1 |
| 多字段 `rotation2` | 1 |
| JSON 解析失败 | 0 |
| 成功样本的形状分布 | 3/3 全是 `orthogonal2 + line+line+line` |

结论：失败来自**提示词没写枚举 + 校验器只拒绝不修复**，不是模型能力问题；
图案单调来自**几何表达力被锁在四重镜像 + 直线**。

### 2. 质量对照（改前 / 改后）

| 版本 | 生成结果 |
|---|---|
| 改前 | `tools/shots/ai-gallery.png`：八边形 + 菱形孔，三种主题几乎同形 |
| 改后 | `tools/shots/ai-gallery3.png`：锯齿边（32 齿）+ 八边形花心 + 8 道花瓣缝 + 一圈箭头镂空 |
| 参数扫描 | `tools/shots/patterns.png`（直线上限）、`cand2.png` / `cand6.png`（元素配比收敛） |

### 3. 执行记录

| 命令 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 error |
| `npx vitest run` | **72 passed \| 1 skipped**（几何 43 / AI 29） |
| `npx vite build` | 成功；主包 244.69 kB（gzip 82.87），AI chunk 156.33 kB 懒加载 |
| `tools/ui_check.py`（1440×980 + 390×844） | **26 / 26 PASS**，`console issues: 0` |
| `tools/ai_check.py`（真实模型） | **14 / 14 PASS**，`console issues: 0` |

`ai_check` 的真实输出（节选）：

```
PASS ai: model returned a renderable design  [八瓣迎春]
PASS ai: geometry summary shown
     [八折团花（八重镜像 · D4） · 7 刀（花心 1 · 花瓣 1 · 镂空 1 · 锯齿 1） | 保留 77% | 含花瓣 | 3631 ms]
```

### 4. 本轮修复的缺陷

| 现象 | 根因 | 修复 |
|---|---|---|
| 频繁报"参数不符合范围" | `.strict()` + 未在提示词声明枚举 + 无修复路径 | `coerceDesign()` 归一 + 结构补足 + 一次自动重试 |
| `hole` 后再 `rim`，整张纸变空（3.70 → 0.00） | `unionMP` 全有或全无；一个片区退化清空并集 | 增量合并；`paper = P \ removed` |
| 折剪的 V 形画在内侧、实际剪在外侧 | `PaperStage` 的臂方向与 `notchTriangle` 相反 | 统一为向外张开 |
| 浅锯齿变成细针、深锯齿变成长槽 | 缺口三角的底边固定在 1.4 处 | 锯齿改为"边缘菱形孔" |

### 5. 仍未覆盖

| 项 | 原因 |
|---|---|
| Safari / 真机 | 只有 Chromium 内核（Edge）+ 390px 视口 |
| 曲线切割 | 与"一刀 / 折剪"的语义冲突，明确不做 |
| 服务端配额 | 依赖平台侧额度，客户端限流只能挡普通用户 |

## 2026-10-31 · 第六轮（判定分级 + 一键诊断 + 实时对照 / v0.5.0）

### 1. 先量，再改：旧判定为什么"难"

用每关的标准解，把某个参数改动**恰好一个 UI 步长**（角度 0.5°、距离 0.01）：

| 关卡 | 阶段 | 最低 IoU（±1 格） |
|---|---|---|
| 角落初探 | 1 | 99.8% |
| 镜像之门 | 1 | 99.7% |
| 菱形奇迹 | 2 | 99.0% |
| 八角星 | 2 | **98.0%** |
| 团花 | 3 | 98.2% |
| 万象团花 | 3 | 98.1% |

旧判定要求 `IoU ≥ 0.99` 且对称差 ≤ 2%。**八折关一格偏差就掉到 98.0%**，
等于要在 360 个滑块位置里盲猜一个。改前实测的可玩性结论：不是难，是没有反馈。

### 2. 改后（数据都是本次实跑）

| 命令 / 指标 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 error |
| `npx vitest run` | **81 passed \| 1 skipped**（几何 47 / 诊断 5 / AI 29） |
| `npx vite build` | 主包 250.63 kB（gzip 85.44） |
| `tools/ui_check.py` | **37 / 37 PASS**，`console issues: 0` |
| 引擎 + 评分一次 | **3.4–3.8 ms**（≈ 260–290 fps 余量） |
| 诊断一次（1 刀） | 3.6 / 4.1 ms |
| 诊断一次（8 折 3 刀） | 24.5 / 44.5 ms（聚焦当前刀，必要时扩到其它刀） |

从最坏初始猜测出发，只用「按建议调整」，最多 6 次的收敛轨迹：

```
corner        87.4 → 93.5 → 98.3 → 99.3 → 99.8 → 100.0   达标
mirror-gate   89.7 → 96.9 → 98.6 → 99.5 → 99.7 → 100.0   达标
diamond       73.3 → 93.9 → 98.0 → 99.0 → 100.0          达标
octagram      88.2 → 89.8 → 92.2 → 96.8 → 98.2 → 99.4    达标
rosette       88.8 → 90.6 → 92.6 → 94.5 → 96.9 → 98.0    达标
grand-rosette 75.2 → 76.3 → 77.7 → 89.9 → 91.1 → 93.1    达标
```

### 3. 新增的检查项

| 层 | 用例 |
|---|---|
| 判定 | 四档边界、`isCleared`、阶段阈值单调、每关阈值来自阶段 |
| 容差 | `one slider step never fails any level`（6 关 × 每参数 × ±1 格） |
| 诊断 | 找得到改进、照做确实变好、文案含「第 N 刀」与滑块名、6 次收敛、步进不越界 |
| 浏览器 | 说明条存在、说明条含「第 1 刀」或「只有一刀」、展开预览存在、实时吻合度存在、阶段标签、`差在哪？` 返回含滑块名的诊断、一键调整按钮 |

### 4. 本轮修复

| 现象 | 根因 | 修复 |
|---|---|---|
| 通关要靠盲猜 | 达标线 99% 高于"一格偏差"的 98.0% | 分级阈值 + 「完全匹配」降级为徽章 |
| 诊断在第一关之外给不出建议 | 单步搜索在距离目标较远时没有增益 | 粗到细 ×1/×4/×16，聚焦当前切口，必要时扩到其它刀 |
| 多刀关诊断耗时长（151 ms） | 搜了所有刀 | 只搜当前刀；当前刀无增益时才扩搜（≤ 45 ms） |

### 5. 未覆盖

| 项 | 原因 |
|---|---|
| 真机触控 | 仍只有 Chromium + 390px 视口 |
| 键盘微调 / 撤销栈 | 本轮未做，阶段 3 仍只有滑块 |
| 两参数同时调整的联合诊断 | 单参数搜索把耗时压在 50 ms 内，联合搜索会翻 10 倍 |

## 2026-10-31 · 第七轮（5 个典藏图案 + 图案库 / v0.6.0）

### 1. 新增图案与验收

5 个新图案全部由标准解**正向构造**，并有可复现的参数：

| id | 折法 | 刀数 | 标准解 IoU | 单步容差下限 |
|---|---|---|---|---|
| `pearls` | 八折 | 5 | 100% | 99.6% |
| `caisson` | 八折 | 6 | 100% | 99.6% |
| `diamond-window` | 四折 | 5 | 100% | 99.5% |
| `sixfold` | 八折 | 5 | 100% | 99.7% |
| `double-petal` | 八折 | 5 | 100% | — |

所有关卡（含镂空的 angle / radius / size / rotation）在**偏离一个滑块步长**后仍 ≥ 96%，
`one slider step never fails any level` 覆盖 11 关。

### 2. 图案库验收（浏览器，45 项）

| 检查 | 结果 |
|---|---|
| 11 张卡片 / 5 个筛选 chip | PASS |
| 选中卡片更新详情面板 | PASS（角落初探 → 重瓣） |
| 详情含 折叠结构 / 切割逻辑 / 展开效果 | PASS |
| 阶段筛选把网格收窄到 5 张 | PASS |
| 阶段 4 标签页按角色命名 | PASS（花心|花瓣缝|圆孔环|叶孔环|菱孔环） |
| 图案档案默认折叠、点击展开 | PASS |
| 390px 无横向溢出 | PASS |

合计 `45 / 45 PASS`，`console issues: 0`。

### 3. 本轮修复

| 现象 | 根因 | 修复 |
|---|---|---|
| 锯齿菱形转动 0.5° 后整张纸消失、IoU=0 | `intersection` 在退化环上抛异常返回空 | 面积恒等式兜底 + `differenceMP` 逐成员回退 |
| 切线在 0° 往下调一步，"剪去哪侧"翻面 | 步进取模 180 导致法向取反 | 与滑块一致钳制到 0–179.5 |
| 六出关单步容差只有 93.6% | 侧枝刀压在 45° 折痕上，退化 | 挪到 40°，回到 97.2% |
| 5 刀关卡侧栏 3000px，滑块被挤出首屏 | 侧栏顺序把"目标图案 + 档案"放在参数之前 | 重排为 预览 → 参数 → 目标 → 知识点 → 档案(折叠) → 关卡 |
| 图案库 3 列时阶段 1–3 各空一格 | 每阶段 2 张卡 | 改扁平 3 列（11 张 = 3+3+3+2），阶段用 chip 与角标表达 |

### 4. 未覆盖

| 项 | 原因 |
|---|---|
| 真机触控 | 仍只有 Chromium + 390px 视口 |
| 图案库的键盘左右切换 | 目前只能用 Tab + Enter，未做方向键 |
| 六重对称的真实实现 | 正方形无法折出 60°，只能八折近似并如实标注 |

## 2026-10-31 · 第八轮（曲线剪 + 剪刀能力分级 / v0.7.0）

环境：Windows 11 / Node v22.22.2 / 2026-10-31 01:20–01:30（北京时间）。
**本轮没有可用的浏览器**：Edge 的两个版本（155/156）在本机启动即退出（`--version`、`--dump-dom`
均无输出、进程 228 ms 结束），Chromium/Playwright 浏览器也都不在机器上。
因此 `tools/ui_check.py` **未能重跑**；作为替代，新增了不依赖浏览器的结构渲染测试
（`src/tests/ui.test.tsx`，`react-dom/server`），并保留 rasteriser（`tools/paperprobe.py`）
对 16 关目标图案做像素级目视核验。

| 命令 | 结果 | 备注 |
|---|---|---|
| `npx tsc --noEmit` | 通过（0 error） | — |
| `npx vitest run` | **104 passed / 1 skipped** | 6 个文件全绿；耗时 46 s，其中 39 s 是 `assist.test.ts` 的全量诊断搜索（见下） |
| `npm run build` | 成功 | JS 282.2 kB / gzip 99.3 kB；CSS 37.3 kB / gzip 8.5 kB |
| `node tools/ai_smoke.mjs` | 通过 | 列到 5 个可选模型，流式回复 `{"ok":true}`，用 157 tokens |
| `python tools/paperprobe.py`（16 关目标） | 目视通过 | 无破片、无 stray sliver；曲线关轮廓平滑 |

### 1. 本轮新增测试（14 个）

| 测试 | 断言 |
|---|---|
| `amplitude 0 is exactly the straight cut…` | 5 组参数下曲线与直线 `IoU=1`（1e-10）、纸形差 < 1e-9、移除面积相等 |
| `the sampled polyline stays inside the certified chord bound` | 9 组 `(A, bends)`：闭式上界 ≤ 1.2e-3，且 20× 密采样实测 ≤ 1.35×上界 |
| `the polygonised area converges to the refined area` | 三种 `bends` 的面积相对误差 < 2e-3 |
| `a bigger bend removes more paper…` | 单调性 + 正弯曲只剩两端薄片 |
| `the 8-fold pattern is invariant…` | 90° 旋转 / 镜像下逐点一致 |
| `paper + removed is still the whole sheet…` | 4 种折法 × 3 种 `bends`，总面积 ≈ 4 |
| `a curve that misses the packet is reported…` | warning 含「没有碰到」，纸形不变 |
| `degenerate and out-of-range curves…` | NaN/Infinity 拒绝、`bends=2.0000001→2`、`amplitude=4→1.5` |
| `the visible stroke is a real, finite path…` | 采样点有限、长度 > 0.5、误差 ≤ 容差 |
| `one curve evaluation stays fast enough…` | ≤ 60 ms/次（实测 2.2 ms） |
| `classifies by what the blade does…` | 四级判据 + 镂空不升级 + `A=0` 按直线计 |
| `each rung is introduced only after the one below it` | 四级首次出现的索引严格递增；曲线只在阶段 5 |
| `a curve level really has curved edges…` | 曲线关曲边占比 > 25%，无镂空的直线关 < 2% |
| `every canonical curve value is reachable…` | 角度 0.5° / 距离 0.01 / 弯曲 0.01 / `bends ∈ {1,2,3}` |

`src/tests/ui.test.tsx`（7 个）覆盖结构：16 关全部可渲染、分级条只有一个「本关」、
曲线关有曲线控件而直线关没有、曲线画出 ≥ 8 段折线与 1 个菱形手柄、两刀关有 2 个标签页、
侧栏 16 行、创作台有四种刀型。

### 2. 实测数据

| 项 | 数值 |
|---|---|
| 单次曲线求值（八折，`bends=3`） | 2.2 ms |
| 单次直线求值（八折） | 0.38 ms |
| 「差在哪？」（聚焦当前刀） | 角落 2 ms / 八角星 20 ms / 波边 48 ms / 花窗 72 ms / 藻井 216 ms |
| 「差在哪？」（不限刀） | 藻井 1800 ms（UI 从不这样调用，仅测试使用） |
| 一格滑块的最差 IoU（曲线关） | 波边 97.4% / 旋风 98.3% / 葫芦 98.0% / 花窗 97.2%（达标线 96%） |

`assist.test.ts` 的 39 s 全部来自"6 次一键微调必须通关"这一条：16 关 × 6 次 × 无聚焦诊断，
每次最多 126 次几何求值。这是测试的搜索成本，不是产品路径的成本（产品路径都带聚焦）。

### 3. 未覆盖（本轮新增）

| 项 | 原因 |
|---|---|
| `tools/ui_check.py` 重跑 | 本机无法启动 Chromium/Edge（启动即退出）；脚本已保留，需在有浏览器的环境执行 |
| 曲线关的真机触控 | 同上；`touch-action: pan-y` + 手柄 `none` 的组合只做了代码层审查 |
| 曲线在 SVG 导出中的视觉 | 导出路径来自同一几何，已由单测覆盖，但未做像素比对 |
