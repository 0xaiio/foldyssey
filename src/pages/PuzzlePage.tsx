import { useEffect, useMemo, useState } from 'react';

import { navigate } from '../app/router';
import { MiniPattern } from '../components/MiniPattern';
import { PaperStage } from '../components/PaperStage';
import { SkillLadder } from '../components/SkillLadder';
import { useToast } from '../components/Toast';
import {
  applyCuts,
  cutAngleDeg,
  cutFromAngle,
  describeCut,
  visibleStroke,
  type Cut,
  type CurveBends,
} from '../geometry/cut';
import { getPreset } from '../geometry/fold';
import {
  formatPercent,
  isCleared,
  scorePaper,
  VERDICT_LABEL,
  type ScoreResult,
} from '../geometry/score';
import { useAnimatedValue } from '../hooks/useAnimatedValue';
import { LEVELS, STAGE_HINT, TIER_LABEL, getLevel } from '../puzzle/levels';
import { applyNudge, diagnose, type Diagnosis } from '../puzzle/assist';
import { CURVE_AMPLITUDE_EPS, SKILL_META, SKILL_ORDER, curveRatio, type ScissorSkill } from '../puzzle/skill';
import { loadProgress, recordAttempt, type ProgressDoc } from '../services/storage';

type Phase = 'ready' | 'folding' | 'folded' | 'cutting' | 'cut' | 'unfolding' | 'revealed';

const PHASE_LABEL: Record<Phase, string> = {
  ready: '摊开的纸',
  folding: '正在折叠',
  folded: '折叠完成 · 可以下刀',
  cutting: '一刀剪下',
  cut: '剪断，准备展开',
  unfolding: '逐层展开',
  revealed: '展开完成',
};

export function PuzzlePage({ levelId }: { levelId?: string }) {
  const level = useMemo(() => getLevel(levelId ?? '') ?? LEVELS[0], [levelId]);
  const preset = useMemo(() => getPreset(level.foldPreset), [level]);
  const uncut = useMemo(() => applyCuts(level.foldPreset, []), [level.foldPreset]);

  const [cuts, setCuts] = useState<Cut[]>(level.initialGuess);
  const [activeCut, setActiveCut] = useState(0);
  const [phase, setPhase] = useState<Phase>('ready');
  const [applied, setApplied] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [showDiff, setShowDiff] = useState(false);
  const [lastScore, setLastScore] = useState<ScoreResult | null>(null);
  const [diag, setDiag] = useState<Diagnosis | null>(null);
  const [nudges, setNudges] = useState(0);
  const [showHowTo, setShowHowTo] = useState(true);
  const [showTarget, setShowTarget] = useState(level.stage < 3);
  const [progress, setProgress] = useState<ProgressDoc>(() => loadProgress());

  const fold = useAnimatedValue(0);
  const fall = useAnimatedValue(0);
  const { show: toast, node: toastNode } = useToast();

  const result = useMemo(() => applyCuts(level.foldPreset, cuts), [level.foldPreset, cuts]);
  // Live score for the always-on comparison card. One evaluation is ~4 ms on
  // the eight-fold preset, so recomputing on every drag frame is affordable.
  const liveScore = useMemo(
    () => scorePaper(result.paper, level.target, level.thresholds),
    [result, level],
  );
  const active = Math.min(activeCut, cuts.length - 1);
  const cut = cuts[active];

  const foldSet = fold.set;
  const foldTo = fold.animateTo;
  const fallSet = fall.set;
  const fallTo = fall.animateTo;

  // Reset when the level changes.
  useEffect(() => {
    setCuts(level.initialGuess);
    setActiveCut(0);
    setApplied(false);
    // Stage 1 opens the observation hint by itself; later stages do not.
    setHintLevel(level.stage === 1 ? 1 : 0);
    setShowDiff(false);
    setLastScore(null);
    setDiag(null);
    setNudges(0);
    setShowTarget(level.stage < 3);
    fallSet(0);
    if (preset.steps.length === 0) {
      foldSet(1);
      setPhase('folded');
      return;
    }
    foldSet(0);
    setPhase('ready');
    const timer = window.setTimeout(() => {
      setPhase((p) => (p === 'ready' ? 'folding' : p));
      foldTo(1, 1100, () => setPhase((p) => (p === 'folding' ? 'folded' : p)));
    }, 160);
    return () => window.clearTimeout(timer);
  }, [level, preset, foldSet, foldTo, fallSet]);

  // Auto-unfold shortly after the cut: the reveal is the point of the game.
  useEffect(() => {
    if (phase !== 'cut') return;
    const timer = window.setTimeout(() => {
      setPhase((p) => (p === 'cut' ? 'unfolding' : p));
      foldTo(0, 1150, () => setPhase((p) => (p === 'unfolding' ? 'revealed' : p)));
    }, 460);
    return () => window.clearTimeout(timer);
  }, [phase, foldTo]);

  // Score exactly once per reveal.
  useEffect(() => {
    if (phase !== 'revealed') return;
    const s = scorePaper(result.paper, level.target, level.thresholds);
    setLastScore(s);
    setProgress(recordAttempt(level.id, s.iou, isCleared(s.verdict)));
  }, [phase, result, level]);

  const canPlay = phase === 'folded';
  const canCut = phase === 'ready' || phase === 'folding' || phase === 'folded';

  const handleFold = () => {
    if (phase !== 'ready' && phase !== 'revealed') return;
    setApplied(false);
    setPhase('folding');
    foldTo(1, 1000, () => setPhase((p) => (p === 'folding' ? 'folded' : p)));
  };

  const handleCut = () => {
    if (!canCut) return;
    if (phase !== 'folded') foldSet(1);
    setPhase('cutting');
    setApplied(true);
    fallSet(0);
    fallTo(1, 640, () => setPhase((p) => (p === 'cutting' ? 'cut' : p)));
  };

  const handleUnfold = () => {
    if (phase !== 'cut') return;
    setPhase('unfolding');
    foldTo(0, 1150, () => setPhase((p) => (p === 'unfolding' ? 'revealed' : p)));
  };

  const handleRetry = () => {
    fallSet(0);
    setApplied(false);
    // Stage 1 opens the observation hint by itself; later stages do not.
    setHintLevel(level.stage === 1 ? 1 : 0);
    setShowDiff(false);
    setLastScore(null);
    setDiag(null);
    setNudges(0);
    foldSet(1);
    setPhase('folded');
  };

  const askDiagnosis = () => {
    setDiag(diagnose(cuts, level.foldPreset, level.target, level.thresholds, active));
  };

  const takeNudge = () => {
    if (!diag?.nudge) return;
    setCuts((list) => applyNudge(list, diag.nudge!));
    setNudges((n) => n + 1);
    setDiag(null);
  };

  const handleResetCut = () => {
    setCuts(level.initialGuess);
    setActiveCut(0);
    setDiag(null);
    setNudges(0);
    toast('切线已回到初始位置');
  };

  const updateCut = (index: number, next: Cut) => {
    setCuts((list) => list.map((c, i) => (i === index ? next : c)));
  };

  const nextLevel = LEVELS[level.index % LEVELS.length];
  const angle = Math.round(cutAngleDeg(cut) * 2) / 2;
  // One label used everywhere, so the button and the instructions can never
  // disagree about whether this level is "one cut" or "a bent cut".
  const cutLabel =
    level.cutCount > 1
      ? `剪 ${level.cutCount} 刀`
      : level.canonicalCuts[0]?.kind === 'notch' || level.canonicalCuts[0]?.kind === 'curve'
        ? '剪一剪'
        : '剪一刀';
  // Stage 3 gives no one-tap help; stage 4 has more cuts, so it needs more taps,
  // and a curve has more sliders than a straight cut.
  const nudgeBudget = level.stage === 3 ? 0 : level.stage === 4 ? 8 : level.stage === 5 ? 10 : 6;
  // How many shipped levels sit on each rung — the ladder shows the whole
  // ladder alphabet, not just this level.
  const skillCounts = useMemo(() => {
    const out = Object.fromEntries(SKILL_ORDER.map((s) => [s, 0])) as Record<ScissorSkill, number>;
    for (const l of LEVELS) out[l.skill] += 1;
    return out;
  }, []);
  // Curve-only readouts: stroke length on the paper, and how much of the
  // *result* is smoothly curved. Both come from the same geometry as the score.
  const curveInfo = useMemo(() => {
    if (cut.kind !== 'curve') return null;
    const stroke = visibleStroke(preset, cut);
    return {
      length: stroke?.length ?? 0,
      error: stroke?.error ?? 0,
      inflections: Math.abs(cut.amplitude) <= CURVE_AMPLITUDE_EPS ? 0 : Math.max(0, cut.bends - 1),
    };
  }, [cut, preset]);
  const liveCurveRatio = useMemo(
    () => (cut.kind === 'curve' ? curveRatio(result.paper) : 0),
    [cut.kind, result.paper],
  );
  const bendWord =
    cut.kind !== 'curve'
      ? ''
      : Math.abs(cut.amplitude) <= CURVE_AMPLITUDE_EPS
        ? '直'
        : cut.amplitude > 0
          ? '外凸'
          : '内凹';

  return (
    <>
      <div className="head-row">
        <div>
          <div className="kicker">
            Level {String(level.index).padStart(2, '0')} · {level.stageLabel} ·{' '}
            {preset.shortLabel} · {TIER_LABEL[level.tier]}
          </div>
          <h1 className="level-title">{level.title}</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {level.subtitle} · {preset.layerCount} 层 · {level.symmetryNote}
          </p>
        </div>
        <div className="btn-row" style={{ marginLeft: 'auto' }}>
          <span className={`chip ${level.cutCount > 1 ? 'chip--red' : 'chip--gold'}`}>
            {level.cutSummary}
          </span>
          <span className="chip chip--teal">剪刀能力 · {SKILL_META[level.skill].label}</span>
          <span className={`chip ${progress[level.id]?.cleared ? 'chip--teal' : ''}`}>
            {progress[level.id]?.cleared ? '已通关' : '未通关'}
          </span>
          <span className="chip chip--gold">难度 {'★'.repeat(level.difficulty)}</span>
        </div>
      </div>

      <p className="lede" style={{ maxWidth: 760, marginTop: 12 }}>
        {level.brief}
      </p>

      <SkillLadder current={level.skill} counts={skillCounts} />

      <section className="howto" aria-label="操作说明">
        <button
          className="howto__head"
          onClick={() => setShowHowTo((v) => !v)}
          aria-expanded={showHowTo}
        >
          <span className="kicker">怎么玩 · 四步，不用猜</span>
          <span className="howto__toggle">{showHowTo ? '收起' : '展开'}</span>
        </button>
        <p className="howto__stage">{STAGE_HINT[level.stage]}</p>
        {showHowTo && (
          <ol className="howto__list">
            <li>
              <b>选刀</b>
              {level.cutCount > 1 ? (
                <>
                  ：用切口标签页切换要编辑的那一刀（本关：{level.cutLabels?.join(' / ') ?? '第 1 刀'}），
                  共「{level.cutSummary}」。
                </>
              ) : (
                <>
                  ：本关只有<b>一刀</b>（「{level.cutSummary}」），没有标签页要切。
                </>
              )}
            </li>
            <li>
              <b>调参</b>：
              {cut.kind === 'line'
                ? '「角度 / 距中心 / 剪哪侧」三个控件，滑块松手即重算。'
                : cut.kind === 'notch'
                  ? '「方向 / 顶点距中心 / 张口宽度」三个滑块，松手即重算。'
                  : cut.kind === 'curve'
                    ? '「角度 / 距中心 / 弯曲」三个滑块，加「弯折」三档（弧线 / S 形 / 波浪），松手即重算。'
                    : '「形状 / 方位 / 距中心 / 半宽 / 长宽比 / 转角」，松手即重算。'}
            </li>
            <li>
              <b>看差</b>：右侧「展开预览」边拖边比对；青色是<em>多剪</em>的纸，金色是<em>少剪</em>的纸，
              虚线是目标轮廓。
            </li>
            <li>
              <b>落刀</b>：按「{cutLabel}」→ 展开 → 看本刀评分。达标即可进下一关，
              「完全匹配」只是额外的满分徽章。
            </li>
          </ol>
        )}
        <p className="howto__drag">
          画布直接拖：直线拖两端圆点旋转、拖线身平移；折剪<strong>拖顶点改深度</strong>、
          <strong>拖两臂改方向</strong>；曲线<strong>拖菱形手柄改弯曲</strong>、拖两端圆点转向；
          镂空拖圆心改位置、拖轮廓改转角。
        </p>
      </section>

      <div className="puzzle">
        <div className="puzzle__stage">
          <div className={`stage-card${phase === 'revealed' ? ' is-revealed' : ''}`}>
            <div className="stage-badge">
              <span className="stage-badge__dot" data-phase={phase} aria-hidden="true" />
              {PHASE_LABEL[phase]}
            </div>
            <PaperStage
              preset={preset}
              outcome={applied ? result : uncut}
              foldedness={fold.value}
              cut={cut}
              showCutLine={phase === 'folded' || phase === 'folding' || phase === 'ready'}
              previewRemoved={phase === 'folded' ? result.removedPacket : null}
              onCutChange={canPlay ? (c) => updateCut(active, c) : undefined}
              removedOpacity={phase === 'cutting' ? 1 - fall.value : 0}
              fall={fall.value}
              showCreases={phase !== 'revealed'}
              targetOutline={phase === 'revealed' ? level.target : null}
              diffExtra={phase === 'revealed' && showDiff ? lastScore?.extra : null}
              diffMissing={phase === 'revealed' && showDiff ? lastScore?.missing : null}
              ariaLabel={`${level.title}：当前折叠与剪切状态`}
            />
          </div>

          <div className="actionbar">
            <button className="btn btn--ghost" onClick={handleFold} disabled={!(phase === 'ready' || phase === 'revealed')}>
              折叠
            </button>
            <button className="btn btn--primary" onClick={handleCut} disabled={!canCut}>
              {cutLabel}
            </button>
            <button className="btn btn--ghost" onClick={handleUnfold} disabled={phase !== 'cut'}>
              展开
            </button>
            <button className="btn btn--quiet" onClick={handleRetry}>
              重试
            </button>
            <button
              className="btn btn--quiet"
              onClick={() => setHintLevel((h) => (h + 1) % 4)}
              aria-label="查看提示"
            >
              提示 {hintLevel > 0 ? `${Math.min(hintLevel, 3)}/3` : ''}
            </button>
          </div>

          {result.warnings.length > 0 && canPlay && (
            <div className="warn" style={{ marginTop: 10 }}>
              {result.warnings[0]}
            </div>
          )}

          {hintLevel > 0 && (
            <div className="card card--pad reveal" style={{ marginTop: 14 }}>
              <div className="kicker">提示</div>
              <ol className="hint-list">
                {hintLevel >= 1 && <li>{level.hints.observe}</li>}
                {hintLevel >= 2 && <li>{level.hints.operate}</li>}
                {hintLevel >= 3 && <li>{level.hints.solution}</li>}
              </ol>
            </div>
          )}
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card card--pad">
            <div className="panel-title">
              <h3>展开预览</h3>
              <span>
                {formatPercent(liveScore.iou)} · {isCleared(liveScore.verdict) ? '已达标' : '未达标'}
              </span>
            </div>
            <div className="target-frame">
              <PaperStage
                preset={preset}
                outcome={result}
                foldedness={0}
                paperColor="#B93645"
                accentColor="#D84A49"
                showCreases={false}
                noZoom
                targetOutline={showTarget ? level.target : null}
                diffExtra={showTarget ? liveScore.extra : null}
                diffMissing={showTarget ? liveScore.missing : null}
                ariaLabel="实时展开预览与目标对照"
              />
            </div>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button
                className={`btn btn--sm ${showTarget ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => setShowTarget((v) => !v)}
                aria-pressed={showTarget}
              >
                对照目标
              </button>
              <span className="note">拖动滑块时实时更新</span>
            </div>
            <p className="note" style={{ marginTop: 6 }}>
              青色 = 多剪的纸，金色 = 少剪的纸，金色虚线 = 目标轮廓。
            </p>
          </div>

          <div className="card card--pad">
            <div className="panel-title">
              <h3>剪切参数</h3>
              <span className="mono">
                吻合 {formatPercent(liveScore.iou, 0)}
                {isCleared(liveScore.verdict) ? ' ✓' : ''}
              </span>
            </div>

            {level.cutCount > 1 && (
              <div className="cut-tabs" role="tablist" aria-label="选择要编辑的切口">
                {/* Tabs carry the role of each cut, not just its index. */}
                {cuts.map((_, i) => (
                  <button
                    key={`cut-tab-${i}`}
                    role="tab"
                    aria-selected={i === active}
                    className={`cut-tab${i === active ? ' is-active' : ''}`}
                    onClick={() => setActiveCut(i)}
                    disabled={!canPlay}
                  >
                    {level.cutLabels?.[i] ?? `第 ${i + 1} 刀`}
                  </button>
                ))}
              </div>
            )}

            {cut.kind === 'line' ? (
              <>
                <div className="control">
                  <div className="control__head">
                    <span className="control__label">角度</span>
                    <span className="control__value mono">{angle}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={179.5}
                    step={0.5}
                    value={angle}
                    disabled={!canPlay}
                    aria-label="切线法线角度（度）"
                    onChange={(e) =>
                      updateCut(active, cutFromAngle(Number(e.target.value), cut.offset, cut.removedSide))
                    }
                  />
                </div>

                <div className="control">
                  <div className="control__head">
                    <span className="control__label">距中心</span>
                    <span className="control__value mono">{cut.offset.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={-1.6}
                    max={1.6}
                    step={0.01}
                    value={cut.offset}
                    disabled={!canPlay}
                    aria-label="切线与纸包中心的距离"
                    onChange={(e) => updateCut(active, { ...cut, offset: Number(e.target.value) })}
                  />
                </div>

                <div className="control">
                  <div className="control__head">
                    <span className="control__label">剪去哪一侧</span>
                  </div>
                  <div className="segmented" role="group" aria-label="选择剪去的半平面">
                    <button
                      className={`segmented__item${cut.removedSide === 'negative' ? ' is-active' : ''}`}
                      onClick={() => updateCut(active, { ...cut, removedSide: 'negative' })}
                      disabled={!canPlay}
                    >
                      法向负侧
                    </button>
                    <button
                      className={`segmented__item${cut.removedSide === 'positive' ? ' is-active' : ''}`}
                      onClick={() => updateCut(active, { ...cut, removedSide: 'positive' })}
                      disabled={!canPlay}
                    >
                      法向正侧
                    </button>
                  </div>
                </div>
              </>
            ) : cut.kind === 'notch' ? (
              <>
                <div className="control">
                  <div className="control__head">
                    <span className="control__label">折剪方向</span>
                    <span className="control__value mono">{Math.round(cut.angle * 2) / 2}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={179.5}
                    step={0.5}
                    value={Math.round(cut.angle * 2) / 2}
                    disabled={!canPlay}
                    aria-label="折剪方向（度）"
                    onChange={(e) => updateCut(active, { ...cut, angle: Number(e.target.value) })}
                  />
                </div>

                <div className="control">
                  <div className="control__head">
                    <span className="control__label">顶点距中心</span>
                    <span className="control__value mono">{cut.distance.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.01}
                    value={cut.distance}
                    disabled={!canPlay}
                    aria-label="折剪顶点与纸包中心的距离"
                    onChange={(e) => updateCut(active, { ...cut, distance: Number(e.target.value) })}
                  />
                </div>

                <div className="control">
                  <div className="control__head">
                    <span className="control__label">张口宽度</span>
                    <span className="control__value mono">{cut.width.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={0.9}
                    step={0.01}
                    value={cut.width}
                    disabled={!canPlay}
                    aria-label="折剪张口宽度"
                    onChange={(e) => updateCut(active, { ...cut, width: Number(e.target.value) })}
                  />
                </div>
              </>
            ) : cut.kind === 'curve' ? (
              <>
                <div className="control">
                  <div className="control__head">
                    <span className="control__label">角度</span>
                    <span className="control__value mono">{Math.round(cut.angle * 2) / 2}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={179.5}
                    step={0.5}
                    value={Math.round(cut.angle * 2) / 2}
                    disabled={!canPlay}
                    aria-label="切口法线角度（度）"
                    onChange={(e) => updateCut(active, { ...cut, angle: Number(e.target.value) })}
                  />
                </div>

                <div className="control">
                  <div className="control__head">
                    <span className="control__label">距中心</span>
                    <span className="control__value mono">{cut.offset.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={-1.6}
                    max={1.6}
                    step={0.01}
                    value={cut.offset}
                    disabled={!canPlay}
                    aria-label="切口与纸包中心的距离"
                    onChange={(e) => updateCut(active, { ...cut, offset: Number(e.target.value) })}
                  />
                </div>

                <div className="control">
                  <div className="control__head">
                    <span className="control__label">弯曲</span>
                    <span className="control__value mono">
                      {cut.amplitude >= 0 ? '+' : '−'}
                      {Math.abs(cut.amplitude).toFixed(2)}
                      <em className="control__tag" data-flat={Math.abs(cut.amplitude) <= CURVE_AMPLITUDE_EPS}>
                        {bendWord}
                      </em>
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={cut.amplitude}
                    disabled={!canPlay}
                    aria-label="弯曲幅度，0 为直线"
                    onChange={(e) => updateCut(active, { ...cut, amplitude: Number(e.target.value) })}
                  />
                  <div className="control__scale">
                    <span>内凹</span>
                    <span>0 = 直线</span>
                    <span>外凸</span>
                  </div>
                </div>

                <div className="control">
                  <div className="control__head">
                    <span className="control__label">弯折</span>
                    <span className="control__value mono">
                      {cut.bends === 1 ? '1 段弧' : cut.bends === 2 ? '1 个拐点' : '2 个拐点'}
                    </span>
                  </div>
                  <div className="segmented" role="group" aria-label="弯折次数">
                    {(
                      [
                        [1, '弧线'],
                        [2, 'S 形'],
                        [3, '波浪'],
                      ] as [CurveBends, string][]
                    ).map(([n, label]) => (
                      <button
                        key={n}
                        className={`segmented__item${cut.bends === n ? ' is-active' : ''}`}
                        aria-pressed={cut.bends === n}
                        onClick={() => updateCut(active, { ...cut, bends: n })}
                        disabled={!canPlay}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="control__scale">
                    <span>刀不拐弯</span>
                    <span>转向一次</span>
                    <span>连续起伏</span>
                  </div>
                </div>

                <div className="control">
                  <div className="control__head">
                    <span className="control__label">剪去哪一侧</span>
                  </div>
                  <div className="segmented" role="group" aria-label="选择剪去的一侧">
                    <button
                      className={`segmented__item${cut.removedSide === 'negative' ? ' is-active' : ''}`}
                      onClick={() => updateCut(active, { ...cut, removedSide: 'negative' })}
                      disabled={!canPlay}
                    >
                      法向负侧
                    </button>
                    <button
                      className={`segmented__item${cut.removedSide === 'positive' ? ' is-active' : ''}`}
                      onClick={() => updateCut(active, { ...cut, removedSide: 'positive' })}
                      disabled={!canPlay}
                    >
                      法向正侧
                    </button>
                  </div>
                </div>

                <div className="readout" role="status" aria-live="off">
                  <span>
                    切口长 <b>{(curveInfo?.length ?? 0).toFixed(2)}</b>
                  </span>
                  <span>
                    拐点 <b>{curveInfo?.inflections ?? 0}</b>
                  </span>
                  <span title="展开后：边界上平滑转向的长度占比，由目标几何实测">
                    曲边占比 <b>{Math.round(liveCurveRatio * 100)}%</b>
                  </span>
                  <span title="折线逼近正弦曲线的最大偏差（板宽 2）；目标与作答用同一个采样器，所以评分不受影响">
                    折线误差 <b>{(curveInfo?.error ?? 0).toFixed(4)}</b>
                  </span>
                </div>
              </>
            ) : null}

            <p className="note" style={{ marginTop: 6 }}>
              {level.cutLabels?.[active] ?? `第 ${active + 1} 刀`} · {describeCut(cut)}
              <br />
              也可以直接在纸上拖动：拖线身平移、拖圆点旋转；折剪拖顶点改深度、拖两臂改方向。
            </p>

            <div className="diag">
              <div className="btn-row">
                <button className="btn btn--ghost btn--sm" onClick={askDiagnosis} disabled={!canPlay}>
                  差在哪？
                </button>
                <button
                  className="btn btn--quiet btn--sm"
                  onClick={handleResetCut}
                  disabled={!canPlay}
                >
                  重置
                </button>
                {diag?.nudge && nudges < nudgeBudget && (
                  <button className="btn btn--primary btn--sm" onClick={takeNudge}>
                    按建议调整（{nudges}/{nudgeBudget}）
                  </button>
                )}
              </div>
              {diag && (
                <div className="diag__box" role="status" aria-live="polite">
                  <strong>{diag.headline}</strong>
                  <p>{diag.detail}</p>
                  {level.stage === 3 && (
                    <p className="note">阶段 3 不提供一键微调，请按方向自己调。</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {phase === 'revealed' && lastScore && (
            <div className="card card--pad reveal score-card">
              <div className="panel-title">
                <h3>本刀评分</h3>
                <span>几何比对</span>
              </div>
              <div className={`verdict verdict--${lastScore.verdict}`}>
                <span className="verdict__dot" aria-hidden="true" />
                <div className="verdict__text">
                  <strong>{VERDICT_LABEL[lastScore.verdict]}</strong>
                  <span className="muted">
                    {lastScore.verdict === 'exact'
                      ? '在容差内与目标完全一致，满分。'
                      : lastScore.verdict === 'pass'
                        ? '已达到本关要求，可以进下一关。'
                        : lastScore.verdict === 'near'
                          ? '形状接近了，还差一点。'
                          : '还差得比较多，先看「差在哪？」。'}
                  </span>
                </div>
              </div>

              <div className="metrics">
                <div className="metric">
                  <div className="metric__label">IoU</div>
                  <div className="metric__value">{formatPercent(lastScore.iou)}</div>
                </div>
                <div className="metric">
                  <div className="metric__label">本关达标线</div>
                  <div className="metric__value">{formatPercent(level.thresholds.passIou, 0)}</div>
                </div>
                <div className="metric">
                  <div className="metric__label">实得面积</div>
                  <div className="metric__value">{lastScore.actualArea.toFixed(2)}</div>
                </div>
              </div>

              {!isCleared(lastScore.verdict) && (
                <p className="verdict__gap">
                  还差 <b>{(lastScore.gap * 100).toFixed(1)}</b> 个点到达标线。
                  {lastScore.actualArea > lastScore.targetArea
                    ? '留下的纸比目标多，说明剪少了。'
                    : lastScore.actualArea < lastScore.targetArea
                      ? '留下的纸比目标少，说明剪多了。'
                      : '面积对了，位置还差一点。'}
                </p>
              )}

              <div className="btn-row" style={{ marginTop: 12 }}>
                <button
                  className={`btn btn--sm ${showDiff ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setShowDiff((v) => !v)}
                  aria-pressed={showDiff}
                >
                  差异覆盖
                </button>
                <button className="btn btn--ghost btn--sm" onClick={handleRetry}>
                  再来一次
                </button>
                {isCleared(lastScore.verdict) && (
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={() => navigate(`/puzzle/${nextLevel.id}`)}
                  >
                    下一关
                  </button>
                )}
              </div>
              <p className="note" style={{ marginTop: 10 }}>
                青色 = 多剪的纸，金色 = 少剪的纸；金色虚线是目标轮廓。
                达标线按阶段放宽（{formatPercent(level.thresholds.passIou, 0)}），
                「完全匹配」是额外的满分徽章，不是通关条件。
              </p>
            </div>
          )}

          <div className="card card--pad">
            <div className="panel-title">
              <h3>目标图案</h3>
              <span>{formatPercent(level.targetArea / 4, 0)} 保留</span>
            </div>
            <div className="target-frame">
              <MiniPattern
                paper={level.target}
                color="#B93645"
                label={`${level.title}的目标图案`}
              />
            </div>
            <p className="note" style={{ marginTop: 10 }}>
              {preset.description}
            </p>
          </div>

          <div className="card card--pad">
            <div className="panel-title">
              <h3>知识点</h3>
              <span>Math</span>
            </div>
            <p className="note" style={{ fontSize: 13.5 }}>
              {level.knowledge}
            </p>
          </div>

          {level.patternDoc && (
            <details className="card card--pad archive">
              <summary className="archive__summary">
                <span>图案档案</span>
                <span className="archive__meta">{level.stageLabel} · 折叠 / 切割 / 展开</span>
              </summary>
              <dl className="doc">
                <dt>折叠结构</dt>
                <dd>{level.patternDoc.fold}</dd>
                <dt>切割逻辑</dt>
                <dd>
                  <ol className="doc__cuts">
                    {level.patternDoc.cuts.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>
                </dd>
                <dt>展开效果</dt>
                <dd>{level.patternDoc.unfold}</dd>
                {level.patternDoc.source && (
                  <>
                    <dt>研究灵感</dt>
                    <dd className="doc__source">{level.patternDoc.source}</dd>
                  </>
                )}
              </dl>
            </details>
          )}

          <div className="card card--pad">
            <div className="panel-title">
              <h3>关卡</h3>
              <span>{LEVELS.length} 关</span>
            </div>
            <div className="level-list">
              {LEVELS.map((l) => (
                <button
                  key={l.id}
                  className={`level-item${l.id === level.id ? ' is-active' : ''}${
                    progress[l.id]?.cleared ? ' is-cleared' : ''
                  }`}
                  onClick={() => navigate(`/puzzle/${l.id}`)}
                >
                  <span className="level-item__idx">{String(l.index).padStart(2, '0')}</span>
                  <span className="level-item__body">
                    <span className="level-item__title">
                      {l.title}
                      {/* 「2 刀」 and 「两刀」 say the same thing; show the count
                          only when it tells the player something new. */}
                      {l.cutCount > 1 && !(l.skill === 'two' && l.cutCount === 2)
                        ? ` · ${l.cutCount} 刀`
                        : ''}{' '}
                      · {SKILL_META[l.skill].label}
                    </span>
                    <span className="level-item__sub">{l.subtitle}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
      {toastNode}
    </>
  );
}
