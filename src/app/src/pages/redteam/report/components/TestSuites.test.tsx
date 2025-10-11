import { renderWithProviders } from '@app/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TestSuites from './TestSuites';

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
}));

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));

describe('TestSuites Component', () => {
  const mockNavigate = vi.fn();

  const mockRef = { current: null } as React.RefObject<HTMLDivElement>;
  const mockFilterModel = { items: [] } as any;
  const mockSetFilterModel = vi.fn();
  const defaultProps = {
    evalId: 'test-eval-123',
    categoryStats: {
      'harmful:hate': {
        pass: 8,
        total: 10,
        passWithFilter: 9,
      },
    },
    plugins: [],
    vulnerabilitiesDataGridRef: mockRef,
    vulnerabilitiesDataGridFilterModel: mockFilterModel,
    setVulnerabilitiesDataGridFilterModel: mockSetFilterModel,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?evalId=test-eval-123' },
    });
  });

  it('should render an empty DataGrid when categoryStats is empty', () => {
    renderWithProviders(<TestSuites {...defaultProps} categoryStats={{}} />);
    // Check for the DataGrid container
    const dataGrid = screen.getByRole('grid');
    expect(dataGrid).toBeInTheDocument();

    // Check for "No rows" message in DataGrid
    const noRowsOverlay = screen.queryByText(/No rows/i);
    expect(noRowsOverlay).toBeInTheDocument();
  });

  it('should render the DataGrid with correct data', () => {
    renderWithProviders(<TestSuites {...defaultProps} />);

    // Check that the DataGrid is rendered
    const dataGrid = screen.getByRole('grid');
    expect(dataGrid).toBeInTheDocument();

    // Check for column headers
    expect(screen.getByText('Type')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Attack Success Rate')).toBeInTheDocument();
    expect(screen.getByText('Severity')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();

    // Check for row data
    expect(screen.getByText('Hate Speech')).toBeInTheDocument();
    expect(
      screen.getByText('Tests handling of hate speech and discriminatory content'),
    ).toBeInTheDocument();
  });

  it('should render DataGrid with categoryStats data even when plugins prop is empty', () => {
    renderWithProviders(<TestSuites {...defaultProps} />);

    const dataGrid = screen.getByRole('grid');
    expect(dataGrid).toBeInTheDocument();

    expect(screen.getByText('Hate Speech')).toBeInTheDocument();
    expect(
      screen.getByText('Tests handling of hate speech and discriminatory content'),
    ).toBeInTheDocument();
  });

  it('should render without errors and handle unknown severity gracefully during sorting', () => {
    const propsWithUnknownSeverity = {
      ...defaultProps,
      categoryStats: {
        'harmful:hate': {
          pass: 8,
          total: 10,
          passWithFilter: 9,
        },
        'plugin-with-unknown-severity': {
          pass: 5,
          total: 10,
          passWithFilter: 5,
        },
      },
    };

    renderWithProviders(<TestSuites {...propsWithUnknownSeverity} />);

    const dataGrid = screen.getByRole('grid');
    expect(dataGrid).toBeInTheDocument();

    const severityElements = screen.getAllByText(/Critical|Unknown/i);
    const severityValues = severityElements.map((el) => el.textContent);

    expect(severityValues).toContain('Unknown');

    const unknownSeverityIndex = severityValues.indexOf('Unknown');
    const criticalSeverityIndex = severityValues.indexOf('Critical');

    if (unknownSeverityIndex !== -1 && criticalSeverityIndex !== -1) {
      expect(criticalSeverityIndex).toBeLessThan(unknownSeverityIndex);
    }
  });
});

describe('TestSuites Component Navigation', () => {
  const mockNavigate = vi.fn();
  const mockRef = { current: null } as React.RefObject<HTMLDivElement>;
  const mockFilterModel = { items: [] } as any;
  const mockSetFilterModel = vi.fn();

  const defaultProps = {
    evalId: 'test-eval-123',
    categoryStats: {
      'harmful:hate': {
        pass: 8,
        total: 10,
        passWithFilter: 9,
      },
      'harmful:cybercrime': {
        pass: 5,
        total: 10,
        passWithFilter: 5,
      },
    },
    plugins: [],
    vulnerabilitiesDataGridRef: mockRef,
    vulnerabilitiesDataGridFilterModel: mockFilterModel,
    setVulnerabilitiesDataGridFilterModel: mockSetFilterModel,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?evalId=test-eval-123' },
    });
  });

  it('should navigate to eval page with correct search params when clicking View logs', () => {
    renderWithProviders(<TestSuites {...defaultProps} />);

    const viewLogsButtons = screen.getAllByText('View logs');
    const viewLogsButton = viewLogsButtons[0];

    fireEvent.click(viewLogsButton);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/eval/test-eval-123?plugin=harmful%3Ahate&mode=failures',
    );
  });

  it('should not navigate again when browser back button is used', () => {
    renderWithProviders(<TestSuites {...defaultProps} />);

    const viewLogsButtons = screen.getAllByText('View logs');
    const viewLogsButton = viewLogsButtons[0];

    fireEvent.click(viewLogsButton);

    window.history.back();

    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('should navigate to eval page with correctly encoded search params when pluginId contains special characters', () => {
    renderWithProviders(<TestSuites {...defaultProps} />);

    const viewLogsButtons = screen.getAllByText('View logs');
    const viewLogsButton = viewLogsButtons[1];

    fireEvent.click(viewLogsButton);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/eval/test-eval-123?plugin=harmful%3Acybercrime&mode=failures',
    );
  });

  it('should open email in new tab when clicking Apply mitigation', () => {
    const mockOpen = vi.fn();
    const originalOpen = window.open;
    window.open = mockOpen;

    renderWithProviders(<TestSuites {...defaultProps} />);

    const applyMitigationButtons = screen.getAllByText('Apply mitigation');
    const applyMitigationButton = applyMitigationButtons[0];

    fireEvent.click(applyMitigationButton);

    expect(mockOpen).toHaveBeenCalledWith(
      'mailto:inquiries@promptfoo.dev?subject=Promptfoo%20automatic%20vulnerability%20mitigation&body=Hello%20Promptfoo%20Team,%0D%0A%0D%0AI%20am%20interested%20in%20learning%20more%20about%20the%20automatic%20vulnerability%20mitigation%20beta.%20Please%20provide%20me%20with%20more%20details.%0D%0A%0D%0A',
      '_blank',
    );

    // Restore original window.open
    window.open = originalOpen;
  });
});

describe('TestSuites Component Navigation with Missing EvalId', () => {
  const mockNavigate = vi.fn();

  const mockRef = { current: null } as React.RefObject<HTMLDivElement>;
  const mockFilterModel = { items: [] } as any;
  const mockSetFilterModel = vi.fn();
  const defaultProps = {
    evalId: 'test-eval-123',
    categoryStats: {
      'harmful:hate': {
        pass: 8,
        total: 10,
        passWithFilter: 9,
      },
    },
    plugins: [],
    vulnerabilitiesDataGridRef: mockRef,
    vulnerabilitiesDataGridFilterModel: mockFilterModel,
    setVulnerabilitiesDataGridFilterModel: mockSetFilterModel,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '' },
    });
  });

  it('should navigate to eval page without evalId when evalId is missing from URL parameters', () => {
    renderWithProviders(<TestSuites {...defaultProps} />);

    const viewLogsButtons = screen.getAllByText('View logs');
    const viewLogsButton = viewLogsButtons[0];

    fireEvent.click(viewLogsButton);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/eval/test-eval-123?plugin=harmful%3Ahate&mode=failures',
    );
  });
});

describe('TestSuites Component Filtering', () => {
  const mockNavigate = vi.fn();
  const mockRef = { current: null } as React.RefObject<HTMLDivElement>;
  const mockFilterModel = { items: [] } as any;
  const mockSetFilterModel = vi.fn();

  const defaultProps = {
    evalId: 'test-eval-123',
    categoryStats: {
      'harmful:hate': {
        pass: 8,
        total: 10,
        passWithFilter: 9,
      },
      'pii:direct': {
        pass: 0,
        total: 0, // This will be filtered out
        passWithFilter: 0,
      },
    },
    plugins: [],
    vulnerabilitiesDataGridRef: mockRef,
    vulnerabilitiesDataGridFilterModel: mockFilterModel,
    setVulnerabilitiesDataGridFilterModel: mockSetFilterModel,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?evalId=test-eval-123' },
    });
  });

  it('should filter out subcategories with zero total tests', () => {
    renderWithProviders(<TestSuites {...defaultProps} />);
    // DataGrid has header row + data rows
    // With filtering, we should only have 'harmful:hate' row
    expect(screen.getByText('Hate Speech')).toBeInTheDocument();
    expect(screen.queryByText('PIILeak')).not.toBeInTheDocument();
  });
});

describe('TestSuites Component CSV Export', () => {
  const mockNavigate = vi.fn();

  const mockRef = { current: null } as React.RefObject<HTMLDivElement>;
  const mockFilterModel = { items: [] } as any;
  const mockSetFilterModel = vi.fn();
  const defaultProps = {
    evalId: 'test-eval-123',
    categoryStats: {
      'harmful:hate': {
        pass: 8,
        total: 10,
        passWithFilter: 9,
      },
    },
    plugins: [],
    vulnerabilitiesDataGridRef: mockRef,
    vulnerabilitiesDataGridFilterModel: mockFilterModel,
    setVulnerabilitiesDataGridFilterModel: mockSetFilterModel,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    // Mock URL.createObjectURL globally
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render export CSV button', () => {
    renderWithProviders(<TestSuites {...defaultProps} />);

    const exportButton = screen.getByText('Export vulnerabilities to CSV');
    expect(exportButton).toBeInTheDocument();
    expect(exportButton.closest('button')).toBeInTheDocument();
  });
});

describe('TestSuites Component - Zero Attack Success Rate', () => {
  const mockNavigate = vi.fn();
  const mockRef = { current: null } as React.RefObject<HTMLDivElement>;
  const mockFilterModel = { items: [] } as any;
  const mockSetFilterModel = vi.fn();

  const defaultProps = {
    evalId: 'test-eval-123',
    categoryStats: {
      'harmful:hate': {
        pass: 8,
        total: 10,
        passWithFilter: 9,
      },
      hallucination: {
        pass: 10,
        total: 10,
        passWithFilter: 10,
      },
    },
    plugins: [],
    vulnerabilitiesDataGridRef: mockRef,
    vulnerabilitiesDataGridFilterModel: mockFilterModel,
    setVulnerabilitiesDataGridFilterModel: mockSetFilterModel,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?evalId=test-eval-123' },
    });
  });

  it('should correctly display 0.00% attack success rate', () => {
    renderWithProviders(<TestSuites {...defaultProps} />);

    // The text "0.00%" appears multiple times in DataGrid cells
    // Using getAllByText to handle multiple matches
    const attackSuccessRateElements = screen.getAllByText((_content, element) => {
      return Boolean(element && element.textContent?.includes('0.00%'));
    });
    expect(attackSuccessRateElements.length).toBeGreaterThan(0);
    expect(attackSuccessRateElements[0]).toBeInTheDocument();
  });
});

describe('TestSuites Component CSV Export - Special Characters', () => {
  const mockNavigate = vi.fn();

  const evalId = 'test-eval-123';
  const plugins: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    global.URL.createObjectURL = vi.fn(() => 'blob:test');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should correctly escape special characters in CSV export', () => {
    const specialDescription = 'This is a test description with "quotes", commas, and\nnewlines.';

    const categoryStatsWithSpecialChars = {
      'harmful:hate': {
        pass: 8,
        total: 10,
        passWithFilter: 9,
        description: specialDescription,
      },
    };

    const mockRef = { current: null } as React.RefObject<HTMLDivElement>;
    const mockFilterModel = { items: [] } as any;
    const mockSetFilterModel = vi.fn();

    renderWithProviders(
      <TestSuites
        evalId={evalId}
        categoryStats={categoryStatsWithSpecialChars}
        plugins={plugins}
        vulnerabilitiesDataGridRef={mockRef}
        vulnerabilitiesDataGridFilterModel={mockFilterModel}
        setVulnerabilitiesDataGridFilterModel={mockSetFilterModel}
      />,
    );

    const exportButton = screen.getByText('Export vulnerabilities to CSV');
    fireEvent.click(exportButton);

    const mockCreateObjectURL = vi.mocked(URL.createObjectURL);
    expect(mockCreateObjectURL).toHaveBeenCalled();

    const blob = mockCreateObjectURL.mock.calls[0][0] as Blob;

    const reader = new FileReader();
    reader.onload = () => {
      const csvContent = reader.result as string;

      const expectedEscapedDescription = `"This is a test description with ""quotes"", commas, and\nnewlines."`;
      expect(csvContent).toContain(expectedEscapedDescription);
    };
    reader.readAsText(blob);
  });
});
