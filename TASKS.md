# 任务追踪（TASKS）

状态取值：`已完成` / `部分完成` / `未完成` / `受阻` / `不适用`。
「已完成」必须有可执行证据；证据列写的是**实际跑过的命令或用例名**，
不是"应该没问题"。Commit SHA 汇总见 `PROJECT_STATUS.md`。

## 一、几何核心（Milestone 1）

| ID | 任务 / 验收条件 | 优先级 | 状态 | 实现文件 / 思路 | 验证证据 | 遗留 |
|---|---|---|---|---|---|---|
| REQ-GEO-001 | 纸张模型 `P=[-1,1]²`、片区等距变换、逆变换 | P0 | 已完成 | `geometry/polygon.ts`（`Mat`/`applyMat`）、`geometry/fold.ts` | `each patch transform is an isometry and its own inverse` | — |
| REQ-GEO-002 | 五种合法折叠预设（含八折团花） | P0 | 已完成 | `geometry/fold.ts` `FOLD_PRESETS`、通用折痕矩阵 | `the fold animation ends exactly at each patch forward map`、`radial8 patches tile the square exactly once` | 无斜折，8 层是正方形的上限 |
| REQ-GEO-003 | 一刀 = 半平面，逐层逆映射 | P0 | 已完成 | `geometry/cut.ts` `applyCuts` + `removedPacketRegion` | `every patch loses its own mirrored copy of the cut` | — |
| REQ-GEO-004 | 黄金样例：中心菱形 | P0 | 已完成 | 同上，参数 `45°/0.40/negative` | `removes a diamond of area 2d^2…`、`the hole is the set｜x｜+｜y｜< d`、`invariant under both axis reflections` | — |
| REQ-GEO-005 | 退化输入不崩溃 | P0 | 已完成 | `normalizeCut` 返回 `null`；`clip.ts` try/catch；面积阈值过滤 | `degenerate normals and non-finite values are rejected without crashing` | — |
| REQ-GEO-006 | IoU + 对称差评分 | P0 | 已完成 | `geometry/score.ts` | `identical regions score IoU = 1…`、`an obviously wrong solution is not accepted` | — |
| REQ-GEO-007 | 差异可视化 | P1 | 已完成 | `PaperStage` 的 `diffExtra/diffMissing/targetOutline` | 截图 `tools/shots/03b-puzzle-diff.png` | — |
| REQ-GEO-008 | 不变量 I1–I5 | P0 | 已完成 | — | `paper + removed = the original sheet`、`same input … byte-identical` 等 5 例 | — |

## 二、游戏（Milestone 2）

| ID | 任务 | 优先级 | 状态 | 实现 | 验证 | 遗留 |
|---|---|---|---|---|---|---|
| REQ-GAME-001 | 6 个原创关卡（3 关一刀 + 3 关八折团花） | P1 | 已完成 | `puzzle/levels.ts` `buildLevel()` | `ships six levels`、`every level can be solved by its canonical solution`、`levels are visually distinct` | — |
| REQ-GAME-002 | 折叠 / 剪 / 展开 / 重试 / 提示 | P0 | 已完成 | `pages/PuzzlePage.tsx` 状态机 | 浏览器验证 `canonical solution clears the level`（100% IoU） | — |
| REQ-GAME-003 | 三类渐进提示 | P1 | 已完成 | `levels.ts` `hints{observe,operate,solution}` | 手动检查（提示按钮循环 0→3 级） | — |
| REQ-GAME-004 | 移动端触控与布局 | P0 | 已完成 | `styles/index.css` 断点、`touch-action:none` | `mobile: no horizontal overflow`、`mobile: puzzle stage width fits`（358px） | 真机未测，仅 390px 视口 |
| REQ-GAME-005 | 进度与最佳成绩 | P2 | 已完成 | `services/storage.ts` `recordAttempt` | 通关后「已通关」chip 与首页计数 | — |
| REQ-GAME-006 | 分级判定与容差（exact/pass/near/miss，92/94/96%） | P0 | 已完成 | `geometry/score.ts`、`puzzle/levels.ts` `STAGE_THRESHOLDS` | `one slider step never fails any level`（6 关 × 全参数 × ±1 格）；`stages get stricter` | 达标线按阶段，见 `docs/UX_REDESIGN.md` §4 |
| REQ-GAME-007 | 「差在哪？」单参数诊断 + 6 次一键微调 | P0 | 已完成 | `puzzle/assist.ts`、`pages/PuzzlePage.tsx` `.diag` | `assist.test.ts` 5 例：找得到、照做变好、文案含滑块名、6 次收敛、步进不越界 | 只搜单参数（2D 组合不搜） |
| REQ-GAME-008 | 实时展开对照（预览 + 目标轮廓 + 差异区） | P0 | 已完成 | `pages/PuzzlePage.tsx`「展开预览」卡、`PaperStage` | `puzzle: live preview card exists`、`live IoU readout exists`；实测 3.4–3.8 ms/次 | 主画布不叠（坐标系不同） |
| REQ-UI-002 | 操作说明条（四步）与文案一致性 | P0 | 已完成 | `pages/PuzzlePage.tsx` `.howto`；`cutLabel`/`cutSummary` 单一来源 | `puzzle: how-to strip is on screen`、`how-to names both cut tabs and sliders`、`diagnosis names a slider` | — |
| REQ-GAME-006 | 评分卡无需滚动即可见 | P0 | 已完成 | `.score-card { order: -1 }` | `puzzle: score card visible without scrolling` | 视觉顺序先于 DOM 顺序（已注释权衡） |

## 三、工坊与作品（Milestone 3）

| ID | 任务 | 优先级 | 状态 | 实现 | 验证 | 遗留 |
|---|---|---|---|---|---|---|
| REQ-STUDIO-001 | 双视图（纸包编辑 + 实时预览） | P0 | 已完成 | `pages/StudioPage.tsx` + 两个 `PaperStage` | `studio: two stage canvases` | — |
| REQ-STUDIO-002 | 切线编辑（拖动/旋转/滑块） | P0 | 已完成 | `PaperStage` 指针处理 + 滑块 | 滑块用例 `slider changes the offset readout`；拖动为人工验证 | 端到端未自动化拖动 |
| REQ-STUDIO-003 | 撤销 / 重做 / 重置 | P1 | 已完成 | `past/future` 快照栈 + `beginEdit()` | 手动检查 | 拖动与滑块的粒度靠 `beginEdit` 控制 |
| REQ-STUDIO-004 | SVG / PNG 导出 | P0 | 已完成 | `services/export.ts` | `keeps the diamond hole as a separate sub-path with evenodd fill`、`produces a stable downloadable file name` | 浏览器下载未自动化 |
| REQ-STUDIO-005 | 保存 / 载入 / 删除 | P0 | 已完成 | `services/storage.ts` | 手动：保存→刷新→作品集→编辑 | 未做配额满的实测 |
| REQ-STUDIO-006 | 多切口（≤3）+ 配色 | P1 | 已完成 | `StudioPage` 切口标签页、`PALETTES` | 手动检查 | — |

## 四、发布与投稿（Milestone 4）

| ID | 任务 | 优先级 | 状态 | 实现 | 验证 | 遗留 |
|---|---|---|---|---|---|---|
| REQ-REL-001 | WorkBuddy 公开发布 | P0 | 见 `submission/publish_verification.md` | 平台「网站应用」发布 | 同文件记录 | 需账号授权 |
| REQ-REL-002 | 更新发布后线上为最新 | P0 | 见同文件 | 「更新发布」 | 同文件记录 | — |
| REQ-AI-001 | 运行时 AI 灵感设计师 | P1 | **已完成** | `src/ai/{schema,prompt,client,draft}.ts` + `pages/AiPage.tsx`；模型只出参数，几何引擎出图 | 真实调用：`glm-5.3-flash` 3.6s；`tools/ai_check.py` 14/14 | 曲线不做，见 `docs/AI_INTEGRATION.md` §10 |
| REQ-AI-003 | 参数校验容错（归一 + 结构补足 + 重试） | P0 | **已完成** | `coerceDesign()` / `coerceTheme()` / `coerceOrder()` / `coerceColor()`；`normalizeDesign()` 的四层修复 | 12 条 prompt 实测失败 9 → 0；`src/tests/ai.test.ts` 29 例含 `null/42/字符串/数组` 全函数性 | 只剩"两次都没有 JSON"一条失败路径 |
| REQ-AI-004 | AI 图案质量：八折 + 花瓣 + 镂空 + 锯齿 | P0 | **已完成** | `elements` 六类；`elementToCuts()`；`THEME_PRESETS` | `tools/shots/ai-gallery3.png`；三张样例都含花心/花瓣/镂空/齿边 | 仍无曲线 |
| REQ-GEO-008 | 第三切割原语：闭合镂空（超椭圆） | P1 | **已完成** | `HoleCut` / `holeOutline()` / `removedPacketRegion()` | 8 折 → 一圈 8 孔、三形状面积序、退化输入不崩 | — |
| REQ-GEO-009 | 锯齿边（边缘菱形孔排） | P1 | **已完成** | `elementToCuts()` 的 `sawtooth` 分支 | 32/40 齿可数；极端齿深不吞纸 | 与 rim 互斥，已在提示词声明 |
| REQ-AI-003 | 输出 Schema 校验 | P0 | 已完成 | `zod` + `.strict()`；`motifToCut()` 固定映射 | `src/tests/ai.test.ts` 17 例（未知字段/枚举/越界/注入/降级） | — |
| REQ-AI-004 | 调用约束 | P0 | 已完成 | 120 字截断、单飞、30s AbortController、5s 间隔、每会话 12 次 | `ai: rate limit refuses a second call within 5s` | 仅客户端限流 |
| REQ-AI-005 | 失败降级 | P0 | 已完成 | 错误码前缀映射 + 重试 + 改用预设；`AiPage` 懒加载 + `Boundary` | `core: puzzle still works after the AI page` | — |
| REQ-AI-006 | 密钥不进前端 | P0 | 已完成 | 仅 `endpoint` + `publishableKey`；无模型 Key | `src/ai/cloudConfig.ts` 代码审查 + 仓库扫描 | — |
| REQ-AI-002 | AI 使用披露 | P1 | 已完成 | About 页 + `submission/ai_usage_disclosure.md` | 文本可查 | — |
| REQ-DOC-001 | 文档体系 | P0 | 已完成 | `docs/*`、根目录 6 份 | `docs/INDEX.md` 清单与实际文件一致 | — |
| REQ-DOC-002 | 任务追踪与里程碑记录 | P0 | 已完成 | 本文件 + `PROJECT_STATUS.md` | 提交表含真实 SHA | — |
| REQ-BRAND-001 | 品牌统一 | P0 | 已完成 | `index.html`、`public/favicon.svg`、各页文案 | 首页 title 断言 | — |
| REQ-QA-001 | 单元测试 | P0 | 已完成 | `src/tests/{geometry,ai}.test.ts` | `72 passed | 1 skipped`（几何 43 / AI 29） | — |
| REQ-QA-002 | 浏览器端验证 | P1 | 已完成 | `tools/ui_check.py`、`tools/ai_check.py` | 主流程 `37/37`、AI `14/14`，`console issues: 0`（本地与线上各一轮） | 仅 Chromium 内核 |
| REQ-QA-003 | 真实模型调用验证 | P0 | 已完成 | `src/tests/ai.live.test.ts`（默认 skip） | `FOLDYSSEY_LIVE_AI=1` 时通过，输出合法 JSON 并渲染 | 每次消耗一次额度 |

## 五、明确不做（不适用）

| 项 | 原因 |
|---|---|
| 任意斜折 / 曲线切口 | 需要新的合法分区与可平折性验证，超出首版范围 |
| 任意目标图案自动求解 | 需要一般平折算法，与"四种预设"的产品定位冲突 |
| 纸张物理仿真 | ADR-0001 |
| 实体可打印模板核验 | 未做 A4 比例尺与折序核验，因此不写 `verified` |
| 账号 / 云同步 | ADR-0005 |

## 六、下一步（若继续）

1. 接入运行时 AI（`docs/AI_INTEGRATION.md` 的方案），补齐 AI 端到端测试。
2. 增加斜折预设（45° 对角折），需要新的 `forward/inverse` 与无穿透说明。
3. 工坊增加"参数化孔洞"（圆/叶片），并明确标注为数字图案。
4. 真机（iOS Safari / Android Chrome）触控回归。
