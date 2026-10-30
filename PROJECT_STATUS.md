# 项目状态（PROJECT_STATUS）

> 每次里程碑结束或交接时更新。**接手前先读这份文件与 `git log`，不要凭记忆重造已完成模块。**

## 当前状态

| 项 | 值 |
|---|---|
| 版本 | v0.1.0 |
| 分支 | `main` |
| 最新提交 | 见下方「提交记录」末行 |
| 构建 | `npm run build` 通过（`dist/` ~228 kB JS / gzip 77 kB） |
| 测试 | `npm run test` → **29 passed**；`tools/ui_check.py` → **23/23 PASS（本地与线上各一轮）, console 0** |
| 线上 | https://foldyssey.app.workbuddy.host/?sharecode=AXD6562N6Z（`verified: true`） |
| 本地存储键 | `foldyssey.artworks.v1` / `foldyssey.progress.v1` |

## 已完成并验证

- 四种折叠预设 + 一刀半平面切割 + 逐层逆映射 + 展开并集
- 黄金样例（中心菱形，面积 `2d²`）与 29 个单元用例
- 6 个关卡（目标由标准解正向生成，每关可通关）
- 关卡页完整状态机 + 折叠相机 + 斜纹切区预览 + IoU 评分 + 差异覆盖
- 工坊（双视图 / ≤3 切口 / 配色 / 撤销重做 / 保存 / SVG+PNG 导出）
- 作品集、5 张数学交互卡片、关于页（含能力边界）
- 桌面 1440px 与移动 390px 通过浏览器验证，无 console 错误
- WorkBuddy 网站应用已发布并核验

## 未完成

| 项 | 状态 | 说明 |
|---|---|---|
| 运行时 AI 灵感设计师 | 未实现 | 页面无入口、零网络请求；方案见 `docs/AI_INTEGRATION.md` |
| 实体可打印模板 | 未实现 | 未做 A4 比例与折序核验，故不写 `verified` |
| 演示视频 | 未录制 | 脚本见 `submission/demo_script_60s.md`，需本人录屏 |
| 官方投稿 | 未提交 | 需本人登录填写身份信息并确认条款 |
| 真机 / Safari 回归 | 未执行 | 仅 Chromium 内核 + 390px 视口 |

## 已知问题

1. `tools/shots/*.png` 每次运行验证脚本都会被覆盖，产生 Git 噪声（可接受）。
2. 工坊的「自定义纸色」不进入撤销历史（只记录在 present 状态，撤销会跳回上一个快照）。
3. 关卡初始猜测普遍偏"过头"，第一刀通常得"未匹配"——这是刻意设计，但需要提示引导。

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

> 说明：本次开发在单个工作会话内完成，M0–M3 的代码是一体设计的一体实现，
> 三次提交是**真实检查点**（脚手架 → 几何可测 → 界面可用），
> 而非"每完成一个里程碑就停下来提交一次"的严格对应。此处如实标注，不虚构历史。

## 需要用户本人完成

1. 登录活动页面核对规则（截止时间、是否强制运行时 AI、表单字段）。
2. 录制 60 秒演示视频（脚本已备）。
3. 填写身份/联系方式/授权条款并提交。
4. 若需长期保存作品，使用工坊的 SVG/PNG 导出（本地存储会随清缓存丢失）。
