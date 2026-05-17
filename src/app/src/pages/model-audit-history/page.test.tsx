import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ModelAuditHistoryPage from './page';

// Mock the stores used by ModelAuditHistory
vi.mock('../model-audit/stores', () => ({
  useModelAuditConfigStore: (selector: (state: { startNewScan: () => void }) => unknown) =>
    selector({ startNewScan: vi.fn() }),
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
  const originalTitle = document.title;
  let descriptionMetaTag: HTMLMetaElement;

  beforeEach(() => {
    descriptionMetaTag = document.createElement('meta');
    descriptionMetaTag.name = 'description';
    descriptionMetaTag.content = 'Initial description';
    document.head.appendChild(descriptionMetaTag);
    document.title = 'Initial Title';
  });

  afterEach(() => {
    cleanup();
    descriptionMetaTag.remove();
    document.title = originalTitle;
  });

  it('renders the scan history page', () => {
    const { container } = renderWithRouter(<ModelAuditHistoryPage />);

    // The page should render successfully
    expect(container.firstChild).toBeInTheDocument();

    // The page should have the main heading (level 1)
    expect(screen.getByRole('heading', { name: 'Scan History', level: 1 })).toBeInTheDocument();
  });

  it('renders no rows message when history is empty', () => {
    renderWithRouter(<ModelAuditHistoryPage />);

    // The page should show the no rows overlay
    expect(screen.getByText(/no scan history found/i)).toBeInTheDocument();
  });

  it('sets Model Audit history metadata', () => {
    renderWithRouter(<ModelAuditHistoryPage />);

    expect(document.title).toBe('Model Audit History | promptfoo');
    expect(descriptionMetaTag).toHaveAttribute('content', 'Browse model audit scan history');
  });
});
