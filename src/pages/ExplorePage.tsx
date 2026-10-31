import { useMemo, useState } from 'react';

import { MiniPattern } from '../components/MiniPattern';
import { applyCuts, cutFromAngle } from '../geometry/cut';
import { multiPolygonArea } from '../geometry/polygon';

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div className="demo">{children}</div>
);

function ReflectionDemo() {
  const [x, setX] = useState(0.55);
  return (
    <>
      <Frame>
        <svg viewBox="-1.15 -1.15 2.3 2.3" role="img" aria-label="轴对称小实验">
          <rect x={-1} y={-1} width={2} height={2} fill="#FFFDF8" stroke="rgba(36,39,37,0.2)" strokeWidth={0.012} />
          <line x1={0} y1={-1} x2={0} y2={1} stroke="#C9A46A" strokeWidth={0.016} strokeDasharray="0.05 0.035" />
          <circle cx={x} cy={0.42} r={0.085} fill="#B93645" />
          <circle cx={-x} cy={0.42} r={0.085} fill="#C9A46A" />
          <line x1={x} y1={0.42} x2={-x} y2={0.42} stroke="rgba(36,39,37,0.28)" strokeWidth={0.008} strokeDasharray="0.03 0.03" />
        </svg>
      </Frame>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={x}
        aria-label="移动红点，观察镜像点"
        onChange={(e) => setX(Number(e.target.value))}
      />
      <p className="note">红点位置 x = {x.toFixed(2)}，镜像点始终在 −x。折叠就是把这两点叠在一起。</p>
    </>
  );
}

function LayersDemo() {
  const [folds, setFolds] = useState(2);
  const layers = 2 ** folds;
  return (
    <>
      <Frame>
        <svg viewBox="0 0 2.3 2.3" role="img" aria-label="层叠小实验">
          {Array.from({ length: layers }).map((_, i) => (
            <rect
              key={i}
              x={0.35 + i * 0.055}
              y={0.35 + i * 0.055}
              width={1.3}
              height={1.3}
              fill={i % 2 === 0 ? '#B93645' : '#D84A49'}
              fillOpacity={0.9}
              stroke="rgba(36,39,37,0.25)"
              strokeWidth={0.008}
            />
          ))}
        </svg>
      </Frame>
      <input
        type="range"
        min={0}
        max={2}
        step={1}
        value={folds}
        aria-label="折叠次数"
        onChange={(e) => setFolds(Number(e.target.value))}
      />
      <p className="note">
        {folds} 次折叠 → {layers} 层。一刀同时作用于全部 {layers} 层，所以展开后有 {layers} 份图案。
      </p>
    </>
  );
}

function DiamondDemo() {
  const [d, setD] = useState(0.5);
  const offset = d / Math.SQRT2;
  const result = useMemo(
    () => applyCuts('orthogonal2', [cutFromAngle(45, offset, 'negative')]),
    [offset],
  );
  const area = multiPolygonArea(result.removed);
  return (
    <>
      <Frame>
        <MiniPattern paper={result.paper} color="#B93645" label="菱形孔洞随参数变化" />
      </Frame>
      <input
        type="range"
        min={0.1}
        max={0.95}
        step={0.01}
        value={d}
        aria-label="菱形半径"
        onChange={(e) => setD(Number(e.target.value))}
      />
      <p className="note">
        d = {d.toFixed(2)} → 孔洞面积实测 {area.toFixed(4)}，理论值 2d² = {(2 * d * d).toFixed(4)}。
      </p>
    </>
  );
}

function PreimageDemo() {
  const [u, setU] = useState(0.55);
  const [v, setV] = useState(0.3);
  return (
    <>
      <Frame>
        <svg viewBox="-1.15 -1.15 2.3 2.3" role="img" aria-label="逆映射小实验">
          <rect x={-1} y={-1} width={2} height={2} fill="#FFFDF8" stroke="rgba(36,39,37,0.2)" strokeWidth={0.012} />
          <rect x={0} y={0} width={1} height={1} fill="rgba(201,164,106,0.22)" stroke="#C9A46A" strokeWidth={0.012} />
          <line x1={0} y1={-1} x2={0} y2={1} stroke="rgba(36,39,37,0.25)" strokeWidth={0.008} />
          <line x1={-1} y1={0} x2={1} y2={0} stroke="rgba(36,39,37,0.25)" strokeWidth={0.008} />
          <circle cx={u} cy={v} r={0.075} fill="#B93645" />
          <circle cx={-u} cy={v} r={0.06} fill="#D84A49" fillOpacity={0.75} />
          <circle cx={-u} cy={-v} r={0.06} fill="#D84A49" fillOpacity={0.75} />
          <circle cx={u} cy={-v} r={0.06} fill="#D84A49" fillOpacity={0.75} />
        </svg>
      </Frame>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={u}
        aria-label="纸包内点的横坐标"
        onChange={(e) => setU(Number(e.target.value))}
      />
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={v}
        aria-label="纸包内点的纵坐标"
        onChange={(e) => setV(Number(e.target.value))}
      />
      <p className="note">
        纸包里的一个点 (±u, ±v) 有 4 个原像：({u.toFixed(2)}, {v.toFixed(2)})、(−{u.toFixed(2)},{' '}
        {v.toFixed(2)})、(−{u.toFixed(2)}, −{v.toFixed(2)})、({u.toFixed(2)}, −{v.toFixed(2)})。
      </p>
    </>
  );
}

export function ExplorePage() {
  return (
    <>
      <div className="head-row">
        <div>
          <div className="kicker">Mathematics of paper</div>
          <h1 className="level-title">纸艺中的数学</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            五张小卡片。每张都能动手改参数，而不是只读一段解释。
          </p>
        </div>
      </div>

      <div className="explore-grid" style={{ marginTop: 22 }}>
        <div className="explore-card">
          <h3>1 · 轴对称</h3>
          <p>折叠是平面上的保距变换：长度、角度、面积都不变，只是把一侧搬到另一侧。</p>
          <ReflectionDemo />
        </div>

        <div className="explore-card">
          <h3>2 · 层叠</h3>
          <p>每折一次，层数翻倍。一刀下去，是所有层同时被剪。</p>
          <LayersDemo />
        </div>

        <div className="explore-card">
          <h3>3 · 一次直线切割</h3>
          <p>真正被剪掉的是半个平面，不是一条线。四重镜像把它变成一个有 4 条边、8 条边甚至更多的洞。</p>
          <DiamondDemo />
        </div>

        <div className="explore-card">
          <h3>4 · 逆映射</h3>
          <p>纸包上的每一个点，都来自原纸上的若干点。展开就是把这些原像逐个还原。</p>
          <PreimageDemo />
        </div>

        <div className="explore-card explore-card--wide">
          <h3>5 · Fold-and-Cut 定理</h3>
          <div className="theorem">
            <div>
              <p className="theorem__lead">
                这一定理由 Erik D. Demaine、Martin L. Demaine 与 Anna Lubiw 证明，中文文献里常见的译名是「折剪定理」，通俗说法是「折纸一刀切定理」。
              </p>
              <blockquote className="theorem__quote" lang="en">
                “Given any collection of straight edges, there exists a flat folding and a line in that folding such that cutting along it results in the desired pattern of cuts.”
              </blockquote>
              <p className="theorem__cite">
                出处：Theorem 1，E. D. Demaine, M. L. Demaine, A. Lubiw, “Folding and Cutting Paper”, JCDCG'98, Lecture Notes in Computer Science（LNCS）1763, Springer, 2000, pp. 104–117，DOI 10.1007/978-3-540-46515-7_9；会议摘要版 “Folding and One Straight Cut Suffice”, SODA 1999, pp. 891–892。
              </p>
              <p className="theorem__trans">
                <b>中文译文（本项目译）：</b>给定平面上任意一族直线段，都存在一种平折方式，以及该折叠状态下的一条直线，使得沿这条直线剪一刀后，恰好得到这组直线段所构成的剪口图案。
              </p>
              <p className="note">
                术语：「平折」（flat folding）指纸被折到完全展平、各面重合的状态，不是「对折」；原文的「一族直线段」允许相交、不连通、彼此嵌套，也就是任意平面直线图（plane graph）。定理还可以等价地说成：能把图形折到同一条直线上——图形的所有顶点与边都落在这一条线上，而纸上其他部分都不落在上面。
              </p>
            </div>

            <div className="theorem__side">
              <p>
                <b>定理没有说的事：</b>它只断言「存在某个平折」，既不是「随便折两下就能剪出任意图案」，也不是「任意折法都行」。
              </p>
              <p>
                本作品只提供五种固定折叠预设（不折、竖折、横折、正交双折、八折团花），所以目标库只是这五种预设下的像——这是能力的边界，不是定理的反例。
              </p>
              <p className="note">
                还有一处也要说清：定理的假设是<b>直线段</b>。本作的「曲线剪」是正弦弧的折线逼近，超出该假设，这部分不由折剪定理背书。
              </p>
            </div>
          </div>
          <p className="note">
            研究灵感来自 Erik D. Demaine、Martin L. Demaine 与 Anna Lubiw 的计算折纸工作。本项目与 MIT 及上述作者无隶属或背书关系，未使用其谜题图片、教材图或源码。
          </p>
        </div>
      </div>
    </>
  );
}
