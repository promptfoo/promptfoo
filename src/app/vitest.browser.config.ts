/// <reference types="@vitest/browser/providers/playwright" />

import { playwright } from '@vitest/browser-playwright';
import appConfig from './vite.config';

export default {
  ...appConfig,
  test: {
    globals: false,
    css: true,
    include: ['src/**/*.browser.{ts,tsx}'],
    testTimeout: process.env.CI ? 20_000 : 30_000,
    hookTimeout: process.env.CI ? 20_000 : 30_000,
    teardownTimeout: 10_000,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      viewport: {
        width: 1280,
        height: 720,
      },
    },
  },
};
