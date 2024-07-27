import { render, screen } from '@testing-library/react';
import React from 'react';
import { ToastProvider } from '@/app/contexts/ToastContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ResultsView from './ResultsView';

const mockRecentEvals = [
  {
    id: '1',
    label: 'Eval 1',
    description: 'Description 1',
    evalId: '1',
    datasetId: 'd1',
    createdAt: new Date('2023-01-01').getTime(),
    numTests: 10,
  },
  {
    id: '2',
    label: 'Eval 2',
    description: 'Description 2',
    evalId: '2',
    datasetId: 'd2',
    createdAt: new Date('2023-01-02').getTime(),
    numTests: 15,
  },
];

vi.mock('./store', () => ({
  useStore: vi.fn().mockImplementation(() => ({
    table: {
      head: { prompts: [], vars: [] },
      body: [],
    },
    setTable: vi.fn(),
    config: {},
    setConfig: vi.fn(),
    evalId: '1',
    inComparisonMode: false,
    setInComparisonMode: vi.fn(),
    author: '',
    recentEvals: mockRecentEvals,
    columnVisibility: {},
    setColumnVisibility: vi.fn(),
    selectedColumns: [],
    setSelectedColumns: vi.fn(),
  })),
}));

vi.mock('@/state/evalConfig', () => ({
  useStore: vi.fn(() => ({
    setStateFromConfig: vi.fn(),
  })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(),
  }),
}));

const renderWithToastProvider = (ui: React.ReactNode) => {
  return render(<ToastProvider>{ui}</ToastProvider>);
};

describe('ResultsView', () => {
  const mockOnRecentEvalSelected = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithToastProvider(
      <ResultsView recentEvals={mockRecentEvals} onRecentEvalSelected={mockOnRecentEvalSelected} />,
    );
    expect(screen.getByText('Columns')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search or select an eval...')).toBeInTheDocument();
  });
});
