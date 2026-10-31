# 代码审查报告 · 2026-10-31（v0.7.3）

> 范围：`src/` 全部 8 992 行（17 个核心模块 + 7 个页面 + 7 个组件）、`tools/`、`docs/`、
> 测试与投稿材料。方法：逐文件静态审查 → 用真实引擎做性质测试（不是读代码猜）→
> v8 覆盖率统计 → 纯 Python 光栅化核对 16 关目标形状。
> 环境限制：本机 Edge / Chromium 启动即退出（见 `TEST_REPORT.md`），**没有做浏览器级
> 像素与交互回归**；改用 28 个 `react-dom/server` 结构渲染用例替代，结论中已标注。

## 1. 结论

**数学层：修掉 4 个缺陷后，可以认为正确。** 其中 3 个会"静默算错"——不抛异常、
不改变 UI 提示，只是让某一层纸少剪或多留，肉眼很难从单张图看出来：

- 同一刀写成相反法向，纸面 2.2108 vs 2.6581；
- 团花关 `paper + removed` = 3.9314（应为 4，少了一整层）；
- `differenceMP` 的逐成员回退分支实际什么都没减。

修复后，16 关的不变量（`paper ⊆ P`、面积守恒、逐层等面积、切口可交换）全部成立，
容差契约（一格滑块不判失败）在修复后仍然成立，最差 97.15%。

**交互层：整体已经可用，没有发现阻断性缺陷。** 修复了 4 个体验问题（R-04 曲线拖拽
镜像算在半数上、R-05 配额满时作品集被清空、R-06 AI 错误文案泄漏路径、R-07/R-08
创作台角度范围与拖拽舍入）；其余 3 个是文案与版本一致性（R-09 ~ R-11）。
连同数学层的 4 个，共 11 个问题，全部已修复；另有 7 条已知限制明确不改（见 §2.2）。

**工程层：核心模块行覆盖率 96.73%，分支 87.89%，函数 95.06%**（17 个模块，3 184 条语句），
超过 85% 的目标；新增 5 个测试文件、87 个用例，测试总数 112 → 199（10 个文件，9 个默认运行）。

## 2. 问题清单

严重度：P0 = 结果错误且用户可触发；P1 = 结果错误但触发条件窄 / 体验明显受损；
P2 = 一致性问题；P3 = 文案。

| ID | 级别 | 位置 | 问题 | 证据 | 状态 |
|---|---|---|---|---|---|
| R-01 | **P0** | `geometry/cut.ts` `applyCuts` | 逐片区做交集 / 差集；当切口边缘与片区边界精确重合时，布尔库返回空结果，**那一层被当成没剪**。同一刀写法不同 → 纸不同 | 曲线取反法向：纸面 2.2108 vs 2.6581；团花 `paper+removed` = 3.9314 | 已修复 |
| R-02 | **P0** | `geometry/polygon.ts` `differenceMP` | 回退分支把 `ClipMulti` 多套一层（`[toClip([poly]) as never]`），库拒绝，回退"什么都没减" | 注入失败后 `A\B` 面积 2（应为 1），见 `difference.fallback.test.ts` | 已修复 |
| R-03 | P1 | `geometry/polygon.ts` `differenceMP` | 判断"B 覆盖 A"只看面积，远处面积更大的 B 会把整张纸清零 | 包围盒不相交、面积 100 的 B，`A\B` 返回 `[]` | 已修复 |
| R-04 | P1 | `components/PaperStage.tsx` | 曲线旋转手柄越过中线时无条件 `amplitude = -amplitude`；偶数 `bends`（S 形）会把弯的方向镜像 | S 形关：IoU 0.37（应为 1） | 已修复 |
| R-05 | P1 | `services/storage.ts` | `getStore()` 用一次**写入探测**判断可用性；配额满时探测抛异常 → 返回 `null`，于是"存储满"被报成"浏览器不支持"，且**已有作品全部读不出来** | 配额错误信息错误，画廊空 | 已修复 |
| R-06 | P1 | `ai/client.ts` `mapError` | 兜底错误把原始错误文本（可能含路径/栈帧）直接拼进给用户的一句话 | `生成失败：Error: secret at /home/user/...` | 已修复 |
| R-07 | P2 | `pages/StudioPage.tsx` | 八折纸包的楔形只有 45°，但直线 / 曲线角度滑块用 0–179；新增切口固定 +45°，会落到滑块范围外（显示被夹紧） | 读代码 + 结构渲染 | 已修复 |
| R-08 | P2 | `components/PaperStage.tsx` | 拖拽写入的角度是任意实数，滑块显示的是取整值；状态与读数最多差 0.25°，下一次按键会跳 | 读代码 | 已修复 |
| R-09 | P3 | `components/PatternLibrary.tsx` | 标题仍写「十一个图案，四段递进」（实际 16 / 5） | 结构渲染 | 已修复 |
| R-10 | P3 | `puzzle/levels.ts`、`docs/PATTERNS.md` | 藻井「12 个孔洞、40 段轮廓」（实测 316 顶点）；六出「4 种固定折法」且漏第三作者 Anna Lubiw；葫芦关仍写「瓶身」；万象团花「轴线上 的」多一个空格 | 探针统计 + 渲染 | 已修复 |
| R-11 | P3 | `README.md`、`AboutPage`、`package.json` | 版本号三处不一致：v0.6.0 / v0.7.1 / 0.1.0 | grep | 已修复（统一 v0.7.3） |

### 2.1 R-01 的细节（本轮最重要）

原实现：

```ts
state = patches.map(entry => {
  const hole = transform(removedPacket, entry.patch.inverse);
  return {
    region:  difference(entry.region, hole),      // ← 每层一次布尔运算
    removed: union(entry.removed, intersect(hole, entry.patch.domain)),
  };
});
```

当 `hole` 的某条边恰好落在 `domain` 的边上（曲线贴边、八折的轴线切口、
"相反法向"的等价写法都会造成），`polygon-clipping` 对其中两层返回空交集。
`differenceMP` 的回退分支（R-02）又减不掉，于是这两层保留完整纸面。
错误不会抛异常，也不会写 warning。

新实现（`docs/GEOMETRY_SPEC.md` §5.1）：

```
surviving = packet \ D                    // 纸包内只减一次
region_i  = fᵢ⁻¹(surviving)               // 每层只做等距映射
paper     = SQUARE \ removed_1 \ … \ removed_n   // 逐层相减
removed   = removed_1 ⧺ … ⧺ removed_n     // 拼接，不并集
```

实测：23°/0.34 的直线刀，八份 `removed` 先并集再相减会丢掉一整层
（0.3352 vs 0.3831），逐层相减精确。

### 2.2 明确不改的已知限制

| ID | 限制 | 原因 |
|---|---|---|
| A-01 | `differenceMP` 的「B 覆盖 A」仍是启发式（包围盒 + 98% 面积） | 真正的覆盖判定需要再跑一次布尔运算，而这条路径本来就在布尔运算失败时才进入。生产路径里 A 恒为整张纸、B 已裁到纸包内，该启发式不会误判 |
| A-02 | 曲线完全贴在纸包边界时，`removedPacketRegion` 仍可能返回空并提示「没有碰到」 | 需要换一个能处理精确重合边的布尔引擎；当前用容差与测试规避 |
| A-03 | 创作台每次 `keydown` 都压一次撤销快照（包括 Tab） | 只影响撤销栈深度（上限 50），不影响结果 |
| A-04 | AI 失败面板对 `rate` 也显示「重试」 | 点了只会再收到同一条提示；不影响正确性，属于文案与按钮策略 |
| A-05 | `symmetricRatio` 分母固定为 4 | 它的定义就是「占整张纸的比例」，不是 IoU；文档已写明 |
| A-06 | 没有真六折 | 正方形无法折出 6 重旋转对称；「六出」明确标注为八折近似 |
| A-07 | AI schema 不含曲线元素 | 刻意收敛：曲线参数空间大，先观察真人怎么调 |

## 3. 测试与覆盖率

### 3.1 统计范围（这是"85%"的分母）

`vite.config.ts` 的 `test.coverage.include` 明确列了 17 个文件：

| 组 | 文件 | 为什么算核心 |
|---|---|---|
| 几何 | `geometry/{vec,clip,polygon,fold,cut,score}.ts` | 决定纸形、切口与评分的全部数学 |
| 谜题 | `puzzle/{levels,assist,skill}.ts` | 关卡目标的正向构造、诊断、分级 |
| AI | `ai/{schema,prompt,draft,templates,client,cloudConfig}.ts` | 模型输出的校验/修复与运行时调用 |
| 服务 | `services/{export,storage}.ts` | 导出与本地持久化 |

**不计入**：`src/pages/**`、`src/components/**`、`src/app/**`、`src/hooks/**`、`src/main.tsx`。
原因：这些文件的"行"主要是 JSX 标记，行覆盖率会被无语义的分支稀释，不能反映行为覆盖。
它们由 28 个结构渲染用例覆盖（App + 7 个页面 + 16 关 + 兜底路由），
断言"能渲染、路径无 NaN、关键文案与引擎一致、分级条唯一当前档"。

### 3.2 结果（`npx vitest run --coverage`，2026-10-31）

| 指标 | 结果 | 目标 |
|---|---|---|
| 语句 / 行 | **96.73%**（3 080 / 3 184） | ≥ 85% |
| 分支 | **87.89%**（900 / 1 024） | — |
| 函数 | **95.06%**（154 / 162） | — |

逐文件（行覆盖率）：`cut 97.89`、`polygon 100`、`fold 100`、`score 100`、`vec 100`、
`clip 100`、`levels 99.30`、`skill 100`、`assist 91.93`、`client 95.83`、`schema 91.40`、
`prompt 100`、`draft 100`、`templates 100`、`cloudConfig 100`、`export 100`、`storage 97.27`。
最低的 `schema.ts` 也有 91.4%。

### 3.3 新增用例（87 个，测试总数 112 → 199）

| 文件 | 数量 | 针对的风险 |
|---|---|---|
| `core.review.test.ts` | 20 | 片区恒等式、逐层等面积、切口可交换、法向翻转、布尔运算恒等式、向量/多边形辅助、D4 对称审计 |
| `difference.fallback.test.ts` | 4 | R-02 / R-03：注入布尔失败，验证回退真的减、远处大 B 不清纸 |
| `ai.client.test.ts` | 18 | 配额、5 秒间隔、12 次上限、并发 busy、模型目录空/全禁用、两次 JSON 重试、9 类错误映射、原始错误不进 headline |
| `services.test.ts` | 17 | SVG/PNG 导出、XML 转义、中文文件名回落、存储配额/损坏/升级、进度合并、草稿往返 |
| `pages.smoke.test.tsx` | 28 | App + 7 页渲染、16 关路径无 NaN、未知关卡兜底、分级条唯一当前档、导航是真实链接 |
| 既有 `geometry/ai/assist/ui` | +20 | 随语义变化更新（新增 3 条断言：法向翻转、片区恒等式、v0.7.3） |

> `assist.test.ts` 的 34 秒来自"6 次一键微调必须通关"的搜索成本，不是产品路径
> （产品路径都带 `focusIndex`，实测 2–216 ms）。

## 4. 界面与交互审查

**做得对的**（保留）：

- 设计令牌统一（纸白 / 朱砂 / 金 / 青），`:focus-visible` 全局可见，`prefers-reduced-motion`
  下动画降到 0.001 ms；
- 关卡页四步说明、分级条、曲线读数、差异图例互相印证，按钮文案与滑块状态同源；
- 画布 `touch-action: pan-y` + 手柄 `touch-action: none`，手机能滚动也能拖手柄；
- 切口标签页有 `role="tablist"/tab/aria-selected`，诊断与评分有 `role="status"`。

**本轮修掉的体验问题**：R-05（作品集被清空）、R-04（S 形拖拽镜像）、R-07（新增切口越界）、
R-08（拖拽角度与滑块不一致）。

**仍建议后续做**（未改，避免在无浏览器环境大动版式）：

1. 画布手柄不可键盘操作——滑块是等价的无障碍路径，但手柄本身应有 `tabIndex` 与方向键；
2. 导航已改为真实 `<a href="#/...">`，但关卡列表、图案卡片仍是按钮；
3. 760 px 以下 `puzzle` 双栏改为单栏的顺序没有断言，需要真机回归。

## 5. 文档同步

| 文件 | 改动 |
|---|---|
| `docs/API.md` | **新增**：17 个核心模块的导出签名、前置/后置条件、可依赖不变量 |
| `docs/CODE_REVIEW.md` | **新增**：本报告 |
| `docs/GEOMETRY_SPEC.md` | §5.1 重写为「纸包内一次相减 + 逐层撤纸」；补 I6–I10 与三次真实故障 |
| `docs/TESTING.md` | 测试矩阵补 4 个新文件；新增覆盖率统计范围与命令 |
| `TEST_REPORT.md` | 新增第九轮：199 用例、覆盖率、构建体积、未覆盖项 |
| `CHANGELOG.md` | `[0.7.3]`：3 个 P0/P1 修复、5 个 UX 修复、8 个新测试文件 |
| `PROJECT_STATUS.md` | 版本、测试数、覆盖率、里程碑 SHA |
| `README.md` | 版本 0.7.3、测试命令与覆盖率、能力边界 |
| `docs/INDEX.md` | 索引补 `API.md`、`CODE_REVIEW.md` |
| `docs/PATTERNS.md` | 藻井轮廓段数改为实测口径；六出署名补 Anna Lubiw |
| `submission/*` | 图案数量 11 → 16（entry_description、screenshots_checklist）；参考文献署名 |
| `src/pages/AboutPage.tsx` | 版本号 v0.7.3 |
