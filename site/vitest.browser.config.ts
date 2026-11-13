import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

declare module 'vitest/browser' {
  interface BrowserCommands {
    tap(selector: string): Promise<void>;
  }
}

export default defineConfig({
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
