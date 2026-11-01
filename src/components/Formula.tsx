/**
 * A formula rendered from LaTeX at build time.
 *
 * `FORMULAS[name].svg` is a self-contained MathJax SVG: every glyph is a path,
 * so there is no font to load and no runtime engine to ship. It inherits
 * `currentColor`, scales with the surrounding text (MathJax sizes it in `ex`),
 * and prints as vector.
 *
 * Accessibility: the wrapper carries `role="math"` and a full Chinese reading;
 * the drawing itself is `aria-hidden`, so a screen reader reads the sentence
 * once instead of spelling out path data.
 *
 * The SVG string is generated from `tools/formulas.source.mjs` at build time —
 * it contains no user input, which is why `dangerouslySetInnerHTML` is safe
 * here. Do not feed it anything from the network or localStorage.
 */

import { FORMULAS, type FormulaName } from '../content/formulas.generated';

export function Formula({ name, className }: { name: FormulaName; className?: string }) {
  const formula = FORMULAS[name];
  return (
    <span
      className={`mathformula${formula.display ? ' mathformula--display' : ''}${className ? ` ${className}` : ''}`}
      role="math"
      aria-label={formula.label}
    >
      <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: formula.svg }} />
    </span>
  );
}
