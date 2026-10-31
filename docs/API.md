# 接口说明（模块契约）

> 面向要改代码或复用引擎的人。只列**对外承诺**的导出：签名、前置条件、后置条件与
> 调用方可以依赖的不变量。内部辅助函数不在此列，看 `src/**` 的注释。
> 更新规则：改签名或语义时同步改本文件与 `docs/GEOMETRY_SPEC.md`，并在 `CHANGELOG.md` 记一行。

约定：坐标为「纸坐标」，初始纸为 `P = [-1,1]²`（面积 4），y 轴向上；
多边形一律是 `MultiPolygon = Polygon[] = Ring[][]`，`Ring = {x,y}[]`，
首尾不重复（闭合边隐含），孔洞是同一 `Polygon` 里从第 2 个起的环，
渲染用 `fill-rule="evenodd"`。**函数不修改入参**。

---

## 1. `src/geometry/polygon.ts`

| 导出 | 签名 | 契约 |
|---|---|---|
| `SQUARE` | `Ring` | 初始纸 `[-1,1]²` 的逆时针环；`applyCuts` 的基准纸就是它 |
| `PAPER_AREA` | `number` | 恒为 4 |
| `applyMat` | `(m: Mat, p: Vec2) => Vec2` | 仿射变换 `x' = a·x + c·y + tx`，`y' = b·x + d·y + ty` |
| `ringArea` | `(ring: Ring) => number` | 有符号面积，逆时针为正 |
| `polygonArea` / `multiPolygonArea` | `(p) => number` | 外环面积减各孔面积，结果 ≥ 0 |
| `ringPerimeter` | `(ring) => number` | 闭合周长 |
| `multiPolygonBounds` | `(mp) => Bounds` | 空输入返回全 0 |
| `isFiniteMultiPolygon` | `(mp) => boolean` | 每个环 ≥ 3 点且坐标有限 |
| `cleanRing` / `cleanMultiPolygon` | | 去重相邻点、去零面积片；`minArea` 默认 `1e-9` |
| `unionMP` | `(...list: MultiPolygon[]) => MultiPolygon` | **增量**合并；某个成员让布尔库失败时保留已有累积，不整体清空 |
| `intersectMP` | `(a, b) => MultiPolygon` | 任一为空返回 `[]`；库异常也返回 `[]` |
| `differenceMP` | `(a, b) => MultiPolygon` | 见下方「差集的三条规则」 |
| `xorMP` | `(a, b) => MultiPolygon` | 对称差 |
| `pointInRing` / `pointInMultiPolygon` | `(p, ring/mp) => boolean` | 射线法；孔洞内的点返回 `false` |
| `multiPolygonToPath` | `(mp, opts?) => string` | `mat`/`flipY`/`digits` 可选；每个环一条 `M…Z` |
| `exportPath` | `(mp, size, padding?) => string` | 等比缩放到 `size` 见方、居中、y 翻转 |
| `toClip` / `fromClip` | | 与 `polygon-clipping` 的数据形状互转；`toClip` 丢弃非有限点与 < 3 点的环 |

**差集的三条规则**（`differenceMP`）：

1. `b` 为空 → 返回 `a`（同一引用）；`a` 为空 → `[]`。
2. 一次性相减非空 → 直接用。
3. 一次性相减为空时：只有当 **B 的包围盒包含 A 的包围盒** 且 `area(B) ≥ 0.98·area(A)`
   才判定为「B 覆盖 A」，返回 `[]`；否则逐成员相减，某个成员失败就跳过它。
   逐成员分支必须传 `toClip([poly])`（一个 `MultiPolygon`），不能多套一层。

> 历史坑：规则 3 的第二条曾写成 `[toClip([poly]) as never]`，库拒绝后回退
> 「什么都没减」；包围盒判据是 2026-10-31 补的，之前只看面积，远处的巨大 B
> 会把整张纸清零。回归测试：`src/tests/difference.fallback.test.ts`。

---

## 2. `src/geometry/fold.ts`

| 导出 | 契约 |
|---|---|
| `FOLD_PRESETS` | 5 个预设，顺序：`none` → `vertical` → `horizontal` → `orthogonal2` → `radial8` |
| `getPreset(id)` | 未知 id 回落到 `none`，**不抛异常** |
| `PaperPatch` | `domain`（纸坐标环）、`forward`（domain→packet 的等距）、`inverse = transposeMat(forward)`、`history`、`layer` |
| `patchRenderMatrix(patch, preset, foldedness)` | `0` → 单位阵，`1` → 恰好 `patch.forward`；中间帧按 `history` 顺序复合 |
| `stepProgress` / `foldStepMatrix` | 单步折叠进度与 `M(θ)=cosθ·I+(1−cosθ)·A` |
| `patchesInPaintOrder(preset)` | 按 `layer` 升序，后者覆盖前者 |
| `symmetry` / `layerCount` / `copies` | `none`(1) / `mirror`(2) / `quad`(4) / `octa`(8) |

不变量（有测试）：每个 patch 的 `forward` 是等距且 `transposeMat` 是它的逆；
所有 `domain` 的面积和 = 4；`radial8` 的 8 个扇区恰好铺满正方形一次。

---

## 3. `src/geometry/cut.ts`

### 3.1 类型

```ts
type Cut = LineCut | NotchCut | HoleCut | CurveCut;

LineCut  { kind:'line';  nx, ny; offset; removedSide }        // 半平面 n·p ≷ offset
NotchCut { kind:'notch'; angle; distance; width }              // 从纸包边缘剪入的 V 形
HoleCut  { kind:'hole';  shape:'diamond'|'circle'|'leaf';
                          angle; radius; size; stretch; rotation }  // 闭合超椭圆
CurveCut { kind:'curve'; angle; offset; amplitude; bends:1|2|3; removedSide }
```

- `removedSide` 指法向的正侧 / 负侧；曲线与直线共用同一套 `angle/offset/side` 语义。
- `amplitude = 0` 时曲线**严格等于**同参数直线（纸形差 < 1e-9，有测试）。
- `bends`：1 段弧 / 2 S 形（1 个拐点）/ 3 波浪（2 个拐点）。

### 3.2 函数

| 导出 | 契约 |
|---|---|
| `normalizeCut(cut)` | 校验 + 归一化；结构性非法（NaN、非有限、零法向、非正尺寸）返回 `null`。**可修复的量做截断而不是拒绝**：`bends` 就近取整、`|amplitude| > 1.5` 截到 1.5、非单位法向与 offset 一起归一 |
| `cutFromAngle(deg, offset, side)` | 建直线；`deg` 任意实数 |
| `notchCut` / `holeCut` / `curveCut` | 建对应切口；`curveCut` 会 `clampBends` |
| `changeCutKind(cut, kind)` | 换刀型，保留方向与到中心的距离；同型返回同一引用；转曲线从 `amplitude=0.22` 起（否则屏幕上没有变化） |
| `curveUnderFlippedNormal(cut)` | 同一条曲线、相反法向：角度 +180°、offset 取反、`removedSide` 取反，**amplitude 只在奇数 `bends` 时取反**。供画布旋转手柄使用 |
| `cutAngleDeg(cut)` | 折进 `[0,180)` |
| `describeCut(cut)` | 一句中文参数说明（UI 与测试共用） |
| `holeOutline(cut)` | 闭合环；`size` 是半宽，`stretch` 是高/宽 |
| `notchTriangle(cut)` | 未裁剪的 V 形三角形，底边在纸包外 `NOTCH_REACH=1.4` 处 |
| `sawtoothCuts(preset,count,depth,pitch,phase?)` | 沿纸包边缘生成 `count` 枚菱形 `HoleCut`；`radial8` 覆盖 45°，其余 180° |
| `curvePointAt(preset, cut, t)` | `t ∈ [-1,1]` 的采样点（纸包坐标） |
| `curveSampleCount(cut)` | 由误差界反解，24–192 且为偶数；`|A|=0` 时 2 |
| `curveChordError(cut, samples?)` | `|A|·bends²·π²/(8N²)`，上界 ≤ `CURVE_CHORD_TOLERANCE = 1.2e-3` |
| `visibleStroke(preset, cut)` | 落在纸包内的折线、首末索引、长度、误差；整条在外返回 `null` |
| `removedPacketRegion(preset, cut)` | **纸包坐标**里被剪掉的区域；整条没碰到纸包返回 `[]` |

### 3.3 `applyCuts(presetId, cuts) => CutOutcome`

```ts
type CutOutcome = {
  ok: boolean;              // paper 非空
  patches: { patch; region; removed }[];  // 纸坐标，逐层
  paper: MultiPolygon;      // 展开后剩下的纸
  removed: MultiPolygon;    // 展开后剪掉的纸（八层拼接，互不相交）
  removedPacket: MultiPolygon; // 纸包里被剪掉的区域
  warnings: string[];       // 人话，可直接显示
  emptyPaper: boolean;
};
```

**算法**（2026-10-31 起）：

1. 每刀先 `normalizeCut`，再 `removedPacketRegion`，累积 `removedPacket`（并集）。
2. `survivingPacket = packet \ removedPacket`，只做这一次纸包内的差集。
3. 每层只做等距映射：`region = fᵢ⁻¹(survivingPacket)`、`removed = fᵢ⁻¹(removedPacket)`。
4. 整纸从 `SQUARE` 开始，逐层 `paper ← paper \ removed`；`removed` 直接拼接。

**调用方可依赖**：

- `paper ⊆ P`，`0 ≤ area(paper) ≤ 4`；
- `area(paper) + area(removed) = 4`（逐层拼接，不做并集）；
- 每层 `area(region) + area(removed) = area(domain)`；同一刀在每层剪掉的面积相同；
- 两刀交换顺序不改变 `paper`（IoU > 0.9999）；
- 非法 / 落空的刀不改变纸形，只追加一条 `warnings`，**不抛异常**；
- 相同输入逐字节相同（无随机、无时间依赖）。

---

## 4. `src/geometry/score.ts`

| 导出 | 契约 |
|---|---|
| `scorePaper(actual, target, thresholds?)` | `iou = area(A∩T)/area(A∪T)`；交集为空时用面积恒等式兜底并夹紧；`extra/missing` 是两块差集 |
| `verdict` | `exact ≥ exactIou`（0.995）/ `pass ≥ passIou` / `near ≥ nearIou` / 其余 `miss` |
| `gap` | `max(0, passIou - iou)` |
| `symmetricRatio` | `area(A△T) / 4`，夹到 `[0,1]` |
| `STAGE_THRESHOLDS` | 阶段 1–5：92 / 94 / 96 / 96 / 96 %（`exact` 恒 0.995） |
| `isCleared(verdict)` | `exact` 或 `pass` |
| `formatPercent(x, digits=1)` | `"97.2%"` |

容差契约（有测试）：**任何关卡，任意一个滑块走一格，都不会从「达标」掉到「不达标」**。
2026-10-31 修复布尔运算后实测最差 97.15%（六出）与 97.17%（花窗）。

---

## 5. `src/puzzle/skill.ts`

| 导出 | 契约 |
|---|---|
| `strokeStats(cuts)` | `strokes / corners / inflections / curved / amplitude / closed` |
| `skillOf(cuts)` | 曲线 > 拐弯 > 两刀 > 一刀；镂空不计入升级 |
| `skillRank(skill)` | 1–4 |
| `curveRatio(paper)` | 顶点转角落在 `(0.5°, 20°)` 的边长占比；直线为 0，曲线关 > 0.25 |
| `SKILL_ORDER` / `SKILL_META` / `SKILL_BADGE` | 四级的中文名、判据与边界说明 |
| `CURVE_AMPLITUDE_EPS` | 0.01：低于它按直线计 |

---

## 6. `src/puzzle/levels.ts`

| 导出 | 契约 |
|---|---|
| `LEVELS` | 16 关；模块加载时由 `buildLevel()` **正向构造**目标（跑真实引擎），失败即抛 |
| `getLevel(id)` | 未知 id 返回 `undefined`（页面自己回落） |
| `STAGE_LABEL` / `STAGE_HINT` | 阶段文案 |
| `GOLDEN_LEVEL_ID` | `'diamond'`（首页演示用） |

`PuzzleLevel` 里 `cutCount / cutSummary / skill / curveRatio / target / targetArea / thresholds`
都是**计算出来的**，不要手写。`canonicalCuts` 只用滑块可达的值（角度 0.5°、距离/弯曲 0.01）。

---

## 7. `src/puzzle/assist.ts`

| 导出 | 契约 |
|---|---|
| `STEP` / `FIELD_LABEL` | 每种字段的一格步长与中文名 |
| `applyStep(cut, field, delta, steps=1)` | 返回新切口或 `null`（字段不适用 / 已到边界）；所有值落在滑块的 min/max 内并取整 |
| `diagnose(cuts, fold, target, thresholds, focusIndex?)` | 粗到细 ×1/×4/×16 搜索单字段改善；`nudge` 只在 `gain > 5e-4` 时给出；一次调用的成本上界是 `3×2×字段数×刀数` 次几何求值 |
| `applyNudge(cuts, nudge)` | 幂等：同一个 `delta` 再应用一次结果不变 |

---

## 8. `src/services/*`

### export.ts

| 导出 | 契约 |
|---|---|
| `buildSvg(paper, style)` | 1000×1000，`fill-rule="evenodd"`，标题做 XML 转义 |
| `artworkPath(paper)` | 等比缩放到 888×888、居中、padding 56 |
| `downloadSvg` / `downloadPng` | 触发浏览器下载并**返回文件名**；PNG 走 `canvas.toBlob`，没有 2D context 时抛「不支持 Canvas」 |
| `slugify` / `fileName` / `timestamp` | 中文标题回落到 `papercut`；`foldyssey-<slug>-YYYYMMDD.<ext>` |

### storage.ts

| 导出 | 契约 |
|---|---|
| `loadArtworks` | 过滤坏文档、按 `updatedAt` 降序、v1 文档读成当前 `schemaVersion`；JSON 坏了返回 `[]` |
| `saveArtwork` / `deleteArtwork` | 返回 `{ok, error?}`；配额错误与「浏览器拒绝」给出不同人话 |
| `loadProgress` / `recordAttempt` / `resetProgress` | `attempts` 递增，`bestIou` 取最大，`cleared` 一旦为真不会回退 |
| `nextUnclearedIndex(ids)` | 第一个未通关的索引；全通关返回 0 |
| `makeId` | `art-<base36 时间>-<8 位随机>` |

> 读取**不依赖写入探测**：配额满时 `loadArtworks` 仍然能读出已有作品（2026-10-31 修复）。

### draft.ts（AI → 工坊）

`saveAiDraft` / `takeAiDraft`：`sessionStorage`，读取即清空；坏数据返回 `null`。

---

## 9. `src/ai/*`

### client.ts

```ts
generateDesign(input: string): Promise<AiResult>
// 成功：{ ok:true, design, cuts, paper, keepRatio, warnings, modelId, elapsedMs, attempt, usage? }
// 失败：{ ok:false, failure:{ kind, message, retryable, detail? } }
```

| 约束 | 值 |
|---|---|
| 输入 | 去控制字符、裁到 120 字；少于 4 字直接 `input` 错误，不联网 |
| 并发 | 同时只允许一个请求，第二个返回 `busy` |
| 间隔 | 5 秒；会话上限 12 次（`sessionStorage`，坏数据按 0 次算） |
| 超时 | 30 秒（`AbortController`） |
| 模型 | 目录里优先 `glm-5.3-flash` → `glm-5.3` → `hy3` → `default`，否则第一个未禁用 |
| 重试 | 只有「JSON 解析失败」重试一次（低温 + 修复指令）；schema 偏差由 `normalizeDesign` 就地修复，不重试 |

`failure.kind`：`input | busy | rate | timeout | network | auth | quota | model | invalid`。
`message` 是给人看的一句话（≤ 100 字，不含栈帧）；原始错误放 `detail`，UI 折叠显示。

### schema.ts

| 导出 | 契约 |
|---|---|
| `normalizeDesign(raw, prompt)` | 把不可信的模型输出强制转成合法设计：未知键丢弃、主题映射、枚举回落、数值夹紧、发丝元素补齐；永不抛异常 |
| `parseDesignJson(text)` | 容忍代码块与前后废话；找不到 JSON 对象时抛 |
| `sanitizeText(s, max)` | 去控制字符、裁长 |
| `describeDesign(design)` | 给 UI 的一句摘要，不算几何 |

模型只决定**参数**；`paper` 始终由 `applyCuts` 计算（单一可信源）。
