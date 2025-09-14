import type { ReactNode } from 'react';

import { ToastContext } from '@app/contexts/ToastContextDef';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useToast } from './useToast';

describe('useToast', () => {
  it('should throw an error when used outside of a ToastProvider', () => {
    expect(() => renderHook(() => useToast())).toThrowError(
      'useToast must be used within a ToastProvider',
    );
  });

  it('should return the context value when used within a ToastProvider', () => {
    const mockContextValue: ReturnType<typeof useToast> = {
      showToast: vi.fn(),
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <ToastContext.Provider value={mockContextValue}>{children}</ToastContext.Provider>
    );

    const { result } = renderHook(() => useToast(), { wrapper });

    expect(result.current).toBe(mockContextValue);
    expect(result.current.showToast).toBeDefined();

    result.current.showToast('Test message', 'success');
    expect(mockContextValue.showToast).toHaveBeenCalledTimes(1);
    expect(mockContextValue.showToast).toHaveBeenCalledWith('Test message', 'success');
  });
});
