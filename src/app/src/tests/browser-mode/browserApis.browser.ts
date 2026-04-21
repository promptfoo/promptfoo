/// <reference types="@vitest/browser/matchers" />

import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';

const initialHref = window.location.href;

function resetBodyFocus() {
  document.body.setAttribute('tabindex', '-1');
  document.body.focus();
  document.body.removeAttribute('tabindex');
}

afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState(null, '', initialHref);
});

describe('browser mode DOM smoke coverage', () => {
  it('uses real history APIs for URL state instead of replacing window.location', () => {
    const originalLocation = window.location;

    window.history.pushState({ source: 'browser-mode' }, '', '/browser-mode?query=real#section');

    expect(window.location).toBe(originalLocation);
    expect(window.location.pathname).toBe('/browser-mode');
    expect(window.location.search).toBe('?query=real');
    expect(window.location.hash).toBe('#section');
  });

  it('moves focus with browser keyboard navigation', async () => {
    document.body.innerHTML = `
      <form aria-label="Focus order">
        <label for="first-name">First name</label>
        <input id="first-name" />
        <button type="button">Continue</button>
        <a href="/browser-mode-target">Target link</a>
      </form>
    `;
    resetBodyFocus();

    await userEvent.tab();
    await expect.element(page.getByLabelText('First name')).toHaveFocus();

    await userEvent.tab();
    await expect.element(page.getByRole('button', { name: 'Continue' })).toHaveFocus();

    await userEvent.tab();
    await expect.element(page.getByRole('link', { name: 'Target link' })).toHaveFocus();
  });
});
