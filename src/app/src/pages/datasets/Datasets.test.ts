import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSortableData, useDialog } from './Datasets';
import type { TestCasesWithMetadata } from '@promptfoo/types';

const mockUseSearchParams = vi.fn();
vi.mock('react-router-dom', () => ({
  useSearchParams: () => mockUseSearchParams(),
  Link: vi.fn(),
}));

describe('useSortableData', () => {
  const mockData: (TestCasesWithMetadata & { recentEvalDate: string })[] = [
    {
      id: 'test1',
      testCases: [],
      count: 5,
      recentEvalDate: '2023-01-01',
      recentEvalId: 'eval1',
      prompts: []
    },
    {
      id: 'test2',
      testCases: [],
      count: 10,
      recentEvalDate: '2023-01-02',
      recentEvalId: 'eval2',
      prompts: []
    }
  ];

  it('should sort by date in descending order by default', () => {
    const { result } = renderHook(() => useSortableData(mockData));
    expect(result.current.sortedData[0].id).toBe('test2');
    expect(result.current.sortedData[1].id).toBe('test1');
  });

  it('should sort by count when count field is selected', () => {
    const { result } = renderHook(() => useSortableData(mockData));

    act(() => {
      result.current.handleSort('count');
    });

    expect(result.current.sortedData[0].id).toBe('test1');
    expect(result.current.sortedData[1].id).toBe('test2');
  });

  it('should toggle sort order when same field is selected twice', () => {
    const { result } = renderHook(() => useSortableData(mockData));

    act(() => {
      result.current.handleSort('count');
    });

    expect(result.current.sortedData[0].id).toBe('test1');

    act(() => {
      result.current.handleSort('count');
    });

    expect(result.current.sortedData[0].id).toBe('test2');
  });

  it('should handle empty data array', () => {
    const { result } = renderHook(() => useSortableData([]));
    expect(result.current.sortedData).toEqual([]);
  });

  it('should handle null sort field', () => {
    const { result } = renderHook(() => useSortableData(mockData));

    act(() => {
      result.current.handleSort(null);
    });

    expect(result.current.sortedData).toEqual(mockData);
  });
});

describe('useDialog', () => {
  const mockData = [
    {
      id: 'test123',
      testCases: [],
      recentEvalDate: '2023-01-01',
      count: 1,
      prompts: []
    }
  ];

  beforeEach(() => {
    vi.resetModules();
    mockUseSearchParams.mockReturnValue([new URLSearchParams()]);
  });

  it('should initialize with dialog closed', () => {
    const { result } = renderHook(() => useDialog(mockData));
    expect(result.current.isOpen).toBe(false);
  });

  it('should open dialog when handleOpen is called', () => {
    const { result } = renderHook(() => useDialog(mockData));

    act(() => {
      result.current.handleOpen(0);
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.selectedIndex).toBe(0);
  });

  it('should close dialog when handleClose is called', () => {
    const { result } = renderHook(() => useDialog(mockData));

    act(() => {
      result.current.handleOpen(0);
      result.current.handleClose();
    });

    expect(result.current.isOpen).toBe(false);
  });

  it('should open dialog with correct test case when id is in URL', () => {
    mockUseSearchParams.mockReturnValue([new URLSearchParams('?id=test1')]);

    const { result } = renderHook(() => useDialog(mockData));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.selectedIndex).toBe(0);
  });

  it('should not open dialog when id in URL does not match', () => {
    mockUseSearchParams.mockReturnValue([new URLSearchParams('?id=nonexistent')]);

    const { result } = renderHook(() => useDialog(mockData));

    expect(result.current.isOpen).toBe(false);
  });
});
