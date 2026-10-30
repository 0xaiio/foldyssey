import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root container #root is missing.');
}

// Milestone 0 placeholder. The geometry engine, puzzle data and the full UI
// land in the following commits; this keeps the scaffold buildable on its own.
createRoot(container).render(
  <StrictMode>
    <main style={{ fontFamily: 'Georgia, serif', padding: 56, color: '#242725' }}>
      <h1 style={{ margin: 0, fontSize: 40 }}>Foldyssey</h1>
      <p style={{ marginTop: 8, color: '#b93645', letterSpacing: '0.3em' }}>一刀万象</p>
      <p style={{ marginTop: 20, color: '#565b56' }}>
        Scaffold online. Geometry engine and the playable UI follow in the next commits.
      </p>
    </main>
  </StrictMode>,
);
