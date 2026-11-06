import React from 'react';

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import ScalarApiReference from './ScalarApiReference';

const props = {
  heading: 'Server API',
  description: 'Local server routes.',
  specUrl: '/openapi.json',
};
const getScript = () =>
  document.head.querySelector<HTMLScriptElement>('script[src*="@scalar/api-reference"]')!;
const getViewer = () => document.getElementById('promptfoo-api-reference');

function expectFallback() {
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'OpenAPI JSON' })).toHaveAttribute('href', props.specUrl);
  expect(getViewer()).toHaveAttribute('aria-busy', 'false');
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
  vi.unstubAllGlobals();
});

it('loads one viewer and follows the site theme without remounting', async () => {
  document.documentElement.dataset.theme = 'dark';
  const destroy = vi.fn();
  const createApiReference = vi.fn(() => ({ destroy }));
  const { unmount } = render(<ScalarApiReference {...props} />);
  expect(getViewer()).toHaveAttribute('aria-busy', 'true');
  const script = getScript();
  expect(script.crossOrigin).toBe('anonymous');
  expect(script.integrity).toMatch(/^sha384-/);
  vi.stubGlobal('Scalar', { createApiReference });
  act(() => script.dispatchEvent(new Event('load')));
  expect(createApiReference).toHaveBeenCalledWith('#promptfoo-api-reference', {
    url: props.specUrl,
    theme: 'alternate',
    forceDarkModeState: 'dark',
    hideTestRequestButton: false,
  });
  expect(getViewer()).toHaveAttribute('aria-busy', 'false');

  await act(async () => {
    document.documentElement.dataset.theme = 'light';
  });
  expect(document.body).toHaveClass('light-mode');
  expect(createApiReference).toHaveBeenCalledTimes(1);
  unmount();
  expect(destroy).toHaveBeenCalledOnce();
  expect(document.body).not.toHaveClass('light-mode');
});

it('reuses the loaded script when navigating to the local reference', () => {
  const destroy = vi.fn();
  const createApiReference = vi.fn(() => ({ destroy }));
  vi.stubGlobal('Scalar', { createApiReference });
  const { rerender } = render(<ScalarApiReference {...props} specUrl="/cloud.json" />);
  rerender(<ScalarApiReference {...props} hideTestRequestButton />);
  expect(destroy).toHaveBeenCalledOnce();
  expect(createApiReference).toHaveBeenLastCalledWith(
    '#promptfoo-api-reference',
    expect.objectContaining({ url: props.specUrl, hideTestRequestButton: true }),
  );
  expect(getScript()).toBeNull();
});

it.each(['failed', 'pending'])('can revisit the page after a %s script load', (state) => {
  const { unmount } = render(<ScalarApiReference {...props} />);
  const previous = getScript();
  if (state === 'failed') {
    act(() => previous.dispatchEvent(new Event('error')));
    expectFallback();
  }
  unmount();
  render(<ScalarApiReference {...props} />);
  expect(getScript()).not.toBe(previous);
  const createApiReference = vi.fn(() => ({ destroy: vi.fn() }));
  vi.stubGlobal('Scalar', { createApiReference });
  act(() => previous.dispatchEvent(new Event('load')));
  expect(createApiReference).not.toHaveBeenCalled();
  act(() => getScript().dispatchEvent(new Event('load')));
  expect(createApiReference).toHaveBeenCalledOnce();
  expect(screen.queryByRole('alert')).toBeNull();
});

it.each(['missing', 'empty result', 'exception'])(
  'keeps the raw spec available on %s',
  (failure) => {
    if (failure !== 'missing') {
      vi.stubGlobal('Scalar', {
        createApiReference: () => {
          if (failure === 'exception') throw new Error('Initialization failed');
        },
      });
    }
    render(<ScalarApiReference {...props} />);
    if (failure === 'missing') act(() => getScript().dispatchEvent(new Event('load')));
    expectFallback();
  },
);
