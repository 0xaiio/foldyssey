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
            再把四层（或两层、一层）纸分别逆变换回原纸，拼成你看到的图案。
          </p>
          <p className="lede" style={{ fontSize: 15, marginTop: 10 }}>
            所以改变切线的角度和位置，图案会随之变化；改对了，评分是几何集合的 IoU，
            不是"看起来像"。
          </p>
        </div>

        <div className="card card--pad">
          <h2 className="h2" style={{ fontSize: 24, marginBottom: 10 }}>
            数学一句话
          </h2>
          <p className="lede" style={{ fontSize: 15 }}>
            纸张 <span className="mono">P = [−1,1]²</span> 被折叠划分成若干片区{' '}
            <span className="mono">Pᵢ</span>，每个片区用一个保距变换 <span className="mono">fᵢ</span>{' '}
            映到纸包。一刀直线只剪掉纸包里的一个半平面 <span className="mono">D</span>，
            每个片区各自失去 <span className="mono">fᵢ⁻¹(D)</span>。展开后的纸就是
          </p>
          <p
            className="mono"
            style={{
              margin: '12px 0',
              padding: '10px 12px',
              background: 'rgba(36,39,37,0.04)',
              borderRadius: 10,
              fontSize: 13.5,
              overflowX: 'auto',
            }}
          >
            S = ⋃ᵢ ( Pᵢ \ fᵢ⁻¹( D ∩ fᵢ(Pᵢ) ) )
          </p>
          <p className="note">
            这就是本项目的"单一可信源"。动画只是把 <span className="mono">S</span> 的折叠与展开过程演出来，
            它不会另外构造一套结果。
          </p>
        </div>
      </div>

      <div className="card card--pad" style={{ marginTop: 18 }}>
        <h2 className="h2" style={{ fontSize: 24, marginBottom: 10 }}>
          能力边界（写清楚，比夸大更有用）
        </h2>
        <div className="cap-table">
          <div className="cap-row">
            <span>支持的折叠</span>
            <span>不折、竖折、横折、正交双折（固定预设，已定义每层变换）</span>
          </div>
          <div className="cap-row">
            <span>支持的切割</span>
            <span>一刀挑战中严格为 1 条直线；工坊中最多 3 条（标记为数字图案）</span>
          </div>
          <div className="cap-row">
            <span>不支持的</span>
            <span>任意斜折、曲线切口、任意目标图案的自动求解、纸张物理形变仿真</span>
          </div>
          <div className="cap-row">
            <span>实体模板</span>
            <span>本版未提供经核验的可打印折剪模板，所有作品标注为「未核验」或「数字图案」</span>
          </div>
          <div className="cap-row">
            <span>运行时 AI</span>
            <span>
              已接入 WorkBuddy 云服务的模型通道（无需 API Key）。模型只输出受约束的设计参数，
              图案仍由本机几何引擎计算；AI 不可用时，挑战、工坊、作品集照常使用
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
        Foldyssey v0.1.0 · 2026 年 10 月 · WorkBuddy「1024 造物挑战」参赛作品
      </p>
    </>
  );
}
