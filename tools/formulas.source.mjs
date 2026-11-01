/**
 * LaTeX source of every formula shown on the site.
 *
 * This file is the single source of truth: edit the TeX here, then run
 *
 *     npm run build:formulas
 *
 * which compiles each entry with MathJax (TeX -> self-contained SVG) and writes
 * `src/content/formulas.generated.ts`. `src/tests/formulas.test.ts` fails if the
 * generated file is stale, so the two cannot drift apart.
 *
 * Why SVG and not an image: see `docs/MATH_RENDERING.md`.
 */

export const FORMULAS = {
  /** The one-line statement of the whole engine (display formula). */
  unfold: {
    tex: String.raw`S = \bigcup_i \left( P_i \setminus f_i^{-1}\!\left( D \cap f_i(P_i) \right) \right)`,
    label:
      'S 等于对所有片区 i 取并集：每个片区 P_i 去掉它的保距映射 f_i 的逆像所剪掉的区域，' +
      '也就是 D 与 f_i(P_i) 的交集。',
    display: true,
  },

  /* ---- inline symbols used in the prose around it ---- */
  paper: {
    tex: String.raw`P = [-1,1]^2`,
    label: '纸张 P 是负一到一闭区间的平方',
    display: false,
  },
  patch: {
    tex: String.raw`P_i`,
    label: '片区 P 下标 i',
    display: false,
  },
  map: {
    tex: String.raw`f_i`,
    label: '保距映射 f 下标 i',
    display: false,
  },
  region: {
    tex: String.raw`D`,
    label: '纸包里被剪掉的区域 D',
    display: false,
  },
  preimage: {
    tex: String.raw`f_i^{-1}(D)`,
    label: 'f 下标 i 的逆映射作用于 D',
    display: false,
  },
  result: {
    tex: String.raw`S`,
    label: '展开后剩下的纸 S',
    display: false,
  },
  clipped: {
    tex: String.raw`D \cap f_i(P_i)`,
    label: 'D 与 f 下标 i 作用于 P 下标 i 的交集',
    display: false,
  },
};
