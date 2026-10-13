import { useEffect } from 'react';
import { MODULES } from '../modules/manifest';
import { Home } from './Home';
import { ModulePage } from './ModulePage';
import { href, useRoute } from './router';
import { useTheme } from './theme';

function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="0.5" y="0.5" width="17" height="17" fill="none" stroke="var(--rule-strong)" />
      <path d="M2 13 L6 5 L10 10.5 L16 7" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
    </svg>
  );
}

export function App() {
  const route = useRoute();
  const [theme, toggleTheme] = useTheme();
  const mod = route.name === 'module' ? MODULES.find((m) => m.id === route.id) : undefined;

  useEffect(() => {
    document.title = mod ? `${mod.code} ${mod.title} / Controls Lab` : 'Controls Lab';
  }, [mod]);

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <a className="topbar__brand" href={href.home}>
          <BrandMark />
          <span className="brand-name">Controls Lab</span>
          <span className="brand-sub">Dynamics &amp; Control</span>
        </a>
        <nav className="topbar__crumbs" aria-label="Breadcrumb">
          {mod ? (
            <>
              <a href={href.home}>Modules</a>
              <span aria-hidden="true">/</span>
              <b>
                {mod.code} {mod.title}
              </b>
            </>
          ) : (
            <b>Modules</b>
          )}
        </nav>
        <span className="topbar__spacer" />
        <div className="topbar__right">
          <button type="button" className="btn btn--bar" onClick={toggleTheme} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}>
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {route.name === 'home' && <Home />}
        {route.name === 'module' && <ModulePage id={route.id} />}
        {route.name === 'notfound' && (
          <div className="page">
            <p>
              Nothing at <span className="mono">{route.path}</span>. <a href={href.home}>Back to modules</a>.
            </p>
          </div>
        )}
      </main>
    </>
  );
}
