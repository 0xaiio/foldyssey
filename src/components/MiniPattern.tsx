import { useMemo } from 'react';

import { type MultiPolygon, exportPath } from '../geometry/polygon';

export type MiniPatternProps = {
  paper: MultiPolygon;
  color?: string;
  size?: number;
  padding?: number;
  className?: string;
  label?: string;
};

/** Small normalised rendering of a computed region, used for thumbnails. */
export function MiniPattern({
  paper,
  color = '#B93645',
  size = 100,
  padding = 5,
  className,
  label,
}: MiniPatternProps) {
  const d = useMemo(() => exportPath(paper, size, padding), [paper, size, padding]);
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={label ?? '图案缩略图'}
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      {d ? <path d={d} fill={color} fillRule="evenodd" /> : null}
    </svg>
  );
}
