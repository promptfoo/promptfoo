import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDataTableServerSorting } from './use-server-sorting';

type SortField = 'createdAt' | 'name';

describe('useDataTableServerSorting', () => {
  it('maps the server sort model into TanStack sorting state', () => {
    const setSortModel = vi.fn();
    const { result } = renderHook(() =>
      useDataTableServerSorting<SortField>({
        sortModel: [{ field: 'createdAt', sort: 'desc' }],
        setSortModel,
        defaultSortField: 'createdAt',
        allowedFields: ['createdAt', 'name'],
      }),
    );

    expect(result.current.sorting).toEqual([{ id: 'createdAt', desc: true }]);
  });

  it('maps ascending server sorts into non-descending TanStack sorting state', () => {
    const setSortModel = vi.fn();
    const { result } = renderHook(() =>
      useDataTableServerSorting<SortField>({
        sortModel: [{ field: 'name', sort: 'asc' }],
        setSortModel,
        defaultSortField: 'createdAt',
        allowedFields: ['createdAt', 'name'],
      }),
    );

    expect(result.current.sorting).toEqual([{ id: 'name', desc: false }]);
  });

  it('writes an ascending server sort when TanStack marks the column ascending', () => {
    const setSortModel = vi.fn();
    const { result } = renderHook(() =>
      useDataTableServerSorting<SortField>({
        sortModel: [{ field: 'createdAt', sort: 'desc' }],
        setSortModel,
        defaultSortField: 'createdAt',
        allowedFields: new Set<SortField>(['createdAt', 'name']),
      }),
    );

    act(() => {
      result.current.onSortingChange([{ id: 'name', desc: false }]);
    });

    expect(setSortModel).toHaveBeenCalledWith([{ field: 'name', sort: 'asc' }]);
  });

  it('treats a present TanStack sort without desc=false as descending', () => {
    const setSortModel = vi.fn();
    const { result } = renderHook(() =>
      useDataTableServerSorting<SortField>({
        sortModel: [],
        setSortModel,
        defaultSortField: 'createdAt',
        allowedFields: ['createdAt', 'name'],
      }),
    );

    act(() => {
      result.current.onSortingChange([{ id: 'name' } as any]);
    });

    expect(setSortModel).toHaveBeenCalledWith([{ field: 'name', sort: 'desc' }]);
  });

  it('falls back to the default field and descending sort when sorting is cleared', () => {
    const setSortModel = vi.fn();
    const { result } = renderHook(() =>
      useDataTableServerSorting<SortField>({
        sortModel: [{ field: 'name', sort: 'asc' }],
        setSortModel,
        defaultSortField: 'createdAt',
        allowedFields: ['createdAt', 'name'],
      }),
    );

    act(() => {
      result.current.onSortingChange([]);
    });

    expect(setSortModel).toHaveBeenCalledWith([{ field: 'createdAt', sort: 'desc' }]);
  });

  it('allows arbitrary fields when no allowlist is provided', () => {
    const setSortModel = vi.fn();
    const { result } = renderHook(() =>
      useDataTableServerSorting<string>({
        sortModel: [],
        setSortModel,
        defaultSortField: 'createdAt',
      }),
    );

    act(() => {
      result.current.onSortingChange([{ id: 'customField', desc: true }]);
    });

    expect(setSortModel).toHaveBeenCalledWith([{ field: 'customField', sort: 'desc' }]);
  });

  it('ignores fields outside an explicit allowlist', () => {
    const setSortModel = vi.fn();
    const { result } = renderHook(() =>
      useDataTableServerSorting<SortField>({
        sortModel: [],
        setSortModel,
        defaultSortField: 'createdAt',
        allowedFields: ['createdAt', 'name'],
      }),
    );

    act(() => {
      result.current.onSortingChange([{ id: 'unknownField', desc: false }]);
    });

    expect(setSortModel).not.toHaveBeenCalled();
  });

  it('treats an explicitly empty allowlist as allow none', () => {
    const setSortModel = vi.fn();
    const { result } = renderHook(() =>
      useDataTableServerSorting<string>({
        sortModel: [],
        setSortModel,
        defaultSortField: 'createdAt',
        allowedFields: [],
      }),
    );

    act(() => {
      result.current.onSortingChange([{ id: 'createdAt', desc: false }]);
    });

    expect(setSortModel).not.toHaveBeenCalled();
  });
});
