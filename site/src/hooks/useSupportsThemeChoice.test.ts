import { useLocation } from '@docusaurus/router';
import { renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useSupportsThemeChoice } from './useSupportsThemeChoice';

vi.mock('@docusaurus/router', () => ({ useLocation: vi.fn() }));
afterEach(() => vi.resetAllMocks());

it.each([
  ['/docs', true],
  ['/docs/', true],
  ['/docs/configuration', true],
  ['/docs-other', false],
  ['/events', false],
  ['/events/', false],
  ['/events/blackhat-2026', true],
  ['/events/blackhat-2026/recap', true],
  ['/store', true],
  ['/store/', true],
  ['/store/other', false],
  ['/blog/ai-security', false],
  ['/', false],
] as const)('allows theme choice on %s: %s', (pathname, expected) => {
  vi.mocked(useLocation).mockReturnValue({ pathname } as ReturnType<typeof useLocation>);
  expect(renderHook(useSupportsThemeChoice).result.current).toBe(expected);
});
