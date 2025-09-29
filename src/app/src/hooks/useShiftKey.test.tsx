import type { ReactNode } from 'react';

import { ShiftKeyContext } from '@app/contexts/ShiftKeyContextDef';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useShiftKey } from './useShiftKey';

const createWrapper = (shiftKeyValue: boolean) => {
  return ({ children }: { children: ReactNode }) => (
    <ShiftKeyContext.Provider value={shiftKeyValue}>{children}</ShiftKeyContext.Provider>
  );
};

describe('useShiftKey', () => {
  it('should throw an error when used outside of a ShiftKeyProvider', () => {
    expect(() => renderHook(() => useShiftKey())).toThrowError(
      'useShiftKey must be used within a ShiftKeyProvider',
    );
  });

  it.each([
    [true, 'true'],
    [false, 'false'],
  ])('should return %s when ShiftKeyContext provides a %s value', (contextValue) => {
    const wrapper = createWrapper(contextValue);

    const { result } = renderHook(() => useShiftKey(), { wrapper });

    expect(result.current).toBe(contextValue);
  });
});
