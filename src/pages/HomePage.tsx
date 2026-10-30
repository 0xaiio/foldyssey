import { useEffect, useMemo, useState } from 'react';

import { navigate } from '../app/router';
import { MiniPattern } from '../components/MiniPattern';
import { PaperStage } from '../components/PaperStage';
import { applyCuts, cutFromAngle } from '../geometry/cut';
import { getPreset } from '../geometry/fold';
import { useAnimatedValue, useReducedMotion } from '../hooks/useAnimatedValue';
import { LEVELS } from '../puzzle/levels';
import { loadProgress, nextUnclearedIndex } from '../services/storage';

const HERO_CUT = cutFromAngle(45, 0.4, 'negative');

/**
 * The hero animation runs on the exact same engine as the playable levels:
 * the fold is an interpolation between documented end states, and the shape
 * after unfolding is the real computed region for this cut.
 */
function HeroDemo() {
  const preset = getPreset('orthogonal2');
  const uncut = useMemo(() => applyCuts('orthogonal2', []), []);
  const result = useMemo(() => applyCuts('orthogonal2', [HERO_CUT]), []);
  const fold = useAnimatedValue(0);
  const fall = useAnimatedValue(0);
  const [applied, setApplied] = useState(false);
  const [step, setStep] = useState<'fold' | 'cut' | 'unfold' | 'reveal'>('fold');
  const reduced = useReducedMotion();

  // Stable callbacks: safe to omit from the dependency list.
  const foldSet = fold.set;
  const foldTo = fold.animateTo;
  const foldCancel = fold.cancel;
  const fallSet = fall.set;
  const fallTo = fall.animateTo;
  const fallCancel = fall.cancel;

  useEffect(() => {
    if (reduced) {
      foldSet(0);
      fallSet(1);
      setApplied(true);
      setStep('reveal');
      return;
    }
    let cancelled = false;
    const wait = (ms: number) => new Promise<void>((res) => window.setTimeout(res, ms));

    const run = async () => {
      while (!cancelled) {
        setApplied(false);
        fallSet(0);
        foldSet(0);
        setStep('fold');
        await wait(520);
        if (cancelled) return;
        await new Promise<void>((res) => foldTo(1, 980, res));
        if (cancelled) return;
        await wait(340);
        setStep('cut');
        setApplied(true);
        fallSet(0);
        await new Promise<void>((res) => fallTo(1, 640, res));
        if (cancelled) return;
        await wait(240);
        setStep('unfold');
        await new Promise<void>((res) => foldTo(0, 1350, res));
        if (cancelled) return;
        setStep('reveal');
        await wait(2300);
      }
    };

    void run();
    return () => {
      cancelled = true;
      foldCancel();
      fallCancel();
    };
  }, [reduced, foldSet, foldTo, foldCancel, fallSet, fallTo, fallCancel]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
      <div style={{ flex: 1, minHeight: 0 }}>
        <PaperStage
          preset={preset}
          outcome={applied ? result : uncut}
          foldedness={fold.value}
          cut={HERO_CUT}
          showCutLine={!applied && fold.value > 0.55}
          paperColor="#B93645"
          accentColor="#D84A49"
          removedOpacity={1 - fall.value}
          fall={fall.value}
          showCreases
          ariaLabel="双重正交折叠后一刀剪出中心菱形孔洞的自动演示"
        />
      </div>
      <div className="demo-steps" aria-hidden="true">
        {[
          { id: 'fold', label: '折' },
          { id: 'cut', label: '剪' },
          { id: 'unfold', label: '展' },
          { id: 'reveal', label: '万象' },
        ].map((s) => (
          <span key={s.id} className={step === s.id ? 'is-on' : ''}>
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HomePage() {
  const progress = useMemo(() => loadProgress(), []);
  const startIndex = useMemo(() => nextUnclearedIndex(LEVELS.map((l) => l.id)), []);
  const startLevel = LEVELS[startIndex] ?? LEVELS[0];
  const cleared = LEVELS.filter((l) => progress[l.id]?.cleared).length;

  return (
    <>
      <section className="hero">
        <div className="hero__text">
          <div className="kicker">Computational Paper Art Lab</div>
          <div className="hero__title">
            <h1 className="display">Foldyssey</h1>
            <div className="hero__cn">一刀万象</div>
          </div>
          <div>
            <div className="hero__slogan">Fold. Snip. Unfold. Wow!</div>
            <div className="hero__slogan-cn">一张纸，千种可能；一把剪刀，万象展开。</div>
          </div>
          <p className="lede">
            折起一张纸，调整一条切线，只剪一刀，再亲手展开。
            你看到的每一个缺口、每一道弧线，都来自可验证的计算几何——
            不是预先画好的图，而是这一刀的真实结果。
          </p>
          <div className="btn-row">
            <button
              className="btn btn--primary"
              onClick={() => navigate(`/puzzle/${startLevel.id}`)}
            >
              立即剪一刀
            </button>
            <button className="btn btn--ghost" onClick={() => navigate('/studio')}>
              进入剪纸工坊
            </button>
          </div>
          <p className="note">
            无需登录 · 无需下载 · 免费游玩 · 作品保存在你自己的浏览器里
          </p>
        </div>

        <div>
          <div className="hero__stage">
            <HeroDemo />
          </div>
          <div className="hero__caption">
            <span>双重正交折叠 · 一刀 · 展开</span>
            <button className="btn btn--quiet btn--sm" onClick={() => navigate('/puzzle/diamond')}>
              亲手试试这一关 →
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div>
            <div className="kicker">How it works</div>
            <h2 className="h2">三步，看见几何</h2>
          </div>
          <p className="muted">10 秒理解玩法，30 秒做出第一个图案。</p>
        </div>
        <div className="grid-3">
          {[
            {
              n: '01',
              t: '折',
              d: '选择一套合法的折叠方案：不折、竖折、横折，或者正交双折。四层纸叠成一包。',
            },
            {
              n: '02',
              t: '剪',
              d: '在折叠后的纸包上拖动一条直线。滑块控制角度和位置，纸包上会实时预览要剪掉的部分。',
            },
            {
              n: '03',
              t: '展',
              d: '逐层展开，图案从折叠里"长"出来。目标对照、IoU 评分、差异覆盖都会同时给出。',
            },
          ].map((s) => (
            <div key={s.n} className="card card--pad">
              <div className="kicker">{s.n}</div>
              <h3 className="h3" style={{ margin: '8px 0 6px' }}>
                {s.t}
              </h3>
              <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.8 }}>
                {s.d}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div>
            <div className="kicker">Six levels</div>
            <h2 className="h2">六个关卡，六种几何</h2>
          </div>
          <p className="muted">
            已通关 {cleared} / {LEVELS.length}
          </p>
        </div>
        <div className="grid-3">
          {LEVELS.map((level) => (
            <button
              key={level.id}
              className="level-card"
              onClick={() => navigate(`/puzzle/${level.id}`)}
            >
              <div className="level-card__art">
                <MiniPattern paper={level.target} color="#B93645" label={`${level.title}目标图案`} />
              </div>
              <div className="level-card__body">
                <strong>
                  {String(level.index).padStart(2, '0')} · {level.title}
                </strong>
                <span>{level.subtitle}</span>
                {progress[level.id]?.cleared ? <em className="stamp">已通关</em> : null}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="grid-2">
          <div className="card card--pad">
            <div className="kicker">Studio</div>
            <h2 className="h2" style={{ margin: '8px 0 10px' }}>
              剪纸工坊
            </h2>
            <p className="lede" style={{ fontSize: 15 }}>
              左边是折叠后的纸包，右边是实时展开的图案。多刀、配色、撤销重做、SVG / PNG 导出，
              都在同一个几何引擎上完成。你可以把它存进「我的作品」，也可以导出矢量图继续加工。
            </p>
            <div className="btn-row" style={{ marginTop: 16 }}>
              <button className="btn btn--ghost" onClick={() => navigate('/studio')}>
                打开工坊
              </button>
              <button className="btn btn--quiet" onClick={() => navigate('/gallery')}>
                看我的作品
              </button>
            </div>
          </div>
          <div className="card card--pad">
            <div className="kicker">Mathematics</div>
            <h2 className="h2" style={{ margin: '8px 0 10px' }}>
              纸艺中的数学
            </h2>
            <p className="lede" style={{ fontSize: 15 }}>
              对称、平折、层叠、逆映射、一次直线切割。每个概念都配一个小实验，
              你可以直接动手改参数，看结论怎么随参数变化。
            </p>
            <div className="btn-row" style={{ marginTop: 16 }}>
              <button className="btn btn--ghost" onClick={() => navigate('/explore')}>
                去看看
              </button>
              <button className="btn btn--quiet" onClick={() => navigate('/about')}>
                关于这个项目
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
