import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnimatedCounter from './AnimatedCounter';

let intersect: (visible: boolean) => void;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
const disconnect = vi.fn();

function advance(timestamp: number) {
  const pending = [...frames.values()];
  frames.clear();
  act(() => pending.forEach((callback) => callback(timestamp)));
}

describe('AnimatedCounter', () => {
  beforeEach(() => {
    disconnect.mockReset();
    frames = new Map();
    nextFrame = 0;
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false }) as MediaQueryList),
    );
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        frames.set(++nextFrame, callback);
        return nextFrame;
      }),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => frames.delete(id)),
    );
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersect = (visible) =>
            act(() =>
              callback(
                [{ isIntersecting: visible } as IntersectionObserverEntry],
                this as unknown as IntersectionObserver,
              ),
            );
        }
        observe() {}
        disconnect = disconnect;
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('starts when visible, formats the final count and does not replay', () => {
    render(<AnimatedCounter target="300,000" suffix="+" />);
    expect(screen.getByText('0+')).toBeInTheDocument();
    intersect(false);
    expect(frames.size).toBe(0);
    intersect(true);
    advance(100);
    advance(975);
    expect(screen.getByText('149,834+')).toBeInTheDocument();
    advance(1850);
    expect(screen.getByText('299,667+')).toBeInTheDocument();
    advance(3600);
    expect(screen.getByText('300,000+')).toBeInTheDocument();
    expect(frames.size).toBe(0);
    intersect(false);
    intersect(true);
    expect(frames.size).toBe(0);
  });

  it('eases small totals and finishes at the exact target after a delayed frame', () => {
    render(<AnimatedCounter target="500" />);
    intersect(true);
    advance(100);
    advance(1850);
    expect(screen.getByText('484')).toBeInTheDocument();
    advance(5000);
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(frames.size).toBe(0);
  });

  it('shows the final count immediately when reduced motion is requested', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true }) as MediaQueryList),
    );
    render(<AnimatedCounter target="1,234" suffix="+" />);
    intersect(true);
    expect(screen.getByText('1,234+')).toBeInTheDocument();
    expect(frames.size).toBe(0);
  });

  it('cancels a pending frame and disconnects observation on unmount', () => {
    const { unmount } = render(<AnimatedCounter target="500" />);
    intersect(true);
    advance(100);
    expect(frames.size).toBe(1);
    const disconnectsBeforeUnmount = disconnect.mock.calls.length;
    unmount();
    expect(frames.size).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(disconnectsBeforeUnmount + 1);
  });

  it('cancels old animation work when the target changes', () => {
    const { rerender } = render(<AnimatedCounter target="500" suffix="+" />);
    intersect(true);
    advance(100);
    advance(1850);
    rerender(<AnimatedCounter target="2,000" suffix="!" />);
    expect(screen.getByText('0!')).toBeInTheDocument();
    expect(frames.size).toBe(0);
    intersect(true);
    advance(2000);
    advance(5500);
    expect(screen.getByText('2,000!')).toBeInTheDocument();
  });

  it('ignores an intersection callback queued before unmount', () => {
    const { unmount } = render(<AnimatedCounter target="500" />);
    const queuedIntersection = intersect;
    unmount();
    queuedIntersection(true);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });

  it.each([false, true])(
    'ignores the previous target observer with reduced motion %s',
    (reducedMotion) => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: reducedMotion }) as MediaQueryList),
      );
      const { rerender } = render(<AnimatedCounter target="500" />);
      const queuedIntersection = intersect;
      rerender(<AnimatedCounter target="2,000" />);
      queuedIntersection(true);
      expect(frames.size).toBe(0);
      expect(screen.getByText('0')).toBeInTheDocument();
      intersect(true);
      if (!reducedMotion) {
        advance(100);
        advance(3600);
      }
      expect(screen.getByText('2,000')).toBeInTheDocument();
    },
  );

  it('still reaches its target without IntersectionObserver support', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<AnimatedCounter target="500" suffix="+" />);
    advance(100);
    advance(3600);
    expect(screen.getByText('500+')).toBeInTheDocument();
  });

  it('hydrates the initial server markup without a mismatch', async () => {
    const element = <AnimatedCounter target="300,000" suffix="+" />;
    const container = document.createElement('div');
    container.innerHTML = renderToString(element);
    expect(container.textContent).toBe('0+');
    document.body.appendChild(container);
    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, element, {
          onRecoverableError: (error) => errors.push(error),
        });
      });
      expect(errors).toEqual([]);
      expect(container.textContent).toBe('0+');
      intersect(true);
      advance(100);
      advance(3600);
      expect(container.textContent).toBe('300,000+');
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });
});
