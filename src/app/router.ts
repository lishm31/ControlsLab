/** Hash router: works on GitHub Pages under any repo path with no server rewrites. */
import { useSyncExternalStore } from 'react';

export type Route = { name: 'home' } | { name: 'module'; id: string } | { name: 'notfound'; path: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, '') || '/';
  if (path === '/' || path === '') return { name: 'home' };
  const m = path.match(/^\/m\/([a-z0-9-]+)\/?$/);
  if (m) return { name: 'module', id: m[1] };
  return { name: 'notfound', path };
}

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseHash(hash);
}

export const href = {
  home: '#/',
  module: (id: string) => `#/m/${id}`,
};
