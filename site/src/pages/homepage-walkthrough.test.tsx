import { act } from 'react';

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

afterEach(() => {
  setHash('');
});

describe('homepage walkthrough deep links', () => {
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
