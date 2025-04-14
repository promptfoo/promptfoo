import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '@app/contexts/ToastContext';
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

const mockColumnState = {
  selectedColumns: ['Variable 1', 'Prompt 1'],
  columnVisibility: { 'Variable 1': true, 'Prompt 1': true },
};

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
    columnStates: {
      '1': mockColumnState,
    },
    setColumnState: vi.fn(),
  })),
}));

vi.mock('@app/state/evalConfig', () => ({
  useStore: vi.fn(() => ({
    setStateFromConfig: vi.fn(),
  })),
}));

const renderWithToastProvider = (ui: React.ReactNode) => {
  return render(
    <MemoryRouter>
      <ToastProvider>{ui}</ToastProvider>
    </MemoryRouter>,
  );
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
    expect(screen.getByText('Table Settings')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search or select an eval...')).toBeInTheDocument();
  });
});
