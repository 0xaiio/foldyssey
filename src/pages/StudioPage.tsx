import { useEffect, useMemo, useState } from 'react';

import { navigate } from '../app/router';
import { takeAiDraft } from '../ai/draft';
import { MiniPattern } from '../components/MiniPattern';
import { PaperStage } from '../components/PaperStage';
import { useToast } from '../components/Toast';
import {
  applyCuts,
  changeCutKind,
  clampBends,
  curveCut,
  cutAngleDeg,
  cutFromAngle,
  describeCut,
  notchCut,
  type Cut,
  type CurveBends,
  type HoleShape,
} from '../geometry/cut';
import { FOLD_PRESETS, type FoldPresetId, getPreset } from '../geometry/fold';
import { multiPolygonArea } from '../geometry/polygon';
import { useAnimatedValue } from '../hooks/useAnimatedValue';
import { downloadPng, downloadSvg } from '../services/export';
import { SKILL_META, skillOf } from '../puzzle/skill';
import {
  type ArtworkDoc,
  type StyleDoc,
  SCHEMA_VERSION,
  loadArtworks,
  makeId,
  saveArtwork,
} from '../services/storage';

const CUT_KIND_LABEL: Record<Cut['kind'], string> = {
  line: '直线',
  curve: '曲线',
  notch: '折剪',
  hole: '镂空',
};

type StudioState = {
  foldPreset: FoldPresetId;
  cuts: Cut[];
  style: StyleDoc;
};

const PALETTES: { id: string; label: string; style: StyleDoc; swatch: string }[] = [
  { id: 'red', label: '中国红', style: { paper: '#B93645', background: '#F8F3E9' }, swatch: '#B93645' },
  { id: 'cinnabar', label: '朱砂', style: { paper: '#D84A49', background: '#FBF1E6' }, swatch: '#D84A49' },
  { id: 'ink', label: '墨', style: { paper: '#242725', background: '#F2ECE1' }, swatch: '#242725' },
  { id: 'gold', label: '暖金', style: { paper: '#C9A46A', background: '#2A2724' }, swatch: '#C9A46A' },
  { id: 'teal', label: '青', style: { paper: '#378C86', background: '#F4F1E8' }, swatch: '#378C86' },
];

const initialState: StudioState = {
  foldPreset: 'orthogonal2',
  cuts: [cutFromAngle(45, 0.4, 'negative')],
  style: PALETTES[0].style,
};

export function StudioPage({ artworkId }: { artworkId?: string }) {
  const [state, setState] = useState<StudioState>(initialState);
  const [past, setPast] = useState<StudioState[]>([]);
  const [future, setFuture] = useState<StudioState[]>([]);
  const [active, setActive] = useState(0);
  const [title, setTitle] = useState('未命名剪纸');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [createdAt, setCreatedAt] = useState<number | null>(null);
  const { show: toast, node: toastNode } = useToast();
  const fold = useAnimatedValue(1);

  const preset = useMemo(() => getPreset(state.foldPreset), [state.foldPreset]);
  const result = useMemo(() => applyCuts(state.foldPreset, state.cuts), [state.foldPreset, state.cuts]);
  const activeCut = state.cuts[Math.min(active, state.cuts.length - 1)];
  // Inside the 8-fold wedge only 0..45° is meaningful.
  const angleMax = state.foldPreset === 'radial8' ? 45 : 180;

  const area = multiPolygonArea(result.paper);
  const holeCount = result.paper.reduce((n, poly) => n + Math.max(0, poly.length - 1), 0);
  const studioSkill = skillOf(state.cuts);

  useEffect(() => {
    if (!artworkId) return;
    const found = loadArtworks().find((a) => a.id === artworkId);
    if (!found) {
      toast('没有找到这件作品，已打开空白工坊。');
      return;
    }
    setState({ foldPreset: found.foldPreset, cuts: found.cuts, style: found.style });
    setTitle(found.title);
    setEditingId(found.id);
    setCreatedAt(found.createdAt);
    setPast([]);
    setFuture([]);
    setActive(0);
  }, [artworkId, toast]);

  // Hand-off from the AI page: it only passes parameters. The geometry is
  // recomputed here by the same engine, so the studio stays the single source
  // of truth and the draft can be edited like any hand-made design.
  useEffect(() => {
    if (artworkId) return;
    const draft = takeAiDraft();
    if (!draft) return;
    setState({ foldPreset: draft.foldPreset, cuts: draft.cuts, style: draft.style });
    setTitle(draft.title || 'AI 灵感');
    setPast([]);
    setFuture([]);
    setActive(0);
    toast('已载入 AI 生成的设计参数，可继续调整。');
  }, [artworkId, toast]);

  const beginEdit = () => {
    setPast((p) => [...p.slice(-49), state]);
    setFuture([]);
  };

  const commit = (next: StudioState) => setState(next);

  const updateCut = (index: number, next: Cut) => {
    commit({ ...state, cuts: state.cuts.map((c, i) => (i === index ? next : c)) });
  };

  const undo = () => {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([state, ...future]);
    setState(prev);
    setActive(0);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(future.slice(1));
    setPast([...past, state]);
    setState(next);
  };

  const addCut = () => {
    if (state.cuts.length >= 3) {
      toast('当前版本最多支持 3 条切口。');
      return;
    }
    beginEdit();
    const last = state.cuts[state.cuts.length - 1];
    // A new cut always starts as a straight cut; the sliders can turn it into
    // a notch/hole afterwards, so the seed only needs to be reasonable.
    const seedAngle = (cutAngleDeg(last) + 45) % 180;
    const seedOffset = last.kind === 'line' ? Math.min(1.2, last.offset + 0.18) : 0.7;
    const seedSide = last.kind === 'line' ? last.removedSide : 'negative';
    const next: Cut = cutFromAngle(seedAngle, seedOffset, seedSide);
    commit({ ...state, cuts: [...state.cuts, next] });
    setActive(state.cuts.length);
  };

  const removeCut = (index: number) => {
    if (state.cuts.length <= 1) {
      toast('至少保留一条切口。');
      return;
    }
    beginEdit();
    commit({ ...state, cuts: state.cuts.filter((_, i) => i !== index) });
    setActive(0);
  };

  const handleSave = () => {
    const now = Date.now();
    const doc: ArtworkDoc = {
      schemaVersion: SCHEMA_VERSION,
      id: editingId ?? makeId(),
      title: title.trim() || '未命名剪纸',
      createdAt: createdAt ?? now,
      updatedAt: now,
      foldPreset: state.foldPreset,
      cuts: state.cuts,
      style: state.style,
      manufacturability: state.cuts.length === 1 ? 'unchecked' : 'digital-only',
    };
    const res = saveArtwork(doc);
    if (!res.ok) {
      toast(res.error ?? '保存失败');
      return;
    }
    setEditingId(doc.id);
    setCreatedAt(doc.createdAt);
    toast('已保存到「我的作品」（仅存于本机浏览器）');
  };

  const exportStyle = {
    paperColor: state.style.paper,
    backgroundColor: state.style.background,
    title,
  };

  return (
    <>
      <div className="head-row">
        <div>
          <div className="kicker">Paper Art Studio</div>
          <h1 className="level-title">剪纸工坊</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            左边是折叠后的纸包，右边是实时展开的图案。所有形状都由同一个几何引擎计算。
          </p>
        </div>
        <div className="btn-row" style={{ marginLeft: 'auto' }}>
          <button className="btn btn--quiet btn--sm" onClick={undo} disabled={past.length === 0}>
            撤销
          </button>
          <button className="btn btn--quiet btn--sm" onClick={redo} disabled={future.length === 0}>
            重做
          </button>
          <button
            className="btn btn--quiet btn--sm"
            onClick={() => {
              beginEdit();
              commit(initialState);
              setActive(0);
              toast('已重置为默认图案');
            }}
          >
            重置
          </button>
        </div>
      </div>

      <div className="studio">
        <div className="studio__stages">
          <div className="card card--pad">
            <div className="panel-title">
              <h3>折叠纸包</h3>
              <span>{preset.layerCount} 层</span>
            </div>
            <div className="stage-card stage-card--flat" onPointerDown={beginEdit}>
              <PaperStage
                preset={preset}
                outcome={result}
                foldedness={fold.value}
                cut={activeCut}
                showCutLine
                onCutChange={(c) => updateCut(Math.min(active, state.cuts.length - 1), c)}
                paperColor={state.style.paper}
                accentColor="#D84A49"
                showCreases
                ariaLabel="折叠后的纸包与当前切线"
              />
            </div>
            <p className="note" style={{ marginTop: 8 }}>
              拖动纸面平移切口；拖动圆点旋转或改变大小。{activeCut ? describeCut(activeCut) : ''}
            </p>
          </div>

          <div className="card card--pad">
            <div className="panel-title">
              <h3>展开预览</h3>
              <span>实时</span>
            </div>
            <div
              className="stage-card stage-card--flat"
              style={{ background: state.style.background }}
            >
              <PaperStage
                preset={preset}
                outcome={result}
                foldedness={0}
                paperColor={state.style.paper}
                accentColor="#D84A49"
                showCreases={false}
                ariaLabel="展开后的剪纸图案"
              />
            </div>
            <div className="metrics" style={{ marginTop: 8 }}>
              <div className="metric">
                <div className="metric__label">保留面积</div>
                <div className="metric__value">{((area / 4) * 100).toFixed(1)}%</div>
              </div>
              <div className="metric">
                <div className="metric__label">孔洞</div>
                <div className="metric__value">{holeCount}</div>
              </div>
              <div className="metric">
                <div className="metric__label">切口</div>
                <div className="metric__value">{state.cuts.length}</div>
              </div>
            </div>
          </div>
        </div>

        <aside className="studio__side">
          <div className="card card--pad">
            <div className="panel-title">
              <h3>折叠方案</h3>
              <span>合法预设</span>
            </div>
            <div className="segmented" role="group" aria-label="折叠方案">
              {FOLD_PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`segmented__item${state.foldPreset === p.id ? ' is-active' : ''}`}
                  onClick={() => {
                    beginEdit();
                    commit({ ...state, foldPreset: p.id });
                    setActive(0);
                  }}
                >
                  {p.shortLabel}
                </button>
              ))}
            </div>
            <p className="note" style={{ marginTop: 8 }}>
              {preset.description}
            </p>
          </div>

          <div className="card card--pad">
            <div className="panel-title">
              <h3>切口</h3>
              <span>
                {state.cuts.length} / 3 · {SKILL_META[studioSkill].label}
              </span>
            </div>
            <div className="cut-tabs">
              {state.cuts.map((_, i) => (
                <button
                  key={`tab-${i}`}
                  className={`cut-tab${i === active ? ' is-active' : ''}`}
                  onClick={() => setActive(i)}
                >
                  切口 {i + 1}
                </button>
              ))}
              <button className="cut-tab cut-tab--add" onClick={addCut} aria-label="增加一条切口">
                +
              </button>
            </div>

            {/* 刀型: the one control that turns a stroke into a different
                primitive. Kept above the sliders because it changes which
                sliders exist, not just their values. */}
            {activeCut && (
              <div className="control" style={{ paddingTop: 0 }}>
                <div className="control__head">
                  <span className="control__label">刀型</span>
                  <span className="control__value mono">{CUT_KIND_LABEL[activeCut.kind]}</span>
                </div>
                <div className="segmented" role="group" aria-label="切换切口类型">
                  {(['line', 'curve', 'notch', 'hole'] as const).map((k) => (
                    <button
                      key={k}
                      className={`segmented__item${activeCut.kind === k ? ' is-active' : ''}`}
                      aria-pressed={activeCut.kind === k}
                      onClick={() => {
                        beginEdit();
                        updateCut(active, changeCutKind(activeCut, k));
                      }}
                    >
                      {CUT_KIND_LABEL[k]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeCut && activeCut.kind === 'line' && (
              <>
                <div className="control">
                  <div className="control__head">
                    <span className="control__label">法线角度</span>
                    <span className="control__value mono">{Math.round(cutAngleDeg(activeCut))}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={179}
                    step={1}
                    value={Math.round(cutAngleDeg(activeCut))}
                    aria-label="切口角度"
                    onPointerDown={beginEdit}
                    onKeyDown={beginEdit}
                    onChange={(e) =>
                      updateCut(
                        active,
                        cutFromAngle(Number(e.target.value), activeCut.offset, activeCut.removedSide),
                      )
                    }
                  />
                </div>
                <div className="control">
                  <div className="control__head">
                    <span className="control__label">距中心</span>
                    <span className="control__value mono">{activeCut.offset.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={-1.6}
                    max={1.6}
                    step={0.01}
                    value={activeCut.offset}
                    aria-label="切口与纸包中心的距离"
                    onPointerDown={beginEdit}
                    onKeyDown={beginEdit}
                    onChange={(e) => updateCut(active, { ...activeCut, offset: Number(e.target.value) })}
                  />
                </div>
                <div className="segmented" role="group" aria-label="剪去哪一侧" style={{ marginTop: 4 }}>
                  <button
                    className={`segmented__item${activeCut.removedSide === 'negative' ? ' is-active' : ''}`}
                    onClick={() => {
                      beginEdit();
                      updateCut(active, { ...activeCut, removedSide: 'negative' });
                    }}
                  >
                    负侧
                  </button>
                  <button
                    className={`segmented__item${activeCut.removedSide === 'positive' ? ' is-active' : ''}`}
                    onClick={() => {
                      beginEdit();
                      updateCut(active, { ...activeCut, removedSide: 'positive' });
                    }}
                  >
                    正侧
                  </button>
                </div>
              </>
            )}

            {activeCut && activeCut.kind === 'curve' && (
              <>
                <div className="control">
                  <div className="control__head">
                    <span className="control__label">法线角度</span>
                    <span className="control__value mono">{Math.round(activeCut.angle)}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={179}
                    step={1}
                    value={Math.round(activeCut.angle)}
                    aria-label="曲线法线角度"
                    onPointerDown={beginEdit}
                    onKeyDown={beginEdit}
                    onChange={(e) => updateCut(active, { ...activeCut, angle: Number(e.target.value) })}
                  />
                </div>
                <div className="control">
                  <div className="control__head">
                    <span className="control__label">距中心</span>
                    <span className="control__value mono">{activeCut.offset.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={-1.6}
                    max={1.6}
                    step={0.01}
                    value={activeCut.offset}
                    aria-label="曲线与纸包中心的距离"
                    onPointerDown={beginEdit}
                    onKeyDown={beginEdit}
                    onChange={(e) => updateCut(active, { ...activeCut, offset: Number(e.target.value) })}
                  />
                </div>
                <div className="control">
                  <div className="control__head">
                    <span className="control__label">弯曲</span>
                    <span className="control__value mono">
                      {activeCut.amplitude >= 0 ? '+' : '−'}
                      {Math.abs(activeCut.amplitude).toFixed(2)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.01}
                    value={activeCut.amplitude}
                    aria-label="弯曲幅度，0 为直线"
                    onPointerDown={beginEdit}
                    onKeyDown={beginEdit}
                    onChange={(e) => updateCut(active, { ...activeCut, amplitude: Number(e.target.value) })}
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
                        className={`segmented__item${activeCut.bends === n ? ' is-active' : ''}`}
                        aria-pressed={activeCut.bends === n}
                        onClick={() => {
                          beginEdit();
                          updateCut(active, { ...activeCut, bends: clampBends(n) });
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="segmented" role="group" aria-label="剪去哪一侧" style={{ marginTop: 4 }}>
                  <button
                    className={`segmented__item${activeCut.removedSide === 'negative' ? ' is-active' : ''}`}
                    onClick={() => {
                      beginEdit();
                      updateCut(active, curveCut(activeCut.angle, activeCut.offset, activeCut.amplitude, activeCut.bends, 'negative'));
                    }}
                  >
                    负侧
                  </button>
                  <button
                    className={`segmented__item${activeCut.removedSide === 'positive' ? ' is-active' : ''}`}
                    onClick={() => {
                      beginEdit();
                      updateCut(active, { ...activeCut, removedSide: 'positive' });
                    }}
                  >
                    正侧
                  </button>
                </div>
              </>
            )}

            {activeCut && activeCut.kind === 'notch' && (
              <>
                <div className="control">
                  <div className="control__head">
                    <span className="control__label">折剪方向</span>
                    <span className="control__value mono">{Math.round(activeCut.angle)}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={angleMax}
                    step={0.5}
                    value={activeCut.angle}
                    aria-label="折剪方向"
                    onPointerDown={beginEdit}
                    onKeyDown={beginEdit}
                    onChange={(e) =>
                      updateCut(active, notchCut(Number(e.target.value), activeCut.distance, activeCut.width))
                    }
                  />
                </div>
                <div className="control">
                  <div className="control__head">
                    <span className="control__label">顶点距中心</span>
                    <span className="control__value mono">{activeCut.distance.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={1.2}
                    step={0.01}
                    value={activeCut.distance}
                    aria-label="折剪顶点距中心"
                    onPointerDown={beginEdit}
                    onKeyDown={beginEdit}
                    onChange={(e) =>
                      updateCut(active, notchCut(activeCut.angle, Number(e.target.value), activeCut.width))
                    }
                  />
                </div>
                <div className="control">
                  <div className="control__head">
                    <span className="control__label">张口宽度</span>
                    <span className="control__value mono">{activeCut.width.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={1.2}
                    step={0.01}
                    value={activeCut.width}
                    aria-label="折剪张口宽度"
                    onPointerDown={beginEdit}
                    onKeyDown={beginEdit}
                    onChange={(e) =>
                      updateCut(active, notchCut(activeCut.angle, activeCut.distance, Number(e.target.value)))
                    }
                  />
                </div>
              </>
            )}

            {activeCut && activeCut.kind === 'hole' && (
              <>
                <div className="segmented" role="group" aria-label="镂空形状" style={{ marginBottom: 8 }}>
                  {([
                    ['diamond', '菱形'],
                    ['circle', '圆形'],
                    ['leaf', '叶形'],
                  ] as [HoleShape, string][]).map(([shape, label]) => (
                    <button
                      key={shape}
                      className={`segmented__item${activeCut.shape === shape ? ' is-active' : ''}`}
                      onClick={() => {
                        beginEdit();
                        updateCut(active, { ...activeCut, shape });
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="control">
                  <div className="control__head">
                    <span className="control__label">孔的方位</span>
                    <span className="control__value mono">{Math.round(activeCut.angle)}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={angleMax}
                    step={0.5}
                    value={activeCut.angle}
                    aria-label="镂空方位"
                    onPointerDown={beginEdit}
                    onKeyDown={beginEdit}
                    onChange={(e) => updateCut(active, { ...activeCut, angle: Number(e.target.value) })}
                  />
                </div>
                <div className="control">
                  <div className="control__head">
                    <span className="control__label">距中心</span>
                    <span className="control__value mono">{activeCut.radius.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1.05}
                    step={0.01}
                    value={activeCut.radius}
                    aria-label="镂空与纸包中心的距离"
                    onPointerDown={beginEdit}
                    onKeyDown={beginEdit}
                    onChange={(e) => updateCut(active, { ...activeCut, radius: Number(e.target.value) })}
                  />
                </div>
                <div className="control">
                  <div className="control__head">
                    <span className="control__label">半宽</span>
                    <span className="control__value mono">{activeCut.size.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.02}
                    max={0.4}
                    step={0.005}
                    value={activeCut.size}
                    aria-label="镂空半宽"
                    onPointerDown={beginEdit}
                    onKeyDown={beginEdit}
                    onChange={(e) => updateCut(active, { ...activeCut, size: Number(e.target.value) })}
                  />
                </div>
                <div className="control">
                  <div className="control__head">
                    <span className="control__label">长宽比</span>
                    <span className="control__value mono">{activeCut.stretch.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.3}
                    max={3}
                    step={0.05}
                    value={activeCut.stretch}
                    aria-label="镂空长宽比"
                    onPointerDown={beginEdit}
                    onKeyDown={beginEdit}
                    onChange={(e) => updateCut(active, { ...activeCut, stretch: Number(e.target.value) })}
                  />
                </div>
                <div className="control">
                  <div className="control__head">
                    <span className="control__label">自身转角</span>
                    <span className="control__value mono">{Math.round(activeCut.rotation)}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={180}
                    step={1}
                    value={activeCut.rotation}
                    aria-label="镂空自身转角"
                    onPointerDown={beginEdit}
                    onKeyDown={beginEdit}
                    onChange={(e) => updateCut(active, { ...activeCut, rotation: Number(e.target.value) })}
                  />
                </div>
              </>
            )}

            {activeCut && (
              <div className="btn-row" style={{ marginTop: 6 }}>
                <button className="btn btn--quiet btn--sm" onClick={() => removeCut(active)}>
                  删除这一刀
                </button>
              </div>
            )}
          </div>

          <div className="card card--pad">
            <div className="panel-title">
              <h3>配色</h3>
              <span>Paper</span>
            </div>
            <div className="swatches">
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  className={`swatch${state.style.paper === p.style.paper ? ' is-active' : ''}`}
                  title={p.label}
                  aria-label={`配色：${p.label}`}
                  onClick={() => {
                    beginEdit();
                    commit({ ...state, style: p.style });
                  }}
                  style={{ background: p.swatch }}
                />
              ))}
              <label className="swatch swatch--custom" title="自定义纸色">
                <input
                  type="color"
                  value={state.style.paper}
                  aria-label="自定义纸色"
                  onChange={(e) => commit({ ...state, style: { ...state.style, paper: e.target.value } })}
                />
              </label>
            </div>
          </div>

          <div className="card card--pad">
            <div className="panel-title">
              <h3>作品</h3>
              <span>{editingId ? '已保存过' : '未保存'}</span>
            </div>
            <input
              className="text-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="给这件作品起个名字"
              aria-label="作品名称"
              maxLength={40}
            />
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn btn--primary btn--sm" onClick={handleSave}>
                保存到我的作品
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => navigate('/gallery')}>
                打开作品集
              </button>
            </div>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  const name = downloadSvg(result.paper, exportStyle);
                  toast(`已导出 ${name}`);
                }}
              >
                导出 SVG
              </button>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  try {
                    const name = downloadPng(result.paper, exportStyle);
                    toast(`已导出 ${name}`);
                  } catch {
                    toast('导出 PNG 失败，请改用 SVG。');
                  }
                }}
              >
                导出 PNG
              </button>
            </div>
            <p className="note" style={{ marginTop: 10 }}>
              {state.cuts.length === 1
                ? '单切口图案在折叠语义上成立，但本版未提供经核验的可打印模板，因此标记为「未核验」。'
                : '多切口属于自由创作，仅作数字图案；不是经核验的实体折剪方案。'}
            </p>
          </div>

          <div className="card card--pad">
            <div className="panel-title">
              <h3>当前图案</h3>
              <span>缩略</span>
            </div>
            <div className="target-frame" style={{ background: state.style.background }}>
              <MiniPattern paper={result.paper} color={state.style.paper} label="当前图案缩略图" />
            </div>
          </div>
        </aside>
      </div>
      {toastNode}
    </>
  );
}
