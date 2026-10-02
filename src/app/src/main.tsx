import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import './index.css';

import { loadRuntimeConfig } from '@app/config/runtime';
import { initializeScrollTimelinePolyfill } from '@app/utils/scrollTimelinePolyfill';

// Initialize the scroll-timeline polyfill if needed
initializeScrollTimelinePolyfill();

async function bootstrap() {
  await loadRuntimeConfig();
  const { default: App } = await import('./App');

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
