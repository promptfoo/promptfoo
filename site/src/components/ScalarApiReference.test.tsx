import React from 'react';

import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ScalarApiReference from './ScalarApiReference';

const props = {
  description: 'Local server API',
  heading: 'Server API',
  specUrl: '/api/openapi.json',
  summary: 'Routes exposed by the local server.',
  title: 'API reference',
};

function getScript() {
  return document.querySelector<HTMLScriptElement>('#scalar-api-reference-script')!;
}

function loadScript(createApiReference: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('Scalar', { createApiReference });
  act(() => getScript().dispatchEvent(new Event('load')));
}

function expectFallback() {
  expect(
    within(screen.getByRole('alert')).getByRole('link', { name: 'OpenAPI JSON' }),
  ).toHaveAttribute('href', props.specUrl);
  expect(document.getElementById('api-reference')).toHaveAttribute('aria-busy', 'false');
}

afterEach(() => {
  cleanup();
  getScript()?.remove();
  document.documentElement.removeAttribute('data-theme');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

describe('ScalarApiReference', () => {
  it('loads the reference with the current theme and destroys it on unmount', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const destroy = vi.fn();
    const createApiReference = vi.fn().mockReturnValue({ destroy });
    const { unmount } = render(<ScalarApiReference {...props} />);

    expect(document.getElementById('api-reference')).toHaveAttribute('aria-busy', 'true');
    expect(getScript().crossOrigin).toBe('anonymous');
    expect(getScript().integrity).toMatch(/^sha384-/);
    loadScript(createApiReference);

    expect(createApiReference).toHaveBeenCalledWith('#api-reference', {
      hideTestRequestButton: false,
      theme: 'dark',
      url: props.specUrl,
    });
    expect(document.getElementById('api-reference')).toHaveAttribute('aria-busy', 'false');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    unmount();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it('hides request execution when disabled and replaces the reference when its URL changes', () => {
    const destroy = vi.fn();
    const createApiReference = vi.fn().mockReturnValue({ destroy });
    const { rerender } = render(<ScalarApiReference {...props} showTestRequestButton={false} />);
    loadScript(createApiReference);
    expect(createApiReference).toHaveBeenLastCalledWith('#api-reference', {
      hideTestRequestButton: true,
      theme: 'alternate',
      url: props.specUrl,
    });

    rerender(<ScalarApiReference {...props} specUrl="/other.json" showTestRequestButton={false} />);
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(createApiReference).toHaveBeenLastCalledWith(
      '#api-reference',
      expect.objectContaining({ url: '/other.json', hideTestRequestButton: true }),
    );
    expect(document.querySelectorAll('#scalar-api-reference-script')).toHaveLength(1);
  });

  it('retains the raw spec link when the script fails', () => {
    render(<ScalarApiReference {...props} />);
    act(() => getScript().dispatchEvent(new Event('error')));
    expectFallback();
  });

  it.each(['throws', 'returns nothing', 'is missing'])(
    'retains the raw spec link when initialization %s',
    (failure) => {
      render(<ScalarApiReference {...props} />);
      const createApiReference = vi.fn(() => {
        if (failure === 'throws') {
          throw new Error('Renderer could not initialize');
        }
      });
      if (failure === 'is missing') {
        act(() => getScript().dispatchEvent(new Event('load')));
      } else {
        loadScript(createApiReference);
      }
      expectFallback();
    },
  );

  it('handles a throwing initializer from an already loaded script', () => {
    const { unmount } = render(<ScalarApiReference {...props} />);
    loadScript(vi.fn().mockReturnValue({}));
    unmount();
    vi.stubGlobal('Scalar', {
      createApiReference: vi.fn(() => {
        throw new Error('Renderer could not initialize');
      }),
    });
    render(<ScalarApiReference {...props} />);
    expectFallback();
  });

  it('removes pending script listeners on unmount', () => {
    const { unmount } = render(<ScalarApiReference {...props} />);
    const script = getScript();
    unmount();
    const createApiReference = vi.fn().mockReturnValue({});
    vi.stubGlobal('Scalar', { createApiReference });
    act(() => script.dispatchEvent(new Event('load')));
    expect(createApiReference).not.toHaveBeenCalled();
  });

  it('tracks theme changes and disconnects its observer on unmount', async () => {
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const { unmount } = render(<ScalarApiReference {...props} />);
    expect(document.getElementById('api-reference')).toHaveAttribute('data-theme', 'alternate');
    await act(async () => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    expect(document.getElementById('api-reference')).toHaveAttribute('data-theme', 'dark');
    unmount();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
