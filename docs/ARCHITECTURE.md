# 架构（ARCHITECTURE）

## 1. 分层

```
┌──────────────────────────────────────────────────────────┐
│ pages/           Home / Puzzle / Studio / Gallery /      │
│                  Explore / About      （路由与页面状态）  │
├──────────────────────────────────────────────────────────┤
│ components/      PaperStage（SVG 渲染器）· MiniPattern ·  │
│                  Toast                                   │
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
  └─ setCut(StraightCut)                       （pages/PuzzlePage）
       └─ useMemo applyCuts(preset, [cut])     （geometry/cut）
            ├─ removedPacketRegion()          半平面 ∩ 纸包
            ├─ fᵢ⁻¹(D) 逐层求差集              polygon/clip
            └─ union(regionᵢ) → paper
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

## 6. 存储

- `foldyssey.artworks.v1`：作品数组（`schemaVersion: 1`）。
- `foldyssey.progress.v1`：关卡进度（attempts / bestIou / cleared）。
- 全部为 localStorage，读写包在 try/catch 中；配额错误返回可读文案。
- 作品只存**结构化参数**（折叠预设 + 切口 + 配色），打开时重新计算，
  不缓存图片。

## 7. 为什么没有后端

零账号、零网络请求是产品决策（见 ADR-0005）：首屏无需等待、断网可玩、
没有隐私面。代价是作品不跨设备，已用「导出 SVG/PNG」缓解。

## 8. 为什么没有物理引擎 / Three.js

见 ADR-0001、ADR-0002：一刀剪切的结果是**平面集合**，与纸张刚度、厚度、
重力无关；引入物理引擎只会增加风险而不提升数学正确性。折叠观感用二维插值
（沿折痕把一侧压到 0 再翻到另一侧）已足够表达"折叠"这一动作。

## 9. 可扩展点

| 想加什么 | 改哪里 | 注意 |
|---|---|---|
| 新的折叠预设 | `geometry/fold.ts` 的 `FOLD_PRESETS` | 必须给出片区划分、每层变换、无穿透说明 |
| 新的关卡 | `puzzle/levels.ts` 的 `SEEDS` | 目标必须由标准解生成；标准解须能被 UI 控件精确取到 |
| 曲线/多次剪切 | `cut.ts` 增加 `Cut` 联合类型 | 会破坏"一刀"语义，需在 UI 明确标注 |
| 运行时 AI | 新增 `src/ai/` + 服务端代理 | 见 `docs/AI_INTEGRATION.md`，密钥绝不进前端 |
