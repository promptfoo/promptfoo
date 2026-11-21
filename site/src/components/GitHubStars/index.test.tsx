import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE_CONSTANTS } from '../../constants';
import GitHubStars from './index';

const CACHE_KEY = 'github_stars_cache_promptfoo';
const BUILD_TIME_COUNT = SITE_CONSTANTS.GITHUB_STARS_DISPLAY;

function seedCache(stars: string, ageMs = 0) {
  localStorage.setItem(CACHE_KEY, JSON.stringify({ stars, timestamp: Date.now() - ageMs }));
}

describe('GitHubStars', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})), // never settles: isolates the cache path
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('server-renders the build-time count', () => {
    seedCache('99.9k');
    const html = renderToString(<GitHubStars />);

    // SSR has no localStorage; the markup must be the build-time constant regardless.
    expect(html).toContain(BUILD_TIME_COUNT);
    expect(html).not.toContain('99.9k');
  });

  /**
   * Regression for a real hydration mismatch: the count used to be seeded from a lazy
   * `useState(() => getCachedStars() || …)`, which the server cannot evaluate. A returning
   * visitor therefore hydrated different markup than the server sent, on every page. The
   * cached value must land in an effect, i.e. strictly after hydration.
   */
  it('hydrates with the server markup, then applies the cached count', async () => {
    seedCache('42.3k');

    const container = document.createElement('div');
    container.innerHTML = renderToString(<GitHubStars />);
    document.body.appendChild(container);

    const serverMarkup = container.innerHTML;
    expect(serverMarkup).toContain(BUILD_TIME_COUNT);

    // React 19 routes hydration mismatches through onRecoverableError, NOT console.error —
    // vitest intercepts them before a console spy can see them, which makes a spy-based
    // assertion here unfalsifiable. Capture them at the source instead.
    const recoverable: unknown[] = [];

    await act(async () => {
      hydrateRoot(container, <GitHubStars />, {
        onRecoverableError: (error) => recoverable.push(error),
      });
    });

    expect(recoverable).toHaveLength(0);
    expect(container.textContent).toContain('42.3k');

    container.remove();
  });

  it('ignores a stale cache entry and keeps the build-time count', async () => {
    seedCache('1.1k', 1000 * 60 * 60 * 48); // older than the 24h cache window

    const container = document.createElement('div');
    container.innerHTML = renderToString(<GitHubStars />);
    document.body.appendChild(container);

    await act(async () => {
      hydrateRoot(container, <GitHubStars />);
    });

    expect(container.textContent).toContain(BUILD_TIME_COUNT);
    expect(container.textContent).not.toContain('1.1k');
    container.remove();
  });

  it('skips the network call when the cache is fresh', async () => {
    seedCache('42.3k');

    const container = document.createElement('div');
    container.innerHTML = renderToString(<GitHubStars />);
    document.body.appendChild(container);

    await act(async () => {
      hydrateRoot(container, <GitHubStars />);
    });

    expect(fetch).not.toHaveBeenCalled();
    container.remove();
  });

  it('labels the link with the count for assistive tech', () => {
    const html = renderToString(<GitHubStars />);
    expect(html).toContain(`${BUILD_TIME_COUNT} stars on GitHub`);
  });
});
