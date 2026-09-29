import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

import { TooltipProvider } from '@app/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import Navigation from './Navigation';

import '../index.css';

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({ recordEvent: vi.fn() }),
}));
vi.mock('./InfoModal', () => ({ default: () => null }));
vi.mock('./ApiSettingsModal', () => ({ default: () => null }));

let root: Root;
let container: HTMLDivElement;
let client: QueryClient;

beforeEach(() => {
  client = new QueryClient();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ appUrl: 'https://www.promptfoo.app', isEnabled: false })),
  );
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  flushSync(() => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TooltipProvider>
            <Navigation />
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
});

afterEach(() => {
  flushSync(() => root.unmount());
  container.remove();
  client.clear();
  vi.restoreAllMocks();
});

describe('cloud status navigation', () => {
  it.each([320, 390, 768, 1280])('keeps controls reachable at %ipx', async (width) => {
    await page.viewport(width, 720);
    const status = page.getByRole('button', { name: /promptfoo cloud is not configured/i });
    await expect.element(status).toBeVisible();
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(width);

    const controls = container.querySelectorAll('header button, header a');
    for (const control of controls) {
      const rect = control.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        continue;
      }
      const topmost = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      expect(control.contains(topmost)).toBe(true);
    }

    await status.click();
    await expect.element(page.getByRole('dialog')).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect.element(status).toHaveFocus();
  });
});
