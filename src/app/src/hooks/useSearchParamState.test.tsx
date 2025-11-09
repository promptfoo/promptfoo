import { renderHook, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { useSearchParamState } from './useSearchParamState';

// Wrapper component to provide React Router context
const createWrapper = (initialEntries: string[] = ['/']) => {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/*" element={<>{children}</>} />
      </Routes>
    </MemoryRouter>
  );
};

describe('useSearchParamState', () => {
  it('should return default value when param is not in URL', () => {
    const schema = z.string();
    const { result } = renderHook(() => useSearchParamState('test', schema, 'default'), {
      wrapper: createWrapper(),
    });

    const [value] = result.current;
    expect(value).toBe('default');
  });

  it('should return param value from URL when present', () => {
    const schema = z.string();
    const { result } = renderHook(() => useSearchParamState('test', schema, 'default'), {
      wrapper: createWrapper(['/?test=urlValue']),
    });

    const [value] = result.current;
    expect(value).toBe('urlValue');
  });

  it('should update URL when setter is called', () => {
    const schema = z.string();
    const { result } = renderHook(() => useSearchParamState('test', schema, null), {
      wrapper: createWrapper(),
    });

    act(() => {
      const [, setValue] = result.current;
      setValue('newValue');
    });

    const [value] = result.current;
    expect(value).toBe('newValue');
  });

  it('should remove param from URL when set to null', () => {
    const schema = z.string();
    const { result } = renderHook(() => useSearchParamState('test', schema, null), {
      wrapper: createWrapper(['/?test=value&other=param']),
    });

    // Initially has value
    expect(result.current[0]).toBe('value');

    act(() => {
      const [, setValue] = result.current;
      setValue(null);
    });

    // After setting to null, should be null
    expect(result.current[0]).toBe(null);
  });

  it('should validate against schema and return default on invalid value', () => {
    const schema = z.enum(['all', 'failures', 'highlights']);
    const { result } = renderHook(() => useSearchParamState('mode', schema, 'all'), {
      wrapper: createWrapper(['/?mode=invalid']),
    });

    const [value] = result.current;
    expect(value).toBe('all'); // Falls back to default
  });

  it('should handle schema with valid enum values', () => {
    const schema = z.enum(['all', 'failures', 'highlights']);
    const { result } = renderHook(() => useSearchParamState('mode', schema, 'all'), {
      wrapper: createWrapper(['/?mode=failures']),
    });

    const [value] = result.current;
    expect(value).toBe('failures');
  });

  it('should throw error when trying to set empty string', () => {
    const schema = z.string();
    const { result } = renderHook(() => useSearchParamState('test', schema, null), {
      wrapper: createWrapper(),
    });

    expect(() => {
      act(() => {
        const [, setValue] = result.current;
        setValue('');
      });
    }).toThrow('Do not use empty strings');
  });

  it('should preserve other URL params when updating', () => {
    const schema = z.string();
    const { result } = renderHook(() => useSearchParamState('test', schema, null), {
      wrapper: createWrapper(['/?other=value&test=initial']),
    });

    act(() => {
      const [, setValue] = result.current;
      setValue('updated');
    });

    // The value should be updated
    expect(result.current[0]).toBe('updated');
  });

  it('should handle multiple params independently', () => {
    const schema1 = z.string();
    const schema2 = z.string();

    const { result: result1 } = renderHook(() => useSearchParamState('param1', schema1, null), {
      wrapper: createWrapper(['/?param1=value1&param2=value2']),
    });

    const { result: result2 } = renderHook(() => useSearchParamState('param2', schema2, null), {
      wrapper: createWrapper(['/?param1=value1&param2=value2']),
    });

    expect(result1.current[0]).toBe('value1');
    expect(result2.current[0]).toBe('value2');
  });

  it('should handle complex JSON string values', () => {
    const schema = z.string();
    const jsonValue = JSON.stringify({ foo: 'bar', baz: [1, 2, 3] });
    const { result } = renderHook(() => useSearchParamState('data', schema, null), {
      wrapper: createWrapper([`/?data=${encodeURIComponent(jsonValue)}`]),
    });

    const [value] = result.current;
    expect(value).toBe(jsonValue);
  });

  it('should handle special characters in param values', () => {
    const schema = z.string();
    const specialValue = 'test!@#$%^&*()_+=-`~[]{}|;\':",./<>?';
    const { result } = renderHook(() => useSearchParamState('test', schema, null), {
      wrapper: createWrapper([`/?test=${encodeURIComponent(specialValue)}`]),
    });

    const [value] = result.current;
    expect(value).toBe(specialValue);
  });

  it('should return null when param is not present and no default provided', () => {
    const schema = z.string();
    const { result } = renderHook(() => useSearchParamState('test', schema, null), {
      wrapper: createWrapper(),
    });

    const [value] = result.current;
    expect(value).toBe(null);
  });

  it('should handle unicode characters in values', () => {
    const schema = z.string();
    const unicodeValue = '你好世界 🌍 مرحبا';
    const { result } = renderHook(() => useSearchParamState('test', schema, null), {
      wrapper: createWrapper([`/?test=${encodeURIComponent(unicodeValue)}`]),
    });

    const [value] = result.current;
    expect(value).toBe(unicodeValue);
  });

  it('should handle rapid successive updates', () => {
    const schema = z.string();
    const { result } = renderHook(() => useSearchParamState('test', schema, null), {
      wrapper: createWrapper(),
    });

    act(() => {
      const [, setValue] = result.current;
      setValue('value1');
      setValue('value2');
      setValue('value3');
    });

    const [value] = result.current;
    expect(value).toBe('value3');
  });

  it('should maintain stable setter reference across re-renders', () => {
    const schema = z.string();
    const { result, rerender } = renderHook(() => useSearchParamState('test', schema, null), {
      wrapper: createWrapper(),
    });

    const [, setter1] = result.current;
    rerender();
    const [, setter2] = result.current;

    expect(setter1).toBe(setter2);
  });
});
