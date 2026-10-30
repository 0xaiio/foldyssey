import { useMemo, useRef, useState } from 'react';

import { navigate } from '../app/router';
import { MiniPattern } from '../components/MiniPattern';
import {
  LEVELS,
  STAGE_HINT,
  STAGE_LABEL,
  type PuzzleLevel,
  type Stage,
} from '../puzzle/levels';
import { loadProgress } from '../services/storage';

const STAGES: Stage[] = [1, 2, 3, 4];

const FOLD_SHORT: Record<string, string> = {
  none: '不折',
  vertical: '竖折',
  horizontal: '横折',
  orthogonal2: '四折',
  radial8: '八折',
};

type Filter = 'all' | Stage;

/**
 * The pattern library: browse → select → preview → play.
 *
 * Layout contract
 * - Desktop: cards on the left, a sticky detail panel on the right. Selecting a
 *   card never navigates, so the pattern can be read before committing.
 * - Mobile: the detail panel moves below the grid; selecting a card scrolls it
 *   into view so the tap has a visible consequence.
 */
export function PatternLibrary() {
  const progress = useMemo(() => loadProgress(), []);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedId, setSelectedId] = useState(LEVELS[0].id);
  const detailRef = useRef<HTMLDivElement | null>(null);

  const selected = LEVELS.find((l) => l.id === selectedId) ?? LEVELS[0];

  const pick = (level: PuzzleLevel) => {
    setSelectedId(level.id);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 900px)').matches) {
      window.requestAnimationFrame(() => {
        detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    }
  };

  const done = LEVELS.filter((l) => progress[l.id]?.cleared).length;

  return (
    <section className="section">
      <div className="section__head">
        <div>
          <div className="kicker">Pattern Library</div>
          <h2 className="h2">十一个图案，四段递进</h2>
        </div>
        <p className="muted">
          已通关 {done} / {LEVELS.length} · 点卡片先看档案，再决定动手
        </p>
      </div>

      <div className="library__filters" role="group" aria-label="按阶段筛选">
        <button
          className={`filter-chip${filter === 'all' ? ' is-active' : ''}`}
          onClick={() => setFilter('all')}
          aria-pressed={filter === 'all'}
        >
          全部 <span>{LEVELS.length}</span>
        </button>
        {STAGES.map((stage) => {
          const count = LEVELS.filter((l) => l.stage === stage).length;
          return (
            <button
              key={stage}
              className={`filter-chip${filter === stage ? ' is-active' : ''}`}
              onClick={() => setFilter(stage)}
              aria-pressed={filter === stage}
            >
              阶段 {stage} <span>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="library">
        <div className="library__grid">
          <div className="pattern-grid">
            {LEVELS.filter((l) => filter === 'all' || l.stage === filter).map((level) => {
              const isCleared = Boolean(progress[level.id]?.cleared);
              return (
                <button
                  key={level.id}
                  className={`pattern-card${level.id === selected.id ? ' is-selected' : ''}`}
                  onClick={() => pick(level)}
                  aria-pressed={level.id === selected.id}
                  aria-label={`${level.title}：${level.subtitle}`}
                >
                  <span className="pattern-card__art">
                    <MiniPattern
                      paper={level.target}
                      color="#B93645"
                      label={`${level.title}的目标图案`}
                    />
                  </span>
                  <span className="pattern-card__body">
                    <span className="pattern-card__title">
                      {String(level.index).padStart(2, '0')} · {level.title}
                    </span>
                    <span className="pattern-card__meta">
                      {FOLD_SHORT[level.foldPreset] ?? level.foldPreset} · {level.cutSummary}
                    </span>
                  </span>
                  <span className="pattern-card__stage">阶段 {level.stage}</span>
                  {isCleared && <em className="pattern-card__stamp">已通关</em>}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="library__detail" ref={detailRef} aria-live="polite">
          <div className="detail-card">
            <div className="detail-card__kicker">
              {STAGE_LABEL[selected.stage]} · {selected.subtitle}
            </div>
            <h3 className="detail-card__title">{selected.title}</h3>

            <div className="detail-card__art">
              <MiniPattern
                paper={selected.target}
                color="#B93645"
                label={`${selected.title}的展开图案`}
              />
            </div>

            <p className="detail-card__stage">{STAGE_HINT[selected.stage]}</p>

            <div className="detail-card__chips">
              <span className="chip">{FOLD_SHORT[selected.foldPreset]}</span>
              <span className="chip chip--red">{selected.cutSummary}</span>
              <span className="chip chip--gold">难度 {'★'.repeat(selected.difficulty)}</span>
            </div>

            <p className="detail-card__brief">{selected.brief}</p>

            <dl className="doc">
              <dt>折叠结构</dt>
              <dd>{selected.patternDoc?.fold ?? selected.symmetryNote}</dd>
              <dt>切割逻辑</dt>
              <dd>
                {selected.patternDoc ? (
                  <ol className="doc__cuts">
                    {selected.patternDoc.cuts.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ol>
                ) : (
                  <span>{selected.hints.operate}</span>
                )}
              </dd>
              <dt>展开效果</dt>
              <dd>{selected.patternDoc?.unfold ?? selected.knowledge}</dd>
              {selected.patternDoc?.source && (
                <>
                  <dt>研究灵感</dt>
                  <dd className="doc__source">{selected.patternDoc.source}</dd>
                </>
              )}
            </dl>

            <div className="btn-row" style={{ marginTop: 14 }}>
              <button
                className="btn btn--primary"
                onClick={() => navigate(`/puzzle/${selected.id}`)}
              >
                开始挑战
              </button>
              <button className="btn btn--quiet btn--sm" onClick={() => navigate('/studio')}>
                去工坊自己剪
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
