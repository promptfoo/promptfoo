import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';
import { routerPath } from './src/test/storeRouter';

declare module 'vitest/browser' {
  interface BrowserCommands {
    tap(selector: string): Promise<void>;
  }
}

export default defineConfig({
  // Load the hooks and their provider from the same router without bundling the Node test helper.
  resolve: {
    alias: { '@docusaurus/router': routerPath, '@site/src/test/storeRouter': routerPath },
  },
  test: {
    include: ['src/**/*.browser.tsx'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({ contextOptions: { hasTouch: true } }),
      instances: [{ browser: 'chromium' }],
      commands: {
        tap: ({ iframe }, selector: string) => iframe.locator(selector).tap(),
      },
    },
  },
});
