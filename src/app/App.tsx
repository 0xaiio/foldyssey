import { Suspense, lazy, useEffect } from 'react';

import { AboutPage } from '../pages/AboutPage';
import { ExplorePage } from '../pages/ExplorePage';
import { GalleryPage } from '../pages/GalleryPage';
import { HomePage } from '../pages/HomePage';
import { PuzzlePage } from '../pages/PuzzlePage';
import { StudioPage } from '../pages/StudioPage';
import { Boundary } from '../components/Boundary';
import { navigate, routeKey, useRoute } from './router';

// The AI page carries the cloud SDK; keep it out of the first paint and out of
// the critical path. If it fails to load, the rest of the app is unaffected.
const AiPage = lazy(() => import('../pages/AiPage').then((m) => ({ default: m.AiPage })));

const NAV = [
  { key: 'home', label: '首页', path: '/' },
  { key: 'puzzle', label: '一刀挑战', path: '/puzzle' },
  { key: 'studio', label: '剪纸工坊', path: '/studio' },
  { key: 'ai', label: 'AI 灵感', path: '/ai' },
  { key: 'gallery', label: '我的作品', path: '/gallery' },
  { key: 'explore', label: '纸艺中的数学', path: '/explore', secondary: true },
  { key: 'about', label: '关于', path: '/about', secondary: true },
];

export function App() {
  const route = useRoute();
  const key = routeKey(route);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [key]);

  const page = (() => {
    switch (route.name) {
      case 'puzzle':
        return <PuzzlePage levelId={route.levelId} />;
      case 'studio':
        return <StudioPage artworkId={route.id} />;
      case 'gallery':
        return <GalleryPage />;
      case 'explore':
        return <ExplorePage />;
      case 'ai':
        return (
          <Boundary
            fallback={
              <div className="empty" style={{ marginTop: 24 }}>
                AI 模块加载失败（可能是网络问题）。一刀挑战、剪纸工坊与作品集不受影响。
              </div>
            }
          >
            <Suspense fallback={<div className="empty" style={{ marginTop: 24 }}>正在加载 AI 模块…</div>}>
              <AiPage />
            </Suspense>
          </Boundary>
        );
      case 'about':
        return <AboutPage />;
      default:
        return <HomePage />;
    }
  })();

  return (
    <>
      <header className="topbar">
        <div className="topbar__inner">
          <button className="brand" onClick={() => navigate('/')} aria-label="回到首页">
            <span className="brand__dot" aria-hidden="true" />
            <span className="brand__mark">Foldyssey</span>
            <span className="brand__cn">一刀万象</span>
          </button>
          <nav className="nav" aria-label="主导航">
            {NAV.map((item) => (
              <button
                key={item.key}
                className={`nav__link${route.name === item.key ? ' is-active' : ''}`}
                data-secondary={item.secondary ? 'true' : undefined}
                onClick={() => navigate(item.path)}
                aria-current={route.name === item.key ? 'page' : undefined}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="shell">{page}</main>

      <footer className="shell" style={{ paddingBottom: 40 }}>
        <div className="footer">
          <div>
            <strong>Foldyssey · 一刀万象</strong>
            <div>Fold. Snip. Unfold. Wow! — 图案全部由本机几何引擎实时计算。</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div>受计算折纸研究启发 · 非 MIT 官方产品</div>
            <div>无账号 · 无后端 · 无需登录</div>
          </div>
        </div>
      </footer>
    </>
  );
}
