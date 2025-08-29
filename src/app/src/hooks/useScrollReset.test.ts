import { renderHook } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { useEditAndRerunScrollReset, useScrollReset } from './useScrollReset';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useLocation: vi.fn(),
  };
});

const mockedScrollTo = vi.fn();
vi.stubGlobal('scrollTo', mockedScrollTo);

const mockedUseLocation = useLocation as Mock;

describe('useScrollReset', () => {
  beforeEach(() => {
    mockedUseLocation.mockReturnValue({ pathname: '/initial-route' });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Default Behavior (no options)', () => {
    it('should call window.scrollTo(0, 0) immediately when the route changes', () => {
      const { rerender } = renderHook(() => useScrollReset());

      expect(mockedScrollTo).toHaveBeenCalledTimes(1);
      expect(mockedScrollTo).toHaveBeenCalledWith(0, 0);

      mockedUseLocation.mockReturnValue({ pathname: '/new-route' });

      rerender();

      expect(mockedScrollTo).toHaveBeenCalledTimes(2);
      expect(mockedScrollTo).toHaveBeenLastCalledWith(0, 0);
    });
  });

  describe('resetOnRoutes option', () => {
    it('should call window.scrollTo(0, 0) when the route changes to a value included in resetOnRoutes', () => {
      const resetRoutes = ['/route1', '/route2'];
      mockedUseLocation.mockReturnValue({ pathname: '/initial-route' });
      const { rerender } = renderHook(() => useScrollReset({ resetOnRoutes: resetRoutes }));

      expect(mockedScrollTo).not.toHaveBeenCalled();

      mockedUseLocation.mockReturnValue({ pathname: '/route1' });
      rerender();

      expect(mockedScrollTo).toHaveBeenCalledTimes(1);
      expect(mockedScrollTo).toHaveBeenCalledWith(0, 0);

      mockedUseLocation.mockReturnValue({ pathname: '/route2' });
      rerender();

      expect(mockedScrollTo).toHaveBeenCalledTimes(2);
      expect(mockedScrollTo).toHaveBeenCalledWith(0, 0);
    });

    it('should not call window.scrollTo when the route changes to a value not included in resetOnRoutes', () => {
      const { rerender } = renderHook(() => useScrollReset({ resetOnRoutes: ['/setup'] }));

      expect(mockedScrollTo).not.toHaveBeenCalled();

      mockedUseLocation.mockReturnValue({ pathname: '/another-route' });

      rerender();

      expect(mockedScrollTo).not.toHaveBeenCalled();
    });
  });

  describe('Delayed Scroll Reset', () => {
    it('should call window.scrollTo(0, 0) after the specified delay when useDelay is true and the route matches resetOnRoutes', async () => {
      mockedUseLocation.mockReturnValue({ pathname: '/reset-route' });

      const delayMs = 200;
      renderHook(() =>
        useScrollReset({ resetOnRoutes: ['/reset-route'], useDelay: true, delayMs }),
      );

      expect(mockedScrollTo).not.toHaveBeenCalled();

      vi.advanceTimersByTime(delayMs);

      await Promise.resolve();

      expect(mockedScrollTo).toHaveBeenCalledTimes(1);
      expect(mockedScrollTo).toHaveBeenCalledWith(0, 0);
    });
  });

  describe('useEditAndRerunScrollReset', () => {
    it('should call window.scrollTo(0, 0) after 150ms when the route is /setup', () => {
      mockedUseLocation.mockReturnValue({ pathname: '/setup' });
      renderHook(() => useEditAndRerunScrollReset());

      expect(mockedScrollTo).not.toHaveBeenCalled();

      vi.advanceTimersByTime(150);

      expect(mockedScrollTo).toHaveBeenCalledTimes(1);
      expect(mockedScrollTo).toHaveBeenCalledWith(0, 0);
    });
  });
});
