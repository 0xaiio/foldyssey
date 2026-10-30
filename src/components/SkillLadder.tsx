/**
 * 「剪刀能力」 ladder — the four rungs a player climbs, shown as one strip.
 *
 * The rung of the current level is computed from its canonical cuts
 * (`puzzle/skill.ts`), so this component never asserts anything the geometry
 * does not already prove. Each rung carries a tiny glyph of the blade path:
 * a stroke, two strokes, a stroke that turns, a stroke that bends.
 */

import { Fragment } from 'react';

import {
  SKILL_META,
  SKILL_ORDER,
  type ScissorSkill,
  skillRank,
} from '../puzzle/skill';

const GLYPH: Record<ScissorSkill, JSX.Element> = {
  one: (
    <svg viewBox="0 0 26 18" aria-hidden="true">
      <path d="M3 15L23 3" />
    </svg>
  ),
  two: (
    <svg viewBox="0 0 26 18" aria-hidden="true">
      <path d="M3 15L13 3" />
      <path d="M13 3L23 15" />
    </svg>
  ),
  turn: (
    <svg viewBox="0 0 26 18" aria-hidden="true">
      <path d="M3 15L11 5L14 12" />
      <circle cx="11" cy="5" r="1.6" />
    </svg>
  ),
  curve: (
    <svg viewBox="0 0 26 18" aria-hidden="true">
      <path d="M3 15C8 15 8 4 13 4C18 4 18 14 23 14" />
    </svg>
  ),
};

export function SkillLadder({
  current,
  counts,
}: {
  current: ScissorSkill;
  /** How many shipped levels sit on each rung. */
  counts: Record<ScissorSkill, number>;
}) {
  const rank = skillRank(current);
  return (
    <section className="ladder" aria-label="剪刀能力分级">
      <div className="ladder__row">
        <span className="kicker">剪刀能力</span>
        <ol className="ladder__rungs">
          {SKILL_ORDER.map((s) => {
            const state = skillRank(s) < rank ? 'is-done' : s === current ? 'is-current' : 'is-ahead';
            return (
              <li key={s} className={`ladder__rung ${state}`}>
                <span className="ladder__glyph">{GLYPH[s]}</span>
                <span className="ladder__label">{SKILL_META[s].label}</span>
                <span className="ladder__count">{counts[s]} 关</span>
                {s === current && <span className="ladder__now">本关</span>}
              </li>
            );
          })}
        </ol>
      </div>
      <p className="ladder__criterion">
        <b>本关考什么：</b>
        {SKILL_META[current].criterion}
      </p>
      <details className="ladder__more">
        <summary>四级判定与边界情况</summary>
        <dl className="doc">
          {SKILL_ORDER.map((s) => (
            <Fragment key={s}>
              <dt>{SKILL_META[s].label}</dt>
              <dd>
                {SKILL_META[s].criterion}
                <span className="ladder__boundary">边界：{SKILL_META[s].boundary}</span>
              </dd>
            </Fragment>
          ))}
        </dl>
      </details>
    </section>
  );
}
