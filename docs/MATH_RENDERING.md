# 公式渲染方案（MATH_RENDERING）

> 范围：「关于」页「数学一句话」卡片里的 1 条展示公式与 7 个内联符号。
> 结论：**LaTeX 源码在构建期由 MathJax 编译成自包含 SVG，内联进页面**。
> 没有位图，没有运行时排版引擎，没有数学字体依赖。

## 1. 问题与根因

旧实现是「Unicode 字符 + `<sub>/<sup>` + 手绘 SVG 并集符号」。它错在**依赖字形**：

| 字符 | 用途 | 本机 300+ 字体中覆盖 | 页面字体栈 |
|---|---|---|---|
| `⋃` U+22C3 | n 元并集 | **2**（Lucida Sans Unicode、Segoe UI Symbol） | 无 |
| `∪` U+222A | 二元并集 | 34 | 无（Segoe UI / Arial 都没有） |
| `ᵢ` U+1D62 | 下标 i | 43 | 部分 |
| `⁻` U+207B | 上标负号 | 64 | Arial 没有 |
| `∩` U+2229 | 交集 | 123 | 有 |

于是并集符号靠**逐字回退**才显示，字重与基线都跟正文不一致；`<sup>` 的
`vertical-align: 0.55em` 是按 15px 估的，换字号就错位。这不是"某台机器坏了"，
而是方案本身把正确性交给了运行环境的字体。

## 2. 候选方案对比

评分维度：① 字形依赖 ② 清晰度 ③ 运行时体积 ④ 离线可用 ⑤ 可访问性
⑥ 跟随主题色 ⑦ 可维护性 ⑧ 构建复杂度。

| 方案 | ① | ② | ③ | ④ | ⑤ | ⑥ | ⑦ | ⑧ | 结论 |
|---|---|---|---|---|---|---|---|---|---|
| Unicode + `<sub>/<sup>`（旧） | 差：靠字体回退 | 中（取整对齐） | 0 | 是 | 中 | 是 | 高 | 无 | 已否决：本次问题的根因 |
| LaTeX → PNG / WebP（位图） | 无 | 差：只在一个倍率清晰，放大/打印糊 | 中（2× 图 ~50–100 kB） | 是 | 差（图片无文字） | 否（颜色烧死在像素里） | 低（要重导） | 中（需 LaTeX 或 matplotlib） | 否决 |
| KaTeX 运行时（HTML + CSS + 20 个 woff2） | 中：webfont 加载失败就回退，**与本问题同类** | 优（矢量大字） | 重：~280 kB JS + 字体 | 需打包字体 | 优（可选文本） | 是 | 高 | 低 | 否决：运行时依赖与体积都不划算 |
| MathJax 运行时（SVG/CHTML） | 优 | 优 | 重：~1 MB+ | 需打包 | 优 | 是 | 高 | 低 | 否决：只为两行公式引入排版引擎 |
| 原生 MathML | 中：取决于系统数学字体，Chromium 支持较新 | 优 | 0 | 是 | 优（语义最好） | 是 | 中 | 无 | 否决：字体问题原样保留 |
| **构建期 TeX → 自包含 SVG** | **无：字形已转成路径** | **优：矢量，任意缩放/打印** | **+5 kB gzip** | **是** | 中：图形本身不可读，用 `role="math"` + 中文读法补足 | **是：`currentColor`** | 高：改 `.tex` 后一条命令 | 低：仅构建期 devDependency | **采用** |

补充两点，说明为什么不是「生成 `.svg` 文件再用 `<img>`」：

1. `<img>` 里的 SVG 没有页面字体上下文，MathJax 用 `ex` 写的宽高与
   `vertical-align: -0.5ex` 会失效，内联公式无法与正文基线对齐；
2. `<img>` 不继承 `currentColor`，深浅色主题要出两套图。

内联 `<svg>` 同时解决这两点：`ex` 相对当前字号解析，路径 `fill="currentColor"`。

## 3. 最终方案

```
tools/formulas.source.mjs        ← 唯一可信源：LaTeX + 中文读法 + 是否展示
        │  npm run build:formulas
        ▼
src/content/formulas.generated.ts ← MathJax SVG（字形=路径），含源文件哈希
        │  <Formula name="…" />
        ▼
src/pages/AboutPage.tsx           ← 页面只引用名字
```

- **编译**：`mathjax-full` 的 `TeX` → `SVG`，`fontCache: 'none'`，每个字形都内联成
  `<path>`，不依赖共享 `<defs>`，单个公式可以独立出现在任何位置。
- **产出**：8 条公式，合并 29.9 kB 源码；打包后主包 +27.9 kB（gzip **+5.1 kB**）。
- **不随包发布**：`mathjax-full` 是 `devDependency`，浏览器端零运行时。
- **颜色**：所有 `fill`/`stroke` 归一为 `currentColor`，正文色变它就变。
- **基线**：保留 MathJax 写在 `<svg style="vertical-align: -0.5ex">` 上的偏移，
  不再手估 `em`。
- **溢出**：`.mathformula svg { overflow: visible }`（斜体 f、括号会探出 viewBox）；
  展示公式固定原始尺寸，容器 `overflow-x: auto`，窄屏横向滚动而不是缩到看不清。

### 公式清单

| name | LaTeX | 用途 |
|---|---|---|
| `unfold` | `S = \bigcup_i \left( P_i \setminus f_i^{-1}\!\left( D \cap f_i(P_i) \right) \right)` | 展示公式（卡片主体） |
| `paper` | `P = [-1,1]^2` | 纸张定义 |
| `patch` | `P_i` | 片区 |
| `map` | `f_i` | 保距映射 |
| `region` | `D` | 纸包内被剪区域 |
| `preimage` | `f_i^{-1}(D)` | 每层失去的原像 |
| `result` | `S` | 展开后的纸 |
| `clipped` | `D \cap f_i(P_i)` | 文中解释"为什么写交集" |

## 4. 可访问性

- 外层 `<span role="math" aria-label="…">` 给出一句**完整中文读法**（如
  "S 等于对所有片区 i 取并集…"），读屏软件读这句话，不会念路径数据；
- 内层 SVG 标 `aria-hidden="true"`，避免"图片无名称"的重复提示；
- LaTeX 源码保留在仓库里，是机器可读的事实来源；将来要生成 MathML 或
  speech 文本，不需要重写内容。

## 5. 测试与验证

`src/tests/formulas.test.tsx`（15 条）：

- **防漂移**：生成文件里写入源文件 SHA-256 前 16 位；测试重新读源文件比对，
  改了 `.tex` 忘记 `npm run build:formulas` 会直接失败；
- **结构**：每个 SVG 以 `<svg` 开头、含 `viewBox` 且宽高有限、含 `currentColor`、
  带 `aria-hidden`/`focusable="false"`、无 `<script>`/`onload`/`<image>`/`xlink:href`/
  `@font-face`、无 `NaN`/`Infinity`；
- **内容**：SVG 里不再出现 `⋃ ∪ ∩ ᵢ ⁻ −`（全部已变成路径）；中文读法不含 LaTeX 记号；
- **组件**：`<Formula>` 输出 `role="math"`、读法、隐藏的 `<svg>`，展示变体带
  `mathformula--display`。

因为没有浏览器，另写了 `tools/svgprobe.py`：从生成文件里取出 SVG，按
MathJax 实际使用的路径子集（`M L H V Q T Z` + 嵌套 `translate/scale`）展平，
用非零环绕规则填充成 PNG。它验证的是"**画出来对不对**"，而不只是"路径字符串合法"。
本轮用它逐条核对了 8 条公式（展示公式与 `paper`、`preimage`、`clipped`）。

## 6. 改动范围

| 文件 | 改动 |
|---|---|
| `tools/formulas.source.mjs` | 新增：8 条公式的 LaTeX 与中文读法 |
| `tools/build_formulas.mjs` | 新增：MathJax 编译 + 哈希 + 生成 TS |
| `tools/svgprobe.py` | 新增：无浏览器环境下的 SVG 栅格化复核 |
| `src/content/formulas.generated.ts` | 新增（生成物，提交入库） |
| `src/components/Formula.tsx` | 新增：`role="math"` 包装组件 |
| `src/pages/AboutPage.tsx` | 旧的手绘 `Union`/`SPOKEN`/`<sub><sup>` 全部删除，改引用 `Formula` |
| `src/styles/index.css` | 删除 `.math`/`.cup`/`<sub>` 相关规则；新增 `.mathformula` |
| `src/tests/formulas.test.tsx` | 新增 15 条 |
| `src/tests/ui.test.tsx` | 关于页断言改为"11 个 `mathformula`、无数学字符、有 `currentColor`" |
| `package.json` | `build:formulas` 脚本；`mathjax-full` 进 devDependencies |
| `vite.config.ts` | coverage 的 `include` 不变（`Formula.tsx` 属展示层，不入门槛） |

## 7. 以后怎么改公式

```bash
# 1. 编辑 tools/formulas.source.mjs 里的 tex / label
# 2. 重新生成
npm run build:formulas
# 3. 校验（哈希、结构、可访问性、无字体字符）
npx vitest run src/tests/formulas.test.tsx
# 4. 可选：看一眼画出来的样子
python tools/svgprobe.py unfold paper preimage
```

新增公式：在 `formulas.source.mjs` 里加一条，重新生成；页面用
`<Formula name="新名字" />` 引用。名字是 TS 联合类型，拼错会在 `tsc` 阶段报错。

## 8. 已知限制

1. **公式不是可选文本**。需要复制公式的人应从 `.tex` 源文件取；读屏用户由
   `aria-label` 覆盖。
2. **中文读法要手写**。没有从 TeX 自动生成中文语音（MathJax 的 speech 是英文）。
3. **+5.1 kB gzip**。若以后公式数量大增，可改成 `fontCache: 'global'` 共享字形
   定义，或用 `<use>` 引用一个隐藏的符号表。
4. 编译产物**入库**，因此不装 `mathjax-full` 也能构建；代价是改源后必须重新生成
   （由哈希测试强制）。
