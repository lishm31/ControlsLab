/** KaTeX typesetting, loaded on first use so pages without math do not pay for it. */
import { Fragment, useEffect, useState } from 'react';

type KatexMod = typeof import('katex');
let katexPromise: Promise<KatexMod> | null = null;
let katexMod: KatexMod | null = null;

function loadKatex(): Promise<KatexMod> {
  if (!katexPromise) {
    katexPromise = Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => {
      katexMod = (m as unknown as { default: KatexMod }).default ?? m;
      return katexMod;
    });
  }
  return katexPromise;
}

export function Tex({ tex, display = false }: { tex: string; display?: boolean }) {
  const [k, setK] = useState<KatexMod | null>(katexMod);
  useEffect(() => {
    if (!k) loadKatex().then(setK);
  }, [k]);
  if (!k) return <span className={display ? 'tex-display mono' : 'tex-inline mono'}>{tex}</span>;
  const html = k.renderToString(tex, { throwOnError: false, displayMode: display, output: 'html' });
  return <span className={display ? 'tex-display' : 'tex-inline'} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Text with $...$ spans typeset inline. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(\$[^$]+\$)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('$') && p.endsWith('$') && p.length > 2 ? <Tex key={i} tex={p.slice(1, -1)} /> : <Fragment key={i}>{p}</Fragment>,
      )}
    </>
  );
}
