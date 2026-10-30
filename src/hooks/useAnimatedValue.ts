import { useCallback, useEffect, useRef, useState } from 'react';

const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type Tween = {
  value: number;
  set: (v: number) => void;
  animateTo: (target: number, duration: number, onDone?: () => void) => void;
  cancel: () => void;
};

/**
 * Minimal rAF tween for the paper animation.
 * Kept dependency-free so the geometry and the animation timing stay separate.
 */
export function useAnimatedValue(initial = 0): Tween {
  const [value, setValue] = useState(initial);
  const valueRef = useRef(initial);
  const rafRef = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const set = useCallback((v: number) => {
    valueRef.current = v;
    setValue(v);
  }, []);

  const animateTo = useCallback(
    (target: number, duration: number, onDone?: () => void) => {
      cancel();
      const from = valueRef.current;
      if (Math.abs(target - from) < 1e-6 || duration <= 0 || prefersReducedMotion()) {
        set(target);
        onDone?.();
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const v = from + (target - from) * easeInOutCubic(t);
        valueRef.current = v;
        setValue(v);
        if (t < 1) {
          rafRef.current = requestAnimationFrame(step);
        } else {
          rafRef.current = null;
          onDone?.();
        }
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [cancel, set],
  );

  useEffect(() => cancel, [cancel]);

  return { value, set, animateTo, cancel };
}

/** Respect the OS "reduce motion" setting for auto-playing loops. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
