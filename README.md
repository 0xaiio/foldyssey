# Foldyssey · 一刀万象

> **Fold. Snip. Unfold. Wow!**
> 一张纸，千种可能；一把剪刀，万象展开。

Foldyssey 是一座可以玩的数字折剪纸实验室：选一种折叠、拖动一条切线、只剪一刀，
程序用真实几何运算算出展开后的纸，而不是播放预制动画。

- **在线体验**：见 [submission/publish_verification.md](submission/publish_verification.md)（发布后填写）
- **技术栈**：React 18 + TypeScript + Vite + SVG + `polygon-clipping` + `zod` +
  `@tencent-ai/workbuddy-cloud-sdk`（运行时模型）+ Vitest
- **定位**：WorkBuddy「1024 造物挑战」参赛作品 · v0.5.0

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

## 已实现（v0.5.0）

| 能力 | 状态 |
|---|---|
| 五种折叠预设：不折 / 竖折 / 横折 / 正交双折 / **团花八折（D4，8 层）** | 已实现并测试 |
| 四种切割原语：**直线**（半平面）/ **折剪**（V 形）/ **镂空**（闭合孔）/ **锯齿**（边缘齿排） | 已实现并测试 |
| 6 个由正向构造生成的原创关卡（3 关一刀直线 + 3 关八折团花），每关都有可复现的标准解 | 已实现并测试 |
| 几何评分（IoU 四档判定、按阶段容差、差异覆盖可视化） | 已实现并测试 |
| **「差在哪？」诊断 + 实时展开对照**：告诉玩家调哪个滑块，边拖边看差异 | 已实现并测试 |
| 剪纸工坊（最多 3 条切口，可编辑直线 / 折剪 / 镂空，配色、撤销/重做、实时双视图） | 已实现 |
| SVG / PNG 导出、localStorage 作品集 | 已实现 |
| 折叠 / 剪切 / 展开动画、移动端触控 | 已实现 |
| **AI 灵感设计师**：一句话 → 受约束的设计参数 → 真实图案（八折 / 花瓣 / 镂空 / 锯齿） | 已实现并线上验证 |
| 运行时大模型的密钥暴露 | 无：走 WorkBuddy 云服务，前端只有可公开的 endpoint 与 publishableKey |

**能力边界**：只支持五种固定折叠；切割是直线 / 折线 / 多边形，**没有曲线**，
因此做不出真实窗花那种连绵的曲线花瓣；不支持任意斜折、任意目标图案的自动求解、
纸张物理形变仿真；不提供经核验的可打印实体模板。
AI 只挑选参数，不生成图片；越界的枚举与数值会被映射或收边，只有"什么都没给"才算失败。

---

## 快速开始

```bash
npm install          # Node >= 18
npm run dev          # 本地开发 http://127.0.0.1:5173
npm run test         # 几何 / 关卡 / 判定 / 诊断 / AI 校验单元测试（81 passed）
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

---

## 目录

```
src/geometry/   纸张模型、折叠、切割、布尔运算、评分（纯函数，无 React）
src/puzzle/     关卡数据（目标由标准解正向生成）
src/studio/     工坊参数（当前以页面内常量形式组织）
src/components/ SVG 纸张渲染器、缩略图、Toast
src/pages/      首页 / 关卡 / 工坊 / 作品 / 数学 / 关于
src/services/   本地存储、SVG/PNG 导出
src/tests/      几何、关卡、导出的单元测试
docs/           规格、架构、几何、测试、发布、安全、ADR
submission/     参赛材料
tools/          浏览器端验证脚本与截图
```

---

## 已知限制

1. 只有四种折叠预设，目标形状库受此约束（见 `docs/GEOMETRY_SPEC.md` §6）。
2. 折叠动画是**端点精确的二维步骤化示意**，不是纸张物理仿真。
3. 作品只存在浏览器 localStorage，清缓存即丢失（可导出 SVG 长期保存）。
4. AI 灵感页需要联网，且受客户端限流（5 秒 / 次，每会话 12 次）；核心玩法不依赖它。
5. 未提供经核验的可打印实体折剪模板，所有作品标注为「未核验」或「数字图案」。

## 许可

仓库尚未选择开源许可证，版权归作者所有。第三方依赖许可见
[submission/references_licenses.md](submission/references_licenses.md)。
