# 架构（ARCHITECTURE）

## 1. 分层

```
┌──────────────────────────────────────────────────────────┐
│ pages/           Home / Puzzle / Studio / Gallery /      │
│                  Explore / About      （路由与页面状态）  │
├──────────────────────────────────────────────────────────┤
│ components/      PaperStage（SVG 渲染器）· MiniPattern ·  │
│                  Formula（构建期 SVG）· Toast             │
├──────────────────────────────────────────────────────────┤
│ ai/              schema（zod）· prompt · client · draft    │
│                  （懒加载 chunk，不进首屏 bundle）          │
├──────────────────────────────────────────────────────────┤
│ services/        storage（localStorage）· export（SVG/PNG）│
├──────────────────────────────────────────────────────────┤
│ puzzle/          levels（目标由标准解正向生成）· progress  │
├──────────────────────────────────────────────────────────┤
│ geometry/        fold · cut · polygon · score · clip      │
│                  （纯函数，不依赖 React / DOM）            │
└──────────────────────────────────────────────────────────┘
```

**依赖方向只能向下。** `geometry/` 不 import 任何上层模块，也不接触 DOM，
因此可以在 Node 里直接跑单元测试（`environment: 'node'`）。

**构建期产物**：`tools/formulas.source.mjs`（LaTeX）→ `npm run build:formulas` →
`src/content/formulas.generated.ts`（MathJax 编译出的自包含 SVG）。浏览器端没有
排版引擎、没有数学字体；产物入库，源文件哈希由测试守住。详见 `docs/MATH_RENDERING.md`。

## 2. 单一可信源

`geometry` 计算出的 `CutOutcome` 是唯一事实来源：

```
CutOutcome = {
  patches: [{ patch, region, removed }],   // 每层的纸形与剪掉的碎片
  paper,        // 展开后的并集
  removed,      // 展开后所有碎片
  removedPacket,// 纸包上被剪掉的那一块（预剪预览用）
  warnings, emptyPaper
}
```

渲染层（`PaperStage`）只做三件事：把 `region` 乘以折叠矩阵变成路径字符串、
按 `foldedness` 插值相机、叠加提示层。它**不会**为动画修改 `paper`。
评分层对 `outcome.paper` 与 `level.target` 做布尔运算，不看屏幕像素。

## 3. 关键数据流：一次剪切

```
用户拖动切线
  └─ setCut(Cut)                               （pages/PuzzlePage）
       └─ useMemo applyCuts(preset, cuts)      （geometry/cut）
            ├─ removedPacketRegion()          半平面 / V 形 / 超椭圆 / 高度场 ∩ 纸包
            ├─ surviving = packet \ D          纸包内只做这一次差集
            ├─ regionᵢ = fᵢ⁻¹(surviving)       每层只做等距映射
            └─ paper = SQUARE \ removed₁ \ … \ removedₙ
       └─ <PaperStage outcome={...} foldedness={...} />
            ├─ patchRenderMatrix()  折叠插值
            ├─ multiPolygonToPath() 路径生成
            └─ 相机 packetView()    折叠时推近
```

评分只在 `phase === 'revealed'` 时执行一次，写入 localStorage 的进度表。

## 4. 状态机（关卡页）

```
ready ──fold──▶ folding ──▶ folded ──cut──▶ cutting ──▶ cut
  ▲                             ▲                         │
  │                             └──────── retry ──────────┤
  └──────────── fold ─────────── revealed ◀── unfolding ◀─┘
```

约束：
- 所有转移用**函数式 setState 并检查当前态**（`p => p === 'cut' ? 'unfolding' : p`），
  避免动画回调与用户操作竞争。
- `剪一刀` 在 `ready/folding/folded` 都可用：会先把折叠度吸附到 1 再剪，
  避免"进关后有一秒点不动"的死区。
- 用 `useAnimatedValue`（rAF）驱动 `foldedness`，它不属于 React 状态机，
  只影响渲染；卸载时取消动画。

## 5. 相机与坐标系

`PaperStage` 的 `viewBox` 是**动态**的：`foldedness → 1` 时平滑推近到纸包。
因为绘制组带 `scale(1,-1)`，`viewBox` 的 y 中心必须取数学坐标中心的相反数
（`packetView()` 里有显式注释）。指针坐标也用当前 `viewBox` 反算
（`toMath`，存于 `viewRef`），否则折叠放大后拖拽会漂移。

## 6. AI 层（v0.2.0 新增）

```
pages/AiPage（懒加载）
  └─ ai/client.generateDesign()
       ├─ 输入清洗（120 字、去控制字符）
       ├─ 限流（单飞 / 5s 间隔 / 会话 12 次）
       ├─ cloud.llm.models.list()  → 挑一个可用模型（带缓存）
       ├─ chat.completions.create({ stream: true, response_format: json_object })
       └─ 累积 SSE → JSON.parse → ai/schema.normalizeDesign()
            ├─ zod .strict()：未知字段/枚举/越界 → 拒绝
            ├─ motifToCut()：尺寸/角度 → 直线切割参数
            ├─ applyCuts()：真实几何 → paper / keepRatio
            └─ 确定性修复：剪光了就丢最后一刀，仍不行回退中心菱形
       └─ 失败：按 error.code 前缀映射成人话（auth_/quota_/gateway_/…）
```

三条硬约束：

1. **模型不画图**。它只输出参数；渲染、评分、导出仍走 `geometry/`。
2. **不阻塞核心**。AI 页是独立 chunk，用 `React.lazy` + `Boundary` 包裹；
   chunk 加载失败或模型不可用，挑战/工坊/作品集照常工作。
3. **交接只传参数**。`ai/draft.ts` 把 `{foldPreset, cuts, style, title}` 放进
   `sessionStorage`，工坊打开时重新用几何引擎算一遍——工坊仍是唯一可信源。

## 7. 存储

- `foldyssey.artworks.v1`：作品数组（`schemaVersion: 1`）。
- `foldyssey.progress.v1`：关卡进度（attempts / bestIou / cleared）。
- `foldyssey.ai.usage.v1`：AI 限流计数（sessionStorage，关标签页即清空）。
- 全部为浏览器本地存储，读写包在 try/catch 中；配额错误返回可读文案。
- 作品只存**结构化参数**（折叠预设 + 切口 + 配色），打开时重新计算，
  不缓存图片。

## 8. 为什么没有后端

零账号、零网络请求（AI 页除外）是产品决策（见 ADR-0005）：首屏无需等待、断网可玩、
没有隐私面。AI 走平台托管的关键字免密通道，因此也不需要自建服务端。
代价是作品不跨设备，已用「导出 SVG/PNG」缓解。

## 9. 为什么没有物理引擎 / Three.js

见 ADR-0001、ADR-0002：一刀剪切的结果是**平面集合**，与纸张刚度、厚度、
重力无关；引入物理引擎只会增加风险而不提升数学正确性。折叠观感用二维插值
（沿折痕把一侧压到 0 再翻到另一侧）已足够表达"折叠"这一动作。

## 10. 可扩展点

| 想加什么 | 改哪里 | 注意 |
|---|---|---|
| 新的折叠预设 | `geometry/fold.ts` 的 `FOLD_PRESETS` | 必须给出片区划分、每层变换、无穿透说明 |
| 新的关卡 | `puzzle/levels.ts` 的 `SEEDS` | 目标必须由标准解生成；标准解须能被 UI 控件精确取到 |
| 曲线/多次剪切 | `cut.ts` 增加 `Cut` 联合类型 | 会破坏"一刀"语义，需在 UI 明确标注 |
| 运行时 AI | 新增 `src/ai/` + 服务端代理 | 见 `docs/AI_INTEGRATION.md`，密钥绝不进前端 |
