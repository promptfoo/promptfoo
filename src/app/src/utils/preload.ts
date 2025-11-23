// Preload utilities for better performance

// Dynamic imports for eval pages (triggers chunk loading)
const preloadEvalPage = async () => {
  // Import the pages to trigger chunk loading
  await import('../pages/eval/page');
  await import('../pages/evals/page');
  await import('../pages/eval-creator/page');
};

// Preload critical pages immediately (eval ecosystem - most commonly accessed)
export const preloadCriticalPages = async () => {
  try {
    // Preload all eval-related pages since users start here
    await preloadEvalPage();
  } catch (error) {
    console.warn('Failed to preload critical pages:', error);
  }
};
