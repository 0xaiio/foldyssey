# Foldyssey · 一刀万象

> **Fold. Snip. Unfold. Wow!**
> 一张纸，千种可能；一把剪刀，万象展开。

Foldyssey 是一座可以玩的数字折剪纸实验室：选一种折叠、拖动一条切线、只剪一刀，
程序用真实几何运算算出展开后的纸，而不是播放预制动画。

- **在线体验**：见 [submission/publish_verification.md](submission/publish_verification.md)（发布后填写）
- **技术栈**：React 18 + TypeScript + Vite + SVG + `polygon-clipping` + `zod` +
  `@tencent-ai/workbuddy-cloud-sdk`（运行时模型）+ Vitest
- **定位**：WorkBuddy「1024 造物挑战」参赛作品 · v0.7.3

---

## 它到底在算什么

纸张 `P = [-1,1]²` 被折叠划分成若干片区 `Pᵢ`，每个片区用一个保距变换 `fᵢ` 映到折叠后的纸包。
一刀直线只剪掉纸包上的一个半平面 `D`，每层纸各自失去 `fᵢ⁻¹(D)`：

```
S = ⋃ᵢ ( Pᵢ \ fᵢ⁻¹( D ∩ fᵢ(Pᵢ) ) )
```

`S` 就是展开后剩下的纸。渲染、评分、SVG 导出全部从这份几何数据来。
完整定义见 [docs/GEOMETRY_SPEC.md](docs/GEOMETRY_SPEC.md)。

---

## 已实现（v0.7.3）

| 能力 | 状态 |
|---|---|
| 五种折叠预设：不折 / 竖折 / 横折 / 正交双折 / **团花八折（D4，8 层）** | 已实现并测试 |
| 四种切割原语：**直线**（半平面）/ **折剪**（V 形）/ **镂空**（闭合孔）/ **曲线**（弧线 · S 形 · 波浪）；**锯齿边**由沿边缘排布的菱形镂空生成 | 已实现并测试 |
| **曲线剪**：刀在纸里连续转向，`amplitude = 0` 时与同参数直线剪严格等价；折线逼近的误差有闭式上界（≤ 1.2×10⁻³，纸宽 2），目标与作答同源采样 | 已实现并测试 |
| **「剪刀能力」四级**：一刀 / 两刀 / 拐弯 / 曲线，级位与「曲边占比」都由几何计算，界面不会自称做不到的事 | 已实现并测试 |
| **公式**：8 条 LaTeX 在构建期编译成自包含 SVG（字形转路径），不依赖数学字体、无运行时；`currentColor` 跟随主题 | 已实现并测试 |
| **16 个由正向构造生成的原创图案**（5 个阶段：看懂 / 对齐 / 叠加 / 典藏 / 让刀转弯），每关都有可复现的标准解 | 已实现并测试 |
| **图案库**：3 列卡片 + 常驻详情面板，展示折叠结构 / 切割逻辑 / 展开效果 | 已实现并测试 |
| 几何评分（IoU 四档判定、按阶段容差、差异覆盖可视化） | 已实现并测试 |
| **「差在哪？」诊断 + 实时展开对照**：告诉玩家调哪个滑块，边拖边看差异 | 已实现并测试 |
| 剪纸工坊（最多 3 条切口，**四种刀型可随时切换**，配色、撤销/重做、实时双视图） | 已实现 |
| SVG / PNG 导出、localStorage 作品集 | 已实现 |
| 折叠 / 剪切 / 展开动画、移动端触控 | 已实现 |
| **AI 灵感设计师**：一句话 → 受约束的设计参数 → 真实图案（八折 / 花瓣 / 镂空 / 锯齿） | 已实现并线上验证 |
| 运行时大模型的密钥暴露 | 无：走 WorkBuddy 云服务，前端只有可公开的 endpoint 与 publishableKey |

**能力边界**：只支持五种固定折叠；切割覆盖**直线 / 折线 / 多边形 / 单值曲线**，
但**不支持自交、回头、闭环的开口剪**（闭环请用「镂空」），曲线是正弦弧而非真圆弧；
不支持任意斜折、任意目标图案的自动求解、纸张物理形变仿真；不提供经核验的可打印实体模板。
详见 `docs/SCISSOR_CURVES.md` §6。
AI 只挑选参数，不生成图片；越界的枚举与数值会被映射或收边，只有"什么都没给"才算失败。

---

## 宣传视频

3 分 29 秒的 1024 参赛片在 `video/`：`out/Foldyssey-1024.mp4`（1080p30，硬字幕，
男声旁白、无配乐）、`out/Foldyssey-cover-1146x717.png`（B 站封面）。

本机没有可用的浏览器（Edge / Chromium 启动即退出），所以它**不是录屏**：几何从
`applyCuts()` 真实导出，画面用 Pillow 逐帧绘制，折叠动画与 `src/geometry/fold.ts`
逐行对应；旁白由文稿逐句合成（Edge 神经男声），场景长度由音频长度决定，全片只有人声。
一条命令链重做全片，见 [`video/README.md`](video/README.md)。

## 快速开始

```bash
npm install          # Node >= 18
npm run dev          # 本地开发 http://127.0.0.1:5173
npm run test         # 几何 / 关卡 / 判定 / 诊断 / AI / 导出 / 公式 / 结构渲染（214 passed）
npx vitest run --coverage   # 核心 17 个模块：行 96.7% / 分支 87.9% / 函数 95.1%
npm run build:formulas      # 改了公式 LaTeX 源后重新生成 SVG
npm run typecheck    # tsc --noEmit
npm run build        # 生产构建到 dist/
npm run preview      # 预览生产包
```

真实模型调用（会消耗一次额度）：

```bash
FOLDYSSEY_LIVE_AI=1 npx vitest run src/tests/ai.live.test.ts
```

浏览器级验证（需本机 Edge）：

```bash
python tools/ui_check.py    # 需先按 docs/TESTING.md 启动 Edge 调试端口
```

> 2026-10-31 起本机浏览器启动即退出，`ui_check.py` 停在 v0.6.0 的 45/45；
> 之后由 28 个 `react-dom/server` 结构渲染用例补位（渲染成功、路径无 `NaN`、
> 关键文案与引擎一致）。覆盖率的统计口径见 `docs/TESTING.md` §1.6。

---

## 目录

```
src/geometry/   纸张模型、折叠、切割、布尔运算、评分（纯函数，无 React）
src/puzzle/     关卡数据、诊断、剪刀能力分级（目标由标准解正向生成）
src/ai/         运行时模型客户端、schema 校验/修复、提示词、模板
src/components/ SVG 画布、图案库、分级条、Toast
src/pages/      首页 / 关卡 / 工坊 / 作品 / 数学 / 关于 / AI 灵感
src/content/    公式的生成产物（LaTeX 源在 tools/formulas.source.mjs）
src/services/   本地存储、SVG/PNG 导出
src/app/        哈希路由与外壳
src/tests/      单元 + 结构渲染 + 审查回归（199 个用例）
docs/           规格、接口、几何、测试、审查、发布、安全、ADR
submission/     参赛材料
tools/          浏览器端验证脚本与截图
```

---

## 已知限制

1. 只有五种折叠预设（不折 / 竖折 / 横折 / 正交双折 / 八折），目标形状库受此约束（见 `docs/GEOMETRY_SPEC.md` §10）。
2. 折叠动画是**端点精确的二维步骤化示意**，不是纸张物理仿真。
3. 作品只存在浏览器 localStorage，清缓存即丢失（可导出 SVG 长期保存）。
4. AI 灵感页需要联网，且受客户端限流（5 秒 / 次，每会话 12 次）；核心玩法不依赖它。
5. 未提供经核验的可打印实体折剪模板，所有作品标注为「未核验」或「数字图案」。

## 许可

仓库尚未选择开源许可证，版权归作者所有。第三方依赖许可见
[submission/references_licenses.md](submission/references_licenses.md)。
