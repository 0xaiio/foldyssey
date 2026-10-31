# 测试指南（TESTING）

四层验收：**数学 → 应用集成 → 视觉/交互 → 发布**。前两层可自动重跑，
后两层需要浏览器与线上环境。

## 1. 单元测试（`npm run test`）

位置 `src/tests/`，共 **199 个用例（+1 个默认跳过）**，10 个文件（9 个默认运行），按组：

> `vite.config.ts` 里设了 `fileParallelism: false`：在受限 shell 中多个 worker 同时
> 启动会争抢模块缓存的临时目录（EPERM），导致测试文件被静默丢弃。串行加载后稳定。

| 组 | 覆盖 | 关键用例 |
|---|---|---|
| fold model | 不变量与变换 | `no fold, no cut keeps the whole sheet`、`each patch transform is an isometry and its own inverse`、`foldedness 0 and 1 hit the exact identity / mirror matrices` |
| golden diamond | 黄金样例 | `removes a diamond of area 2d^2 and leaves 4a^2 - 2d^2`、`the hole is the set｜x｜+｜y｜< d`、`invariant under both axis reflections`、`changing the offset changes the hole size by the real geometry` |
| invariants & edge cases | 鲁棒性 | 子集、面积上下界、`paper + removed = 4`、空交集、NaN/Infinity、非单位法向量、确定性 |
| scoring | 评分 | IoU=1、错误解不通过、空区域不产生 NaN、容差内仍判通过 |
| shipped levels | 关卡数据 | 16 关唯一、每关标准解 IoU=1、每关初始猜测不通过、关卡互不相同、标准解可被 UI 复现 |
| export | 导出 | SVG 有 `evenodd` 与 2 个子路径、文件名稳定 |
| curved strokes | 曲线剪 | `amplitude 0 is exactly the straight cut…`（与直线严格等价）、`certified chord bound`（闭式误差界 vs 20× 密采样实测）、`converges to the refined area`、8 折对称不变、面积守恒、退化输入、`visible stroke`、单次求值 ≤ 60 ms |
| scissor ladder | 剪刀能力分级 | `classifies by what the blade does`（四级判据、镂空不升级、`A=0` 按直线）、`each rung is introduced only after the one below it`、`a curve level really has curved edges`（曲边占比与级位一致）、`canonical curve value is reachable` |
| blade type switch | 刀型转换 | 12 组转换都产出合法切口并保持方向；同型转换是 no-op；直线→曲线有可见弯曲、曲线归零退回同一条直线 |
| ui（`ui.test.tsx`） | 结构渲染（无浏览器） | 16 关全部可渲染；分级条只有一个「本关」且与 `level.skill` 一致；曲线关有曲线控件/手柄/拐点，直线关没有；两刀关 2 个标签页；侧栏 16 行；创作台四种刀型 |
| ai schema（`ai.test.ts`，29 个） | 模型输出校验 | 未知字段/未知 motif/越界数值/非法颜色/order=8 全部拒绝；对称类型不一致、低对比度、超长标题被确定性降级；45 组极值组合都仍可渲染；同输入同路径 |
| ai parsing | 解析模型文本 | 容忍 ```json 围栏与前后废话；无 JSON 抛错；控制字符清洗与截断 |
| ai live（默认跳过） | 真实调用 | `FOLDYSSEY_LIVE_AI=1` 时调用真实模型，断言返回可渲染设计 |
| ai client（`ai.client.test.ts`，18 个） | 运行时客户端 | 4 字下限不联网、5 秒间隔、12 次会话上限、并发 `busy`、模型目录空/全禁用、两次 JSON 重试、9 类错误映射、原始错误只进 `detail` |
| core review（`core.review.test.ts`，20 个） | 审查回归 | 片区 `region + removed = domain`、逐层等面积、切口可交换、`curveUnderFlippedNormal` 保形、布尔运算恒等式、向量/多边形辅助、D4 对称审计 |
| difference fallback（4 个） | 布尔回退 | 注入一次性失败后逐成员相减仍然生效；远处大 B 不清纸；覆盖时返回空 |
| services（`services.test.ts`，17 个） | 导出与存储 | SVG 转义、PNG 走 canvas、中文标题回落、配额/损坏/升级、进度合并、草稿往返 |
| pages smoke（`pages.smoke.test.tsx`，28 个） | 结构渲染（无浏览器） | App 导航是真实链接；7 个页面可渲染；16 关路径无 `NaN`；未知关卡兜底；分级条唯一当前档 |

断言口径：允许 `1e-9` 级浮点误差（`toBeCloseTo(x, 9)`）；
结构一致性用路径字符串完全相等（确定性）。

## 1.5 AI 专项验证

| 层 | 命令 | 判据 |
|---|---|---|
| Schema | `npm run test` | 29 个用例全绿 |
| 真实模型 | `FOLDYSSEY_LIVE_AI=1 npx vitest run src/tests/ai.live.test.ts` | 返回合法 JSON、`paper` 面积 > 0.32 |
| 浏览器 | `EDGE_ATTACH_PORT=9234 python tools/ai_check.py` | 生成成功 / 限流生效 / 失败保留上一张 / 交接工坊 / 核心功能不受影响 |
| 降级 | 同上（连续点两次「再生成一张」） | 出现「慢一点，N 秒后再生成」，且上一张设计仍在 |

AI 用例**不进**默认测试套件：真实调用有网络依赖、每次都消耗额度，`npm run test`
必须保持离线与确定性。

## 1.6 覆盖率

```bash
npx vitest run --coverage        # 需要 @vitest/coverage-v8（已列入 devDependencies）
```

**统计范围**（`vite.config.ts` 的 `coverage.include`，17 个文件、3 184 条语句）：

- `src/geometry/{vec,clip,polygon,fold,cut,score}.ts`
- `src/puzzle/{levels,assist,skill}.ts`
- `src/ai/{schema,prompt,draft,templates,client,cloudConfig}.ts`
- `src/services/{export,storage}.ts`

**不统计** `src/pages/**`、`src/components/**`、`src/app/**`、`src/hooks/**`：
它们主要是 JSX 标记，行覆盖率会被无语义分支稀释；改由 28 个结构渲染用例覆盖
（渲染成功、无 `NaN`、关键文案与引擎一致）。

2026-10-31 结果：语句/行 **96.73%**，分支 **87.89%**，函数 **95.06%**；最低的单文件
`schema.ts` 为 91.4%。门槛设为 **行覆盖率 ≥ 85%**，低于门槛视为回归。

> 报告目录 `coverage/` 不提交；`reporter` 不含 HTML —— 本机的 safe-delete 垫片拒绝
> 清理超过 50 个文件的目录，而一次 HTML 报告约 60 个文件。JSON summary 已包含全部数字。

## 2. 浏览器端验证（`tools/ui_check.py`）

用本机 Edge 的 CDP 做真实交互，覆盖：首页渲染、16 个图案卡片、无横向溢出、
关卡页 4 层纸绘制、**用滑块复现标准解并通关**、评分卡可见、工作室双画布、
导出按钮存在、5 张数学卡片、能力边界表、移动端 390px 布局。

运行方式（必须**同一次 shell 调用**内起浏览器 → 跑脚本 → 收尾，否则进程会被回收）：

```bash
PROF="C:/Users/hfwei/AppData/Local/Temp/edge-prof-foldyssey"
EDGE="/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
rm -rf "$PROF"; mkdir -p "$PROF"
"$EDGE" --headless=new --remote-debugging-port=9231 --user-data-dir="$PROF" \
  --no-first-run --no-default-browser-check --no-proxy-server --disable-gpu about:blank &
for i in $(seq 1 20); do sleep 1; curl -s --noproxy '*' http://127.0.0.1:9231/json/version && break; done
EDGE_ATTACH_PORT=9231 python tools/ui_check.py
```

脚本输出 `PASS/FAIL` 与 `tools/shots/*.png` 截图；退出码 0 表示全通过。

## 3. 设备矩阵

| 视口 | 检查点 |
|---|---|
| 1440×980（桌面） | 双栏布局、评分卡无需滚动可见、无横向溢出 |
| 390×844（手机） | 单栏、导航可横向滚动、画布不超出视口、按钮可点 |
| `prefers-reduced-motion: reduce` | 动画直接到终态，不循环播放 |

## 4. 质量闸门

发布前必须全部为真：

1. `npm run typecheck` 无输出（0 error）。
2. `npm run test` 全绿。
3. `npm run build` 成功。
4. `npx vitest run --coverage` 行覆盖率 ≥ 85%（核心 17 个模块）。
5. `tools/ui_check.py` 全 PASS 且 `console issues: 0`（**需要能启动浏览器的环境**；
   2026-10-31 起本机浏览器启动即退出，该项沿用 v0.6.0 的 45/45，并由结构渲染用例补位）。
6. 线上链接在无痕窗口能打开并完成一关（见 `docs/DEPLOYMENT.md`）。

## 5. 不做的事

- 不把"单元测试通过"当成"页面能用"；两层都要跑。
- 不在没有实际执行的情况下写"全部通过"。
- 不用截图相似度替代几何评分（有可靠几何时）。
