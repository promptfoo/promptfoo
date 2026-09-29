import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Home from './index';

/**
 * The walkthrough tab is deep-linkable via the URL hash. Two defects are covered here:
 *
 *  1. The selected step used to be seeded from `window.location.hash` in a lazy
 *     `useState` initializer. The server cannot see a hash, so anyone opening `/#evals`
 *     hydrated different markup than was sent. The hash must be applied in an effect.
 *  2. The `hashchange` handler used to return early on an unmapped hash, so navigating
 *     back from `/#evals` to `/` left the previous tab selected and the UI stopped
 *     reflecting the URL.
 *
 * Assertions read the *active* tab rather than searching page text: every tab label is
 * always present in the DOM, so a textContent match would pass no matter which is
 * selected.
 */

const DEFAULT_TAB = 'Red Teaming';

function setHash(hash: string) {
  window.history.replaceState(null, '', hash || '/');
}

function activeTab(container: HTMLElement): string {
  const active = container.querySelector('[class*="walkthroughTabActive"]');
  return active?.textContent?.trim() ?? '';
}

/** Same reading, but over a raw HTML string (server output has no live DOM). */
function activeTabInHtml(html: string): string {
  const scratch = document.createElement('div');
  scratch.innerHTML = html;
  return activeTab(scratch);
}

const mounted: HTMLElement[] = [];

function mountServerMarkup(html: string): HTMLElement {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);
  mounted.push(container);
  return container;
}

afterEach(() => {
  while (mounted.length > 0) {
    mounted.pop()?.remove();
  }
  setHash('');
});

describe('homepage walkthrough deep links', () => {
  /**
   * Server render must be hash-independent. A lazy initializer that peeks at
   * `window.location.hash` produces the deep-linked tab here instead of the default.
   */
  it('server-renders the default tab even when a hash is set', () => {
    setHash('#evals');
    const html = renderToString(<Home />);

    expect(activeTabInHtml(html)).toBe(DEFAULT_TAB);
  });

  /**
   * The real regression: markup produced without a hash (what every server sends) is
   * hydrated by a client that *does* see `/#evals`. If the hash is read during render,
   * React reports a hydration mismatch and discards the server tree.
   */
  it('hydrates hash-free server markup without a mismatch, then applies the deep link', async () => {
    setHash('');
    const container = mountServerMarkup(renderToString(<Home />));
    expect(activeTab(container)).toBe(DEFAULT_TAB);

    // The browser navigated to /#evals; hydration starts with the hash already present.
    setHash('#evals');

    const errors: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => errors.push(args.join(' '));

    try {
      await act(async () => {
        // React reports a hydration mismatch as a *recoverable* error, which vitest can
        // surface as a file-level unhandled error rather than through console.error.
        // Capturing it here is what makes this assertion actually fail on a regression.
        hydrateRoot(container, <Home />, {
          onRecoverableError: (error) => errors.push(error),
        });
      });
    } finally {
      console.error = originalError;
    }

    const hydrationErrors = errors
      .map((e) => (e instanceof Error ? e.message : String(e)))
      .filter((message) => /hydrat|did not match|server/i.test(message));
    expect(hydrationErrors).toHaveLength(0);
    // The effect runs after hydration, so the deep-linked tab wins in the end.
    expect(activeTab(container)).toBe('Evaluations');
  });

  it('selects the default tab when there is no hash', () => {
    setHash('');
    const { container } = render(<Home />);
    expect(activeTab(container)).toBe(DEFAULT_TAB);
  });

  it.each([
    ['#evals', 'Evaluations'],
    ['#guardrails', 'Guardrails'],
    ['#mcp', 'MCP'],
    ['#codescanning', 'Code Scanning'],
    ['#modelsecurity', 'Model Security'],
  ])('deep-links %s to the %s tab', (hash, expected) => {
    setHash(hash);
    const { container } = render(<Home />);
    expect(activeTab(container)).toBe(expected);
  });

  // The regression codex reported: clearing or mistyping the hash must return to the
  // default tab rather than stranding the previous selection.
  it.each([
    ['an empty hash', ''],
    ['an unrecognized hash', '#not-a-real-section'],
  ])('resets to the default tab on %s', (_label, hash) => {
    setHash('#evals');
    const { container } = render(<Home />);
    expect(activeTab(container)).toBe('Evaluations');

    act(() => {
      setHash(hash);
      fireEvent(window, new HashChangeEvent('hashchange'));
    });

    expect(activeTab(container)).toBe(DEFAULT_TAB);
  });

  it('follows a hashchange between two mapped sections', () => {
    setHash('#evals');
    const { container } = render(<Home />);

    act(() => {
      setHash('#guardrails');
      fireEvent(window, new HashChangeEvent('hashchange'));
    });

    expect(activeTab(container)).toBe('Guardrails');
  });

  it('detaches the hashchange listener on unmount', () => {
    setHash('#evals');
    const { unmount } = render(<Home />);
    unmount();

    // A leaked listener would call setState on an unmounted tree.
    expect(() => {
      setHash('#guardrails');
      fireEvent(window, new HashChangeEvent('hashchange'));
    }).not.toThrow();
  });
});
