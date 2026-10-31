/**
 * The 「数学一句话」 card states the whole engine in one formula, so it has to
 * be legible on any machine, not just this one.
 *
 * Measured on a stock Windows font set (300+ faces in C:\Windows\Fonts):
 *   ⋃ U+22C3 → only 2 faces (Lucida Sans Unicode, Segoe UI Symbol)
 *   ∪ U+222A → 34 faces, but neither Segoe UI nor Arial
 *   ᵢ U+1D62 → 43 faces;  ⁻¹ → 64 faces
 * None of them is in the page's font stack, so the old formula depended on
 * per-glyph fallback — one missing face away from a tofu box.
 *
 * So the formula is written as HTML: <sub>/<sup> for indices and the inverse
 * (no special characters at all), and the one genuinely rare symbol — the
 * n-ary union — is drawn as a vector glyph that inherits `currentColor`. The
 * text stays selectable, scales with the font size and prints crisp.
 */

/** Vector ⋃: two uprights joined by a bowl. Font-independent by construction. */
function Union() {
  return (
    <svg className="cup" viewBox="1.65 0.95 10.7 14.35" role="img" aria-label="并集" focusable="false">
      <path
        d="M2.5 1.8V10.4C2.5 15.8 11.5 15.8 11.5 10.4V1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="square"
      />
    </svg>
  );
}

const SPOKEN =
  'S 等于对所有片区 i 取并集：第 i 片纸的残料，等于 P_i 减去 f_i 的逆映射，作用于 D 与 f_i(P_i) 的交集。';

export function AboutPage() {
  return (
    <>
      <div className="head-row">
        <div>
          <div className="kicker">About</div>
          <h1 className="level-title">关于 Foldyssey</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            Fold. Snip. Unfold. Wow! · 一张纸，千种可能；一把剪刀，万象展开。
          </p>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 22 }}>
        <div className="card card--pad">
          <h2 className="h2" style={{ fontSize: 24, marginBottom: 10 }}>
            我们在做什么
          </h2>
          <p className="lede" style={{ fontSize: 15 }}>
            Foldyssey（一刀万象）是一座可以玩的数字折剪纸实验室。它不提供教程，也不播放预制动画：
            你选择一种折叠、拖动一条切线，程序用真实的几何运算算出剪掉之后剩下的纸，
            再把八层（或四层、两层、一层）纸分别逆变换回原纸，拼成你看到的图案。
          </p>
          <p className="lede" style={{ fontSize: 15, marginTop: 10 }}>
            所以改变切线的角度、位置甚至弯曲程度，图案会随之变化；改对了，评分是几何集合的 IoU，
            不是"看起来像"。
          </p>
          <p className="note" style={{ marginTop: 10 }}>
            截至 v0.7.1：5 种折法（含不折）、4 种切口原语（直线 / 折剪 / 镂空 / 曲线）、
            16 个关卡分 5 个阶段，并按「剪刀能力」排成四级——一刀、两刀、拐弯、曲线。
          </p>
        </div>

        <div className="card card--pad">
          <h2 className="h2" style={{ fontSize: 24, marginBottom: 10 }}>
            数学一句话
          </h2>
          <p className="lede" style={{ fontSize: 15 }}>
            纸张 <span className="math"><i>P</i> = [−1, 1]<sup>2</sup></span> 被折叠划分成若干片区{' '}
            <span className="math"><i>P</i><sub>i</sub></span>，每个片区用一个保距变换{' '}
            <span className="math"><i>f</i><sub>i</sub></span> 映到纸包。一刀剪掉的是纸包里的一个区域{' '}
            <span className="math"><i>D</i></span>——直线刀时它是半平面，折剪刀时是折线围出的楔形，
            曲线刀时是曲线一侧的区域——每个片区各自失去{' '}
            <span className="math"><i>f</i><sub>i</sub><sup>−1</sup>(<i>D</i>)</span>。展开后的纸就是
          </p>
          <p className="formula" role="math" aria-label={SPOKEN}>
            <span aria-hidden="true">
              <i>S</i> = <Union />
              <sub>i</sub> ( <i>P</i>
              <sub>i</sub> \ <i>f</i>
              <sub>i</sub>
              <sup>−1</sup>( <i>D</i> ∩ <i>f</i>
              <sub>i</sub>(<i>P</i>
              <sub>i</sub>) ) )
            </span>
          </p>
          <p className="note">
            这就是本项目的"单一可信源"：动画只是把 <span className="math"><i>S</i></span> 的折叠与展开过程演出来，
            它不会另外构造一套结果。
          </p>
          <div className="refs">
            <span className="refs__head">参考文献</span>
            <ol>
              <li>
                E. D. Demaine, J. O'Rourke. <i>Geometric Folding Algorithms: Linkages, Origami,
                Polyhedra</i>. Cambridge University Press, 2007：Part II “Paper” 给出折叠的形式化定义
                （折叠状态是逐面上的等距映射），“One complete straight cut” 一章讨论一刀直线切割。
                <a href="https://doi.org/10.1017/CBO9780511735172" target="_blank" rel="noreferrer noopener">
                  doi:10.1017/CBO9780511735172
                </a>
              </li>
              <li>
                E. D. Demaine, M. L. Demaine, A. Lubiw. “Folding and Cutting Paper.” In
                <i> Discrete and Computational Geometry (JCDCG'98)</i>, LNCS 1763, Springer, 2000:
                104–117.
                <a href="https://doi.org/10.1007/978-3-540-46515-7_9" target="_blank" rel="noreferrer noopener">
                  doi:10.1007/978-3-540-46515-7_9
                </a>
              </li>
            </ol>
            <p className="note">
              上式是本项目自己的写法：它把「每层各失去自己的原像、再把残料并回去」写成一行。
              折叠 = 逐面保距、一刀 = 一次集合差，这两件事来自上面两处文献。式中{' '}
              <span className="math"><i>D</i> ∩ <i>f</i><sub>i</sub>(<i>P</i><sub>i</sub>)</span>{' '}
              在实现里恒等于 <span className="math"><i>D</i></span>（裁剪时 <span className="math"><i>D</i></span>{' '}
              已经限定在纸包内）；写成交集是为了让公式在 <span className="math"><i>D</i></span>{' '}
              未被裁剪时也成立。具体到本项目五种折法、四种刀具的映射，见{' '}
              <span className="mono">docs/GEOMETRY_SPEC.md</span>。
            </p>
          </div>
        </div>
      </div>

      <div className="card card--pad" style={{ marginTop: 18 }}>
        <h2 className="h2" style={{ fontSize: 24, marginBottom: 10 }}>
          能力边界
        </h2>
        <div className="cap-table">
          <div className="cap-row">
            <span>支持的折叠</span>
            <span>
              五种固定预设：不折（1 层）、竖折 / 横折（2 层）、正交双折（4 层）、八折团花（8 层，D4）。
              每一层都有已定义的正向与逆向变换
            </span>
          </div>
          <div className="cap-row">
            <span>支持的切割</span>
            <span>
              四种原语：直线（半平面）、折剪（在纸包里拐弯）、镂空（闭合孔）、曲线（弧线 / S 形 / 波浪）；
              锯齿边由沿边缘排布的菱形镂空生成。关卡每关 1–6 刀，工坊最多 3 刀
            </span>
          </div>
          <div className="cap-row">
            <span>关卡与分级</span>
            <span>
              16 关、5 个阶段；「剪刀能力」四级（一刀 / 两刀 / 拐弯 / 曲线）由每关的标准解计算，
              并实测目标边界的曲边占比
            </span>
          </div>
          <div className="cap-row">
            <span>不支持的</span>
            <span>
              任意斜折与任意折痕曲线；自交、回头、闭口的开口剪（闭口请用镂空）；
              真圆弧（曲线是正弦弧的折线逼近，误差上界 1.2×10⁻³）；
              任意目标图案的自动求解；纸张物理形变仿真
            </span>
          </div>
          <div className="cap-row">
            <span>实体模板</span>
            <span>本版未提供经核验的可打印折剪模板，所有作品标注为「未核验」或「数字图案」</span>
          </div>
          <div className="cap-row">
            <span>运行时 AI</span>
            <span>
              已接入 WorkBuddy 云服务的模型通道（无需 API Key）。模型只输出受约束的设计参数，
              图案仍由本机几何引擎计算；页面上有 6 个模板可一键填入完整描述并自行修改。
              AI 不可用时，挑战、工坊、作品集照常使用
            </span>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 18 }}>
        <div className="card card--pad">
          <h3 className="h3">研究灵感与免责</h3>
          <p className="note" style={{ marginTop: 8 }}>
            本项目受 Erik D. Demaine、Martin L. Demaine 与 Anna Lubiw 关于 computational origami、
            fold-and-cut、folding puzzles 的研究启发。Fold-and-Cut 定理断言：任意一族直线段，
            都存在一种平折，使一刀直线切割得到它们。
          </p>
          <p className="note" style={{ marginTop: 8 }}>
            但定理只保证「存在某个平折」；本作品只提供五种固定折法，所以可剪出的目标只是这五种
            折法下的像，曲线剪更超出定理的直线段假设。
            <strong>非 MIT 官方产品，与上述作者无合作或背书关系</strong>，未使用其谜题图片、
            教材图或源码。原文、译文与出处见「纸艺中的数学」第 5 张卡片。
          </p>
        </div>

        <div className="card card--pad">
          <h3 className="h3">隐私与数据</h3>
          <p className="note" style={{ marginTop: 8 }}>
            没有账号系统，没有后端数据库，没有埋点。作品与关卡进度只写在浏览器的 localStorage 里，
            清除浏览器数据就会消失——想长期保留请导出 SVG / PNG。
          </p>
          <p className="note" style={{ marginTop: 8 }}>
            只有「AI 灵感」页会联网：它把你输入的那一句主题描述发给 WorkBuddy 云服务的模型，
            不发送作品、进度或任何身份信息。其余页面不加载第三方字体、图片或统计脚本，
            断网也能完整游玩。
          </p>
        </div>
      </div>

      <div className="card card--pad" style={{ marginTop: 18 }}>
        <h3 className="h3">技术栈与开源依赖</h3>
        <p className="note" style={{ marginTop: 8 }}>
          React + TypeScript + Vite；SVG 渲染；<span className="mono">polygon-clipping</span>{' '}
          提供多边形布尔运算（MIT）；<span className="mono">zod</span> 校验模型输出；Vitest 提供测试。
          几何引擎、折叠模型、剪切语义、评分与导出全部为本项目自研代码。运行时的模型调用走
          <span className="mono"> @tencent-ai/workbuddy-cloud-sdk</span>（WorkBuddy 云服务，
          密钥保存在服务端，前端只有可公开的 endpoint 与 publishableKey）。
        </p>
        <p className="note" style={{ marginTop: 8 }}>
          本项目由 WorkBuddy 辅助开发。开发期使用的编程模型与「AI 灵感」页运行时调用的模型是两件事：
          前者写代码，后者只生成受约束的设计参数，且每次调用都是用户在页面上主动触发的。
        </p>
      </div>

      <p className="note" style={{ marginTop: 22 }}>
        Foldyssey v0.7.1 · 2026 年 10 月 · WorkBuddy「1024 造物挑战」参赛作品
      </p>
    </>
  );
}
