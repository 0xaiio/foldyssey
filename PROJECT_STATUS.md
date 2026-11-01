# 项目状态（PROJECT_STATUS）

> 每次里程碑结束或交接时更新。**接手前先读这份文件与 `git log`，不要凭记忆重造已完成模块。**

## 当前状态

| 项 | 值 |
|---|---|
| 版本 | v0.7.4（公式改为构建期 LaTeX→SVG；214 个用例，核心覆盖率 96.7%） |
| 分支 | `main` |
| 最新提交 | 见 `git log -1`（宣传视频与投稿材料）· 功能提交 `cc4af91` |
| 构建 | `npm run build` 通过（主包 314.7 kB / gzip 107.1 kB，其中公式 +5.1 kB gzip；`AiPage` 独立 chunk 157.3 kB 懒加载；CSS 39.7 kB / gzip 8.9 kB） |
| 测试 | `npm run test` → **214 passed \| 1 skipped**（11 个文件）；`npx vitest run --coverage` → 行 **96.73%** / 分支 **87.89%** / 函数 **95.06%**（核心 17 个模块）；`tools/ui_check.py` 45/45 **停在 v0.6.0**，本机已无法启动浏览器 |
| 线上 | https://foldyssey.app.workbuddy.host/?sharecode=AXD6562N6Z（v0.7.4，2026-11-01 重新发布并核验 `verified: true`） |
| 宣传视频 | `video/out/Foldyssey-1024.mp4`（**v2 · 3:29**，1920×1080@30，男声旁白、无配乐、硬字幕；生成方式见 `video/README.md`） |
| B 站投稿 | **已投**（2026-11-01）：`BV18pxs6REdh` https://www.bilibili.com/video/BV18pxs6REdh ；分区 知识·科学科普（tid 201），活动 万物研究所，`0xaiio` 合集第 3 集，置顶评论 rpid 322588221472 |
| 投稿包 | `submission/contest_submission_pack.md`（表单速填）、`submission/bilibili_publish.md`（B 站投稿方案 + 实际提交记录） |
| 许可 | **MIT**（`LICENSE`，Copyright (c) 2026 0xaiio，2026-11-01）；第三方依赖许可见 `submission/references_licenses.md` |
| 云服务 | `wbapp_l9MabRuQZEm757fiKlnw4Z`，billingStatus `normal`，provisionStatus `assigned` |
| 本地存储键 | `foldyssey.artworks.v1` / `foldyssey.progress.v1` / `foldyssey.ai.usage.v1`（session）/ `foldyssey.ai.draft.v1`（session） |

## 已完成并验证

- **5 种折叠预设**（不折 / 竖折 / 横折 / 正交双折 / 八折，1/2/2/4/8 层）
  + **4 种切割原语**（直线 / 折剪 / 镂空 / 曲线）+ 边缘锯齿（由菱形镂空排成）
- 展开管线：纸包内一次相减 → 逐层等距映射 → 整纸逐层相减；
  不变量 `paper ⊆ P`、`area(paper)+area(removed)=4`、逐层等面积、切口可交换全部有测试
- **16 关 / 5 阶段**，目标由标准解正向构造；「剪刀能力」四级（一刀/两刀/拐弯/曲线）
  由 `skillOf()` 计算、曲边占比实测
- 关卡页：状态机 + 折叠相机 + 斜纹切区预览 + IoU 四档评分 + 差异覆盖 + 一键诊断
- 工坊：双视图 / ≤3 切口 / 四种刀型互转 / 配色 / 撤销重做 / 保存 / SVG+PNG 导出
- AI 灵感：运行时模型 + schema 强制修复 + 6 个可编辑模板 + 两次 JSON 重试
- 作品集、5 张数学卡片、关于页（能力与定理表述已核对）
- **公式**：8 条 LaTeX 在构建期由 MathJax 编译成自包含 SVG；无数学字体依赖、无运行时；
  源文件哈希由测试守住（`docs/MATH_RENDERING.md`）
- 2026-10-30 桌面 1440px 与移动 390px 通过浏览器验证，无 console 错误；
  2026-10-31 起本机浏览器不可用，改由 28 个结构渲染用例补位
- WorkBuddy 网站应用已发布并核验（v0.7.2；v0.7.4 待发布）

## 未完成

| 项 | 状态 | 说明 |
|---|---|---|
| 实体可打印模板 | 未实现 | 未做 A4 比例与折序核验，故不写 `verified` |
| 演示视频 | 已生成（3:29） | `video/out/Foldyssey-1024.mp4`；已投 B 站 `BV18pxs6REdh` |
| 官方投稿 | 未提交 | 赛事表单需本人登录填写身份信息并确认条款；B 站稿件已发布 |
| 真机 / Safari 回归 | 未执行 | 仅 Chromium 内核 + 390px 视口 |
| 浏览器级回归 | 阻塞 | 本机 Edge/Chromium 启动即退出（2026-10-31 起），`ui_check.py` 需在有浏览器的环境重跑 |
| AI 曲线 | 未实现 | AI schema 仍只有 line/notch/hole/sawtooth，见「已知问题 0b」 |

## 已知问题

0. 折剪关（八角星 / 团花 / 万象团花等）与 AI 生成的花瓣都使用**折剪**（V 形，两段），不是「一刀直线」：直线与任意
   对称群作用下的并集仍是半平面之交，只能得到凸多边形。UI 按实际组成标注（「1 个折剪」「7 刀」），
   不混称一刀。
0b. AI 生成的图案**仍然没有曲线**：关卡与创作台已经支持曲线剪（`curve`），但 AI 的输出 schema
   没有 curve 元素，所以「一句话生成」只能产出直线 / 折剪 / 镂空。这是刻意的范围控制：
   曲线参数空间更大，需要先观察真人怎么调，再决定让模型怎么给。

1. `tools/shots/*.png` 每次运行验证脚本都会被覆盖，产生 Git 噪声（可接受）。
2. 工坊的「自定义纸色」不进入撤销历史（只记录在 present 状态，撤销会跳回上一个快照）。
3. 关卡初始猜测普遍偏"过头"，第一刀通常得"未匹配"——这是刻意设计，但需要提示引导。
4. AI 限流只在客户端（改前端可绕过）；真正的额度兜底在平台侧。
5. AI 生成的多种 motif 可能互相吞并（例如小尺寸 pinwheel 落在更大 diamond 内部），
   视觉上看起来"只剪了一刀"——几何上正确，但观感上弱。
6. `npm run test` 必须串行加载（`fileParallelism: false`），否则在受限 shell 下会丢文件。

## 重要领域约定（交接必读）

- 坐标系：纸张 `[-1,1]²`；纸包见 `docs/GEOMETRY_SPEC.md` §3；SVG 组带 `scale(1,-1)`。
- **`viewBox` 的 y 是 SVG 坐标**，折叠相机必须用数学中心的相反数（曾因此出过裁切 bug）。
- 一刀 = **半平面**，不是零宽线段；`removedSide` 决定剪哪边。
- 关卡目标必须由 `buildLevel()` 正向生成，禁止手写目标形状。
- 折叠动画端点精确、中间帧示意；渲染层不得修改 `CutOutcome`。

## 下一步入口

| 想做什么 | 从这里开始 |
|---|---|
| 加关卡 | `src/puzzle/levels.ts` 的 `SEEDS`，跑 `npm run test` 验证目标非退化且可通关 |
| 改几何 | `src/geometry/cut.ts` → 同步 `docs/GEOMETRY_SPEC.md` 与测试 |
| 改渲染/动画 | `src/components/PaperStage.tsx` |
| 接 AI | `docs/AI_INTEGRATION.md` 的清单 |
| 重新发布 | `npm run build` → 平台「更新发布」→ 跑线上核验（`submission/publish_verification.md`） |

## 提交记录

| 里程碑 | Commit SHA | 提交信息 | 分支 | Push | 验证 |
|---|---|---|---|---|---|
| M0 环境与基线 | `2afc46854d3a54c9b839118e8d982758e6ef7675` | chore(repo): initialize Foldyssey scaffold, tooling and engineering docs | main | ✅ | `vite build` 通过（占位页） |
| M1 几何与关卡 | `d8a88f25ec5ca1112ee3078cc3ca45a4649ebaea` | feat(geometry): verified fold-cut-unfold engine with golden tests and six levels | main | ✅ | `vitest run` 29 passed |
| M2/M3 应用与工坊 | `b124462aecb2293956f4e3f8ecc099a40f004eb1` | feat(app): playable puzzle, papercut studio, gallery and math lab | main | ✅ | `tsc` 0 error；`build` 通过；23/23 浏览器检查 |
| M4 发布与材料 | （本次提交，见 `git log -1`） | docs(release): publish verification and contest material | main | 见 `git log` | 线上 19/19 PASS |
| M8 曲线剪 | `3959b7e49606e2745a713dc25d95113fc1c17545` | feat(cut): curved scissor strokes and the four-rung scissor ladder | main | ✅ | `vitest` 104 passed；`build` 通过；发布 `verified: true` |
| M8.1 部署修复 | `9275067` | fix(deploy): bind the injected PORT and allow the proxy host | main | ✅ | `PORT=4192 npm start` → 200；重新发布成功 |
| M9 全面审查 | `15f745e` | fix(geometry): stop the cut engine from silently leaving a layer uncut | main | ✅ | `vitest` 199 passed；覆盖率 96.73/87.89/95.06；`build` 通过 |
| M10 公式渲染 | `cc4af91` | feat(formulas): compile LaTeX to self-contained SVG at build time | main | ✅ | `vitest` 214 passed；`svgprobe.py` 目视 4 条；`build` 通过；线上待发布 |

> 说明：本次开发在单个工作会话内完成，M0–M3 的代码是一体设计的一体实现，
> 三次提交是**真实检查点**（脚手架 → 几何可测 → 界面可用），
> 而非"每完成一个里程碑就停下来提交一次"的严格对应。此处如实标注，不虚构历史。

## 需要用户本人完成

1. 登录活动页面核对规则（截止时间、是否强制运行时 AI、表单字段）。
2. 录制 60 秒演示视频（脚本已备）。
3. 填写身份/联系方式/授权条款并提交。
4. 若需长期保存作品，使用工坊的 SVG/PNG 导出（本地存储会随清缓存丢失）。
