import { useEffect, useMemo, useState } from 'react';

import { navigate } from '../app/router';
import { MiniPattern } from '../components/MiniPattern';
import { PaperStage } from '../components/PaperStage';
import { useToast } from '../components/Toast';
import {
  applyCuts,
  cutAngleDeg,
  cutFromAngle,
  describeCut,
  type StraightCut,
} from '../geometry/cut';
import { getPreset } from '../geometry/fold';
import { formatPercent, scorePaper, VERDICT_LABEL, type ScoreResult } from '../geometry/score';
import { useAnimatedValue } from '../hooks/useAnimatedValue';
import { LEVELS, getLevel } from '../puzzle/levels';
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

  const [cut, setCut] = useState<StraightCut>(level.initialGuess);
  const [phase, setPhase] = useState<Phase>('ready');
  const [applied, setApplied] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [showDiff, setShowDiff] = useState(false);
  const [lastScore, setLastScore] = useState<ScoreResult | null>(null);
  const [progress, setProgress] = useState<ProgressDoc>(() => loadProgress());

  const fold = useAnimatedValue(0);
  const fall = useAnimatedValue(0);
  const { show: toast, node: toastNode } = useToast();

  const result = useMemo(() => applyCuts(level.foldPreset, [cut]), [level.foldPreset, cut]);

  const foldSet = fold.set;
  const foldTo = fold.animateTo;
  const fallSet = fall.set;
  const fallTo = fall.animateTo;

  // Reset when the level changes.
  useEffect(() => {
    setCut(level.initialGuess);
    setApplied(false);
    setHintLevel(0);
    setShowDiff(false);
    setLastScore(null);
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
      foldTo(1, 900, () => setPhase((p) => (p === 'folding' ? 'folded' : p)));
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
    setProgress(recordAttempt(level.id, s.iou, s.verdict === 'perfect'));
  }, [phase, result, level]);

  const canPlay = phase === 'folded';

  const handleFold = () => {
    if (phase !== 'ready' && phase !== 'revealed') return;
    setApplied(false);
    setPhase('folding');
    foldTo(1, 900, () => setPhase((p) => (p === 'folding' ? 'folded' : p)));
  };

  /** Allowed while the fold animation is still running: it snaps to folded first. */
  const canCut = phase === 'ready' || phase === 'folding' || phase === 'folded';

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
    setHintLevel(0);
    setShowDiff(false);
    setLastScore(null);
    foldSet(1);
    setPhase('folded');
  };

  const handleResetCut = () => {
    setCut(level.initialGuess);
    toast('切线已回到初始位置');
  };

  const nextLevel = LEVELS[level.index % LEVELS.length];
  const angle = Math.round(cutAngleDeg(cut));

  return (
    <>
      <div className="head-row">
        <div>
          <div className="kicker">
            Level {String(level.index).padStart(2, '0')} · {preset.shortLabel}
          </div>
          <h1 className="level-title">{level.title}</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {level.subtitle} · {preset.layerCount} 层 · {level.symmetryNote}
          </p>
        </div>
        <div className="btn-row" style={{ marginLeft: 'auto' }}>
          <span className={`chip ${progress[level.id]?.cleared ? 'chip--teal' : ''}`}>
            {progress[level.id]?.cleared ? '已通关' : '未通关'}
          </span>
          <span className="chip chip--gold">难度 {'★'.repeat(level.difficulty)}</span>
        </div>
      </div>

      <p className="lede" style={{ maxWidth: 720, marginTop: 12 }}>
        {level.brief}
      </p>

      <div className="puzzle">
        <div>
          <div className={`stage-card${phase === 'revealed' ? ' is-revealed' : ''}`}>
            <div className="stage-badge">
              <span
                className="stage-badge__dot"
                data-phase={phase}
                aria-hidden="true"
              />
              {PHASE_LABEL[phase]}
            </div>
            <PaperStage
              preset={preset}
              outcome={applied ? result : uncut}
              foldedness={fold.value}
              cut={cut}
              showCutLine={phase === 'folded' || phase === 'folding' || phase === 'ready'}
              previewRemoved={phase === 'folded' ? result.removedPacket : null}
              onCutChange={canPlay ? setCut : undefined}
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
            <button
              className="btn btn--primary"
              onClick={handleCut}
              disabled={!canCut}
            >
              剪一刀
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
              <h3>剪切参数</h3>
              <button className="btn btn--quiet btn--sm" onClick={handleResetCut} disabled={!canPlay}>
                重置
              </button>
            </div>

            <div className="control">
              <div className="control__head">
                <span className="control__label">切线角度</span>
                <span className="control__value mono">{angle}°</span>
              </div>
              <input
                type="range"
                min={0}
                max={179}
                step={1}
                value={angle}
                disabled={!canPlay}
                aria-label="切线法线角度（度）"
                onChange={(e) => setCut(cutFromAngle(Number(e.target.value), cut.offset, cut.removedSide))}
              />
            </div>

            <div className="control">
              <div className="control__head">
                <span className="control__label">距纸包中心</span>
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
                onChange={(e) => setCut({ ...cut, offset: Number(e.target.value) })}
              />
            </div>

            <div className="control">
              <div className="control__head">
                <span className="control__label">剪去哪一侧</span>
              </div>
              <div className="segmented" role="group" aria-label="选择剪去的半平面">
                <button
                  className={`segmented__item${cut.removedSide === 'negative' ? ' is-active' : ''}`}
                  onClick={() => setCut({ ...cut, removedSide: 'negative' })}
                  disabled={!canPlay}
                >
                  法向负侧
                </button>
                <button
                  className={`segmented__item${cut.removedSide === 'positive' ? ' is-active' : ''}`}
                  onClick={() => setCut({ ...cut, removedSide: 'positive' })}
                  disabled={!canPlay}
                >
                  法向正侧
                </button>
              </div>
            </div>

            <p className="note" style={{ marginTop: 6 }}>
              当前：{describeCut(cut)}
              <br />
              也可以直接在纸上拖动切线，或拖动两端的圆点旋转。
            </p>
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
                    {lastScore.verdict === 'perfect'
                      ? '在容差内与目标完全一致。'
                      : lastScore.verdict === 'close'
                        ? '很接近了，再调一点点。'
                        : '还差得比较多，看看差异区域。'}
                  </span>
                </div>
              </div>
              <div className="metrics">
                <div className="metric">
                  <div className="metric__label">IoU</div>
                  <div className="metric__value">{formatPercent(lastScore.iou)}</div>
                </div>
                <div className="metric">
                  <div className="metric__label">对称差</div>
                  <div className="metric__value">{formatPercent(lastScore.symmetricRatio)}</div>
                </div>
                <div className="metric">
                  <div className="metric__label">实得面积</div>
                  <div className="metric__value">{lastScore.actualArea.toFixed(2)}</div>
                </div>
              </div>
              <div className="btn-row" style={{ marginTop: 12 }}>
                <button
                  className={`btn btn--sm ${showDiff ? 'btn--primary' : 'btn--ghost'}`}
                  onClick={() => setShowDiff((v) => !v)}
                  aria-pressed={showDiff}
                >
                  差异覆盖
                </button>
                <button className="btn btn--ghost btn--sm" onClick={handleRetry}>
                  再来一刀
                </button>
                {lastScore.verdict === 'perfect' && (
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
              </p>
            </div>
          )}

          <div className="card card--pad">
            <div className="panel-title">
              <h3>知识点</h3>
              <span>Math</span>
            </div>
            <p className="note" style={{ fontSize: 13.5 }}>
              {level.knowledge}
            </p>
          </div>

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
                    <span className="level-item__title">{l.title}</span>
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
