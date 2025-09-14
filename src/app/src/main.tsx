import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import './index.css';
import { initializeScrollTimelinePolyfill } from '@app/utils/scrollTimelinePolyfill';

// Initialize the scroll-timeline polyfill if needed
initializeScrollTimelinePolyfill();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
