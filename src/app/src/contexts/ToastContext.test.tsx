import { useToast } from '@app/hooks/useToast';
import { restoreTestTimers, useTestTimers } from '@app/tests/timers';
import { act, cleanup, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from './ToastContext';

import type { ToastSeverity } from './ToastContextDef';

beforeEach(() => {
  useTestTimers();
});

afterEach(() => {
  cleanup();
  restoreTestTimers();
});

function setup(reactStrictMode = false) {
  return renderHook(() => useToast(), { wrapper: ToastProvider, reactStrictMode });
}

function expectOpen(open: boolean) {
  expect(screen.getByRole('alert')).toHaveClass(open ? 'opacity-100' : 'opacity-0');
}

describe('ToastProvider notification lifetime', () => {
  it.each([false, true])('gives a replacement its full duration (same message: %s)', (same) => {
    const { result } = setup();
    act(() => result.current.showToast('First', 'info'));
    act(() => vi.advanceTimersByTime(1900));
    act(() => result.current.showToast(same ? 'First' : 'Second', same ? 'info' : 'success'));
    act(() => vi.advanceTimersByTime(100));
    expectOpen(true);
    expect(screen.getByText(same ? 'First' : 'Second')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1899));
    expectOpen(true);
    act(() => vi.advanceTimersByTime(1));
    expectOpen(false);
  });

  it.each<ToastSeverity>(['success', 'error', 'warning', 'info'])(
    'preserves the two-second default for %s notifications and the exit transition',
    (severity) => {
      const { result } = setup();
      act(() => result.current.showToast('Line one\nLine two', severity));
      expectOpen(true);
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('transition-all', 'duration-300');
      expect(alert.querySelector('p')).toHaveClass('whitespace-pre-line');
      act(() => vi.advanceTimersByTime(1999));
      expectOpen(true);
      act(() => vi.advanceTimersByTime(1));
      expectOpen(false);
      expect(screen.getByRole('alert')).toBe(alert);
      expect(alert).toHaveTextContent('Line one Line two');
    },
  );

  it('uses a changed duration from the replacement notification', () => {
    const { result } = setup();
    act(() => result.current.showToast('First', 'info', 2000));
    act(() => vi.advanceTimersByTime(1900));
    act(() => result.current.showToast('Second', 'warning', 3000));
    act(() => vi.advanceTimersByTime(2999));
    expectOpen(true);
    act(() => vi.advanceTimersByTime(1));
    expectOpen(false);
  });

  it.each([0, -1])('keeps duration %s visible until explicitly dismissed', async (duration) => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { result } = setup();
    act(() => result.current.showToast('First'));
    act(() => vi.advanceTimersByTime(1900));
    act(() => result.current.showToast('Persistent', 'warning', duration));
    act(() => vi.advanceTimersByTime(10000));
    expectOpen(true);
    await act(async () => {
      const click = user.click(screen.getByRole('button', { name: 'Dismiss' }));
      await vi.advanceTimersByTimeAsync(0);
      await click;
    });
    expectOpen(false);
    expect(screen.getByText('Persistent')).toBeInTheDocument();
  });

  it('dismisses immediately and does not let an old timer close the next notification', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const { result } = setup();
    act(() => result.current.showToast('First'));
    act(() => vi.advanceTimersByTime(1900));
    await act(async () => {
      const click = user.click(screen.getByRole('button', { name: 'Dismiss' }));
      await vi.advanceTimersByTimeAsync(0);
      await click;
    });
    expectOpen(false);
    act(() => result.current.showToast('Next'));
    act(() => vi.advanceTimersByTime(100));
    expectOpen(true);
    act(() => vi.advanceTimersByTime(1900));
    expectOpen(false);
  });

  it('cancels notification timers on unmount', () => {
    const { result, unmount } = setup();
    act(() => result.current.showToast('Unmount me'));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts identical notifications in StrictMode without changing the context API', () => {
    const { result } = setup(true);
    const context = result.current;
    act(() => result.current.showToast('Again'));
    act(() => vi.advanceTimersByTime(1900));
    act(() => result.current.showToast('Again'));
    act(() => vi.advanceTimersByTime(100));
    expectOpen(true);
    expect(result.current).toBe(context);
    act(() => vi.advanceTimersByTime(1900));
    expectOpen(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
