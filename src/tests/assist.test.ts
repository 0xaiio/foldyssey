import { describe, expect, it } from 'vitest';

import { applyCuts } from '../geometry/cut';
import { isCleared, scorePaper } from '../geometry/score';
import { LEVELS } from '../puzzle/levels';
import { FIELD_LABEL, applyNudge, applyStep, diagnose } from '../puzzle/assist';

function iouOf(level: (typeof LEVELS)[number], cuts: Parameters<typeof applyCuts>[1]): number {
  return scorePaper(applyCuts(level.foldPreset, cuts).paper, level.target, level.thresholds).iou;
}

describe('assist: tell the player which slider to move', () => {
  it('finds a move that improves a wrong guess', () => {
    for (const level of LEVELS) {
      const d = diagnose(level.initialGuess, level.foldPreset, level.target, level.thresholds);
      expect(d.nudge, level.id).not.toBeNull();
      if (!d.nudge) continue;
      expect(d.nudge.gain, level.id).toBeGreaterThan(0);
      expect(d.projectedIou, level.id).toBeGreaterThan(iouOf(level, level.initialGuess));
    }
  });

  it('applying the recommended move really raises the IoU', () => {
    for (const level of LEVELS) {
      const d = diagnose(level.initialGuess, level.foldPreset, level.target, level.thresholds);
      if (!d.nudge) continue;
      const before = iouOf(level, level.initialGuess);
      const after = iouOf(level, applyNudge(level.initialGuess, d.nudge));
      expect(after, level.id).toBeGreaterThan(before);
    }
  });

  it('names the slider in words a player can find on screen', () => {
    const level = LEVELS.find((l) => l.id === 'octagram')!;
    const d = diagnose(level.initialGuess, level.foldPreset, level.target, level.thresholds);
    expect(d.detail).toContain('第 1 刀');
    expect(Object.values(FIELD_LABEL).some((label) => d.detail.includes(label))).toBe(true);
    expect(d.headline.length).toBeGreaterThan(4);
  });

  it('repeated nudges converge to a passing design within the budget', () => {
    // Worst case: the player never switches tabs, so every diagnosis is asked
    // with focus = 0. Six nudges (the stage-1/2 budget) must still be enough.
    for (const level of LEVELS) {
      let cuts = level.initialGuess;
      for (let i = 0; i < 6; i++) {
        const d = diagnose(cuts, level.foldPreset, level.target, level.thresholds, 0);
        if (!d.nudge) break;
        cuts = applyNudge(cuts, d.nudge);
      }
      const s = scorePaper(applyCuts(level.foldPreset, cuts).paper, level.target, level.thresholds);
      expect(isCleared(s.verdict), `${level.id} after 6 nudges -> ${(s.iou * 100).toFixed(1)}%`).toBe(true);
    }
  });

  it('step helpers never leave the legal range', () => {
    const level = LEVELS.find((l) => l.id === 'octagram')!;
    const cut = level.canonicalCuts[0];
    let c = cut;
    for (let i = 0; i < 200; i++) {
      const next = applyStep(c, 'distance', -1, 1);
      if (!next) break;
      c = next;
    }
    if (c.kind === 'notch') expect(c.distance).toBeGreaterThanOrEqual(0.1);
  });
});
