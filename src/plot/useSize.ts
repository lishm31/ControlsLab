import { useLayoutEffect, useRef, useState } from 'react';

/** Track an element's content width with ResizeObserver. */
export function useWidth<T extends HTMLElement>(initial = 480): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || initial);
    const ro = new ResizeObserver((entries) => {
      const cw = Math.floor(entries[0].contentRect.width);
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [initial]);
  return [ref, w];
}
