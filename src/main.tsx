import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Self-hosted rather than a font CDN: the PWA has to render identically
// offline, and a third-party font request would leak every app open.
import '@fontsource-variable/inter';

import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
