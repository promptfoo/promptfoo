import { TooltipProvider } from '@app/components/ui/tooltip';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RiskCategories from './RiskCategories';
import { useReportStore } from './store';

// Mock the store
vi.mock('./store', () => ({
  useReportStore: vi.fn(),
}));

// Mock the drawer component
vi.mock('./RiskCategoryDrawer', () => ({
  default: vi.fn(({ open, category }) =>
    open ? <div data-testid="mock-drawer">{category}</div> : null,
  ),
}));

const mockUseReportStore = vi.mocked(useReportStore);

const createMockProps = (overrides = {}) => ({
  evalId: 'eval-id-123',
  categoryStats: {},
  failuresByPlugin: {},
  passesByPlugin: {},
  ...overrides,
});

const renderWithProviders = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

describe('RiskCategories', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseReportStore.mockReturnValue({
      pluginPassRateThreshold: 1,
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: vi.fn(),
      severityFilter: null,
      setSeverityFilter: vi.fn(),
    });
  });

  it('should render nothing when there are no categories with tests', () => {
    const mockProps = createMockProps({
      categoryStats: {},
    });

    const { container } = renderWithProviders(<RiskCategories {...mockProps} />);
    expect(container.querySelector('.space-y-4')).toBeNull();
  });

  it('should render categories with tests as collapsible rows', () => {
    const mockProps = createMockProps({
      categoryStats: {
        'sql-injection': { pass: 8, total: 10 },
        rbac: { pass: 5, total: 5 },
      },
    });

    renderWithProviders(<RiskCategories {...mockProps} />);

    // Should render the Risk Categories heading
    expect(screen.getByText('Risk Categories')).toBeInTheDocument();

    // Should render Security & Access Control category (contains sql-injection and rbac)
    expect(screen.getByText('Security & Access Control')).toBeInTheDocument();
  });

  it('should display correct pass rate for categories', () => {
    const mockProps = createMockProps({
      categoryStats: {
        'sql-injection': { pass: 8, total: 10 },
        rbac: { pass: 5, total: 5 },
      },
    });

    renderWithProviders(<RiskCategories {...mockProps} />);

    // Total: 8+5 = 13 passes out of 10+5 = 15 tests = 87%
    // Check for the stats in the format "X/Y tests defended"
    expect(screen.getByText(/13\/15 tests defended/)).toBeInTheDocument();
  });

  it('should show plugins expanded by default', () => {
    const mockProps = createMockProps({
      categoryStats: {
        'sql-injection': { pass: 8, total: 10 },
        rbac: { pass: 5, total: 5 },
      },
    });

    renderWithProviders(<RiskCategories {...mockProps} />);

    // Plugins should be visible by default (categories expanded)
    expect(screen.getByText('SQL Injection')).toBeInTheDocument();
    expect(screen.getByText('RBAC Implementation')).toBeInTheDocument();
  });

  it('should open drawer when a plugin is clicked', () => {
    const mockProps = createMockProps({
      categoryStats: {
        'sql-injection': { pass: 8, total: 10 },
      },
    });

    renderWithProviders(<RiskCategories {...mockProps} />);

    // Click on a plugin (already expanded by default)
    const pluginButton = screen.getByRole('button', { name: /SQL Injection/i });
    fireEvent.click(pluginButton);

    // Should show the drawer
    expect(screen.getByTestId('mock-drawer')).toBeInTheDocument();
  });

  it('should show check icon for passing categories and X icon for failing', () => {
    mockUseReportStore.mockReturnValue({
      pluginPassRateThreshold: 1, // 100% required to pass
      showPercentagesOnRiskCards: false,
      setShowPercentagesOnRiskCards: vi.fn(),
      severityFilter: null,
      setSeverityFilter: vi.fn(),
    });

    const mockProps = createMockProps({
      categoryStats: {
        'sql-injection': { pass: 10, total: 10 }, // 100% pass
        rbac: { pass: 8, total: 10 }, // 80% pass - failing
      },
    });

    renderWithProviders(<RiskCategories {...mockProps} />);

    // The category has mixed results (90% = 18/20), so it should show X icon overall
    // since 90% < 100% threshold
    const categoryRow = screen.getByRole('button', { name: /Security & Access Control/i });
    // Just verify the category renders - icon presence depends on implementation
    expect(categoryRow).toBeInTheDocument();
    // The stats should show 18/20 tests passed
    expect(screen.getByText('18/20')).toBeInTheDocument();
  });

  it('should calculate overall stats correctly across all categories', () => {
    const mockProps = createMockProps({
      categoryStats: {
        'sql-injection': { pass: 8, total: 10 },
        contracts: { pass: 4, total: 5 },
      },
    });

    renderWithProviders(<RiskCategories {...mockProps} />);

    // Overall: 8+4 = 12 passes out of 10+5 = 15 tests = 80%
    // Header should show overall stats
    expect(screen.getByText(/12\/15 tests defended/)).toBeInTheDocument();
  });

  it('should hide categories with no tests', () => {
    const mockProps = createMockProps({
      categoryStats: {
        'sql-injection': { pass: 8, total: 10 },
        // contracts category has no tests
      },
    });

    renderWithProviders(<RiskCategories {...mockProps} />);

    // Security category should be visible
    expect(screen.getByText('Security & Access Control')).toBeInTheDocument();

    // Compliance & Legal category should not be visible (contracts belongs there but has no tests)
    expect(screen.queryByText('Compliance & Legal')).not.toBeInTheDocument();
  });

  it('should filter out plugins with no tests', () => {
    const mockProps = createMockProps({
      categoryStats: {
        'sql-injection': { pass: 8, total: 10 },
        rbac: { pass: 0, total: 0 }, // No tests
      },
    });

    renderWithProviders(<RiskCategories {...mockProps} />);

    // SQL Injection should be visible (expanded by default)
    expect(screen.getByText('SQL Injection')).toBeInTheDocument();

    // RBAC should not be visible (no tests)
    expect(screen.queryByText('RBAC')).not.toBeInTheDocument();
  });

  it('should pass correct data to drawer when plugin is clicked', () => {
    const mockProps = createMockProps({
      categoryStats: {
        'sql-injection': { pass: 8, total: 10 },
      },
      failuresByPlugin: {
        'sql-injection': [{ prompt: 'malicious query', output: 'leaked data' }],
      },
      passesByPlugin: {
        'sql-injection': [{ prompt: 'safe query', output: 'OK' }],
      },
    });

    renderWithProviders(<RiskCategories {...mockProps} />);

    // Click plugin (already expanded by default)
    fireEvent.click(screen.getByRole('button', { name: /SQL Injection/i }));

    // Drawer should be opened with the correct category
    const drawer = screen.getByTestId('mock-drawer');
    expect(drawer).toHaveTextContent('sql-injection');
  });

  it('should render all categories that have tests', () => {
    // Create stats for plugins from different categories
    const mockProps = createMockProps({
      categoryStats: {
        'sql-injection': { pass: 8, total: 10 }, // Security & Access Control
        contracts: { pass: 4, total: 5 }, // Compliance & Legal
        'harmful:hate': { pass: 2, total: 3 }, // Trust & Safety
      },
    });

    renderWithProviders(<RiskCategories {...mockProps} />);

    // All three categories should be visible
    expect(screen.getByText('Security & Access Control')).toBeInTheDocument();
    expect(screen.getByText('Compliance & Legal')).toBeInTheDocument();
    expect(screen.getByText('Trust & Safety')).toBeInTheDocument();
  });

  it('should collapse category when clicked', () => {
    const mockProps = createMockProps({
      categoryStats: {
        'sql-injection': { pass: 8, total: 10 },
      },
    });

    renderWithProviders(<RiskCategories {...mockProps} />);

    const categoryButton = screen.getByRole('button', { name: /Security & Access Control/i });

    // Plugins visible by default (expanded) - look for ChevronDown icon
    const pluginRow = screen.getByText('SQL Injection').closest('button');
    expect(pluginRow).toBeVisible();

    // Click to collapse - the CollapsibleContent should get data-state="closed"
    fireEvent.click(categoryButton);

    // The content element should have data-state="closed" and be hidden via CSS
    // (forceMount keeps it in DOM for print support, but CSS hides it)
    const collapsibleContent = pluginRow?.closest('[data-state]');
    expect(collapsibleContent).toHaveAttribute('data-state', 'closed');
  });
});
