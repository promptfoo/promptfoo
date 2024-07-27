import { render, screen } from '@testing-library/react';
import React from 'react';
import { ToastProvider } from '@/app/contexts/ToastContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ResultsView from './ResultsView';
import userEvent from '@testing-library/user-event';

// Mock the stores
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
  })),
}));

// Update the mock for @/state/evalConfig
vi.mock('@/state/evalConfig', () => ({
  useStore: vi.fn(() => ({
    setStateFromConfig: vi.fn(),
  })),
}));

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn(),
  }),
}));

// Wrap the component with ToastProvider
const renderWithToastProvider = (
  ui:
    | string
    | number
    | bigint
    | boolean
    | React.JSX.Element
    | Iterable<React.ReactNode>
    | Promise<React.AwaitedReactNode>
    | null
    | undefined,
) => {
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