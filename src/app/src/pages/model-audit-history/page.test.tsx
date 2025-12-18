import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ModelAuditHistoryPage from './page';

// Mock the stores used by ModelAuditHistory
vi.mock('../model-audit/stores', () => ({
  useModelAuditHistoryStore: () => ({
    historicalScans: [],
    isLoadingHistory: false,
    historyError: null,
    totalCount: 0,
    pageSize: 10,
    currentPage: 0,
    sortModel: [{ field: 'createdAt', sort: 'desc' }],
    fetchHistoricalScans: vi.fn(),
    deleteHistoricalScan: vi.fn(),
    setPageSize: vi.fn(),
    setCurrentPage: vi.fn(),
    setSortModel: vi.fn(),
  }),
}));

const renderWithRouter = (component: React.ReactElement) => {
  return render(<MemoryRouter>{component}</MemoryRouter>);
};

describe('ModelAuditHistoryPage', () => {
  it('renders the scan history page with New Scan button', () => {
    renderWithRouter(<ModelAuditHistoryPage />);

    // The page should render with the DataGrid toolbar containing a New Scan button
    expect(screen.getByRole('button', { name: /new scan/i })).toBeInTheDocument();
  });

  it('renders no rows message when history is empty', () => {
    renderWithRouter(<ModelAuditHistoryPage />);

    // The page should show the no rows overlay
    expect(screen.getByText(/no scan history found/i)).toBeInTheDocument();
  });
});
