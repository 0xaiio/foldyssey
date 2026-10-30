import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'puzzle'; levelId?: string }
  | { name: 'studio'; id?: string }
  | { name: 'gallery' }
  | { name: 'explore' }
  | { name: 'about' };

export function parseRoute(hash: string): Route {
  const raw = (hash || '').replace(/^#\/?/, '');
  const [head, tail] = raw.split('/');
  switch (head) {
    case 'puzzle':
      return { name: 'puzzle', levelId: tail || undefined };
    case 'studio':
      return { name: 'studio', id: tail || undefined };
    case 'gallery':
      return { name: 'gallery' };
    case 'explore':
      return { name: 'explore' };
    case 'about':
      return { name: 'about' };
    default:
      return { name: 'home' };
  }
}

export function routeKey(route: Route): string {
  if (route.name === 'puzzle') return `puzzle:${route.levelId ?? ''}`;
  if (route.name === 'studio') return `studio:${route.id ?? ''}`;
  return route.name;
}

export function navigate(path: string): void {
  if (typeof window === 'undefined') return;
  const next = path.startsWith('#') ? path : `#${path.startsWith('/') ? '' : '/'}${path}`;
  if (window.location.hash === next) return;
  window.location.hash = next;
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(typeof window === 'undefined' ? '' : window.location.hash),
  );

  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
