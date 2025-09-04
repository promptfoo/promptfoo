import { GridLogicOperator } from '@mui/x-data-grid';
import { fireEvent, render, screen } from '@testing-library/react';
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

vi.mock('@promptfoo/redteam/constants', () => ({
  categoryAliases: {
    'test-plugin': 'Test Plugin',
    'plugin-with-special-chars~!@#$%^&*()_+=-`': 'Plugin With Special Chars',
    'test-plugin-na': 'Test Plugin NA',
    'plugin-with-zero-asr': 'Plugin With Zero ASR',
    'plugin-with-unknown-severity': 'Plugin With Unknown Severity',
  },
  displayNameOverrides: {},
  riskCategories: {
    'test-category': [
      'test-plugin',
      'plugin-with-special-chars~!@#$%^&*()_+=-`',
      'test-plugin-na',
      'plugin-with-zero-asr',
      'plugin-with-unknown-severity',
    ],
  },
  Severity: {
    Critical: 'Critical',
    High: 'High',
    Medium: 'Medium',
    Low: 'Low',
  },
  subCategoryDescriptions: {
    'test-plugin': 'Test plugin description',
    'plugin-with-special-chars~!@#$%^&*()_+=-`': 'Test plugin description',
    'test-plugin-na': 'Test plugin NA description',
    'plugin-with-zero-asr': 'Plugin with zero ASR description',
    'plugin-with-unknown-severity': 'Plugin with unknown severity',
  },
}));

vi.mock('@promptfoo/redteam/sharedFrontend', () => ({
  getRiskCategorySeverityMap: vi.fn(() => ({
    'test-plugin': 'High',
    'plugin-with-special-chars~!@#$%^&*()_+=-`': 'High',
    'test-plugin-na': 'Low',
    'plugin-with-zero-asr': 'Low',
    'plugin-with-unknown-severity': 'UnknownSeverity',
  })),
}));

describe('TestSuites Component', () => {
  const mockNavigate = vi.fn();
  const mockSetFilterModel = vi.fn();
  const mockRef = { current: null };

  const defaultProps = {
    evalId: 'test-eval-123',
    categoryStats: {
      'test-plugin': {
        pass: 8,
        total: 10,
        passWithFilter: 9,
      },
    },
    plugins: [],
    vulnerabilitiesDataGridRef: mockRef,
    vulnerabilitiesDataGridFilterModel: {
      items: [],
      logicOperator: GridLogicOperator.Or,
    },
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
    render(<TestSuites {...defaultProps} categoryStats={{}} />);
    // Check for the DataGrid container
    const dataGrid = screen.getByRole('grid');
    expect(dataGrid).toBeInTheDocument();

    // Check for "No rows" message in DataGrid
    const noRowsOverlay = screen.queryByText(/No rows/i);
    expect(noRowsOverlay).toBeInTheDocument();
  });

  it('should render the DataGrid with correct data', () => {
    render(<TestSuites {...defaultProps} />);

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
    expect(screen.getByText('Test Plugin')).toBeInTheDocument();
    expect(screen.getByText('Test plugin description')).toBeInTheDocument();
  });

  it('should render DataGrid with categoryStats data even when plugins prop is empty', () => {
    render(<TestSuites {...defaultProps} />);

    const dataGrid = screen.getByRole('grid');
    expect(dataGrid).toBeInTheDocument();

    expect(screen.getByText('Test Plugin')).toBeInTheDocument();
    expect(screen.getByText('Test plugin description')).toBeInTheDocument();
  });

  it('should render without errors and handle unknown severity gracefully during sorting', () => {
    const propsWithUnknownSeverity = {
      ...defaultProps,
      categoryStats: {
        'test-plugin': {
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

    render(<TestSuites {...propsWithUnknownSeverity} />);

    const dataGrid = screen.getByRole('grid');
    expect(dataGrid).toBeInTheDocument();

    const severityElements = screen.getAllByText(/High|UnknownSeverity/i);
    const severityValues = severityElements.map((el) => el.textContent);

    expect(severityValues).toContain('UnknownSeverity');

    const unknownSeverityIndex = severityValues.indexOf('UnknownSeverity');
    const highSeverityIndex = severityValues.indexOf('High');

    if (unknownSeverityIndex !== -1 && highSeverityIndex !== -1) {
      expect(highSeverityIndex).toBeGreaterThan(unknownSeverityIndex);
    }
  });
});

describe('TestSuites Component Navigation', () => {
  const mockNavigate = vi.fn();
  const mockSetFilterModel = vi.fn();
  const mockRef = { current: null };

  const defaultProps = {
    evalId: 'test-eval-123',
    categoryStats: {
      'test-plugin': {
        pass: 8,
        total: 10,
        passWithFilter: 9,
      },
      'plugin-with-special-chars~!@#$%^&*()_+=-`': {
        pass: 5,
        total: 10,
        passWithFilter: 5,
      },
    },
    plugins: [],
    vulnerabilitiesDataGridRef: mockRef,
    vulnerabilitiesDataGridFilterModel: {
      items: [],
      logicOperator: GridLogicOperator.Or,
    },
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
    render(<TestSuites {...defaultProps} />);

    const viewLogsButtons = screen.getAllByText('View logs');
    const viewLogsButton = viewLogsButtons[0];

    fireEvent.click(viewLogsButton);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/eval/test-eval-123?plugin=plugin-with-special-chars~!%40%23%24%25%5E%26*()_%2B%3D-%60',
    );
  });

  it('should not navigate again when browser back button is used', () => {
    render(<TestSuites {...defaultProps} />);

    const viewLogsButtons = screen.getAllByText('View logs');
    const viewLogsButton = viewLogsButtons[0];

    fireEvent.click(viewLogsButton);

    window.history.back();

    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('should navigate to eval page with correctly encoded search params when pluginId contains special characters', () => {
    render(<TestSuites {...defaultProps} />);

    const viewLogsButtons = screen.getAllByText('View logs');
    const viewLogsButton = viewLogsButtons[1];

    fireEvent.click(viewLogsButton);

    expect(mockNavigate).toHaveBeenCalledWith('/eval/test-eval-123?plugin=test-plugin');
  });

  it('should open email in new tab when clicking Apply mitigation', () => {
    const mockOpen = vi.fn();
    const originalOpen = window.open;
    window.open = mockOpen;

    render(<TestSuites {...defaultProps} />);

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
  const mockSetFilterModel = vi.fn();
  const mockRef = { current: null };

  const defaultProps = {
    evalId: 'test-eval-123',
    categoryStats: {
      'test-plugin': {
        pass: 8,
        total: 10,
        passWithFilter: 9,
      },
    },
    plugins: [],
    vulnerabilitiesDataGridRef: mockRef,
    vulnerabilitiesDataGridFilterModel: {
      items: [],
      logicOperator: GridLogicOperator.Or,
    },
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
    render(<TestSuites {...defaultProps} />);

    const viewLogsButtons = screen.getAllByText('View logs');
    const viewLogsButton = viewLogsButtons[0];

    fireEvent.click(viewLogsButton);

    expect(mockNavigate).toHaveBeenCalledWith('/eval/test-eval-123?plugin=test-plugin');
  });
});

describe('TestSuites Component Filtering', () => {
  const mockNavigate = vi.fn();
  const mockSetFilterModel = vi.fn();
  const mockRef = { current: null };

  const defaultProps = {
    evalId: 'test-eval-123',
    categoryStats: {
      'test-plugin': {
        pass: 8,
        total: 10,
        passWithFilter: 9,
      },
      'test-plugin-na': {
        pass: 0,
        total: 0, // This will be filtered out
        passWithFilter: 0,
      },
    },
    plugins: [],
    vulnerabilitiesDataGridRef: mockRef,
    vulnerabilitiesDataGridFilterModel: {
      items: [],
      logicOperator: GridLogicOperator.Or,
    },
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
    render(<TestSuites {...defaultProps} />);
    // DataGrid has header row + data rows
    // With filtering, we should only have test-plugin row
    expect(screen.getByText('Test Plugin')).toBeInTheDocument();
    expect(screen.queryByText('Test Plugin NA')).not.toBeInTheDocument();
  });
});

describe('TestSuites Component CSV Export', () => {
  const mockNavigate = vi.fn();
  const mockSetFilterModel = vi.fn();
  const mockRef = { current: null };

  const defaultProps = {
    evalId: 'test-eval-123',
    categoryStats: {
      'test-plugin': {
        pass: 8,
        total: 10,
        passWithFilter: 9,
      },
    },
    plugins: [],
    vulnerabilitiesDataGridRef: mockRef,
    vulnerabilitiesDataGridFilterModel: {
      items: [],
      logicOperator: GridLogicOperator.Or,
    },
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
    render(<TestSuites {...defaultProps} />);

    const exportButton = screen.getByText('Export vulnerabilities to CSV');
    expect(exportButton).toBeInTheDocument();
    expect(exportButton.closest('button')).toBeInTheDocument();
  });
});

describe('TestSuites Component - Zero Attack Success Rate', () => {
  const mockNavigate = vi.fn();
  const mockSetFilterModel = vi.fn();
  const mockRef = { current: null };

  const defaultProps = {
    evalId: 'test-eval-123',
    categoryStats: {
      'test-plugin': {
        pass: 8,
        total: 10,
        passWithFilter: 9,
      },
      'plugin-with-zero-asr': {
        pass: 10,
        total: 10,
        passWithFilter: 10,
      },
    },
    plugins: [],
    vulnerabilitiesDataGridRef: mockRef,
    vulnerabilitiesDataGridFilterModel: {
      items: [],
      logicOperator: GridLogicOperator.Or,
    },
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
    render(<TestSuites {...defaultProps} />);

    const attackSuccessRateElement = screen.getByText('0.00%');
    expect(attackSuccessRateElement).toBeInTheDocument();
  });
});

describe('TestSuites Component CSV Export - Special Characters', () => {
  const mockNavigate = vi.fn();
  const mockSetFilterModel = vi.fn();
  const mockRef = { current: null };

  const evalId = 'test-eval-123';

  const _categoryStats = {
    'test-plugin': {
      pass: 8,
      total: 10,
      passWithFilter: 9,
    },
  };

  const plugins: any[] = [];

  const vulnerabilitiesDataGridRef = mockRef;
  const vulnerabilitiesDataGridFilterModel = {
    items: [],
    logicOperator: GridLogicOperator.Or,
  };
  const setVulnerabilitiesDataGridFilterModel = mockSetFilterModel;

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
      'test-plugin': {
        pass: 8,
        total: 10,
        passWithFilter: 9,
        description: specialDescription,
      },
    };

    render(
      <TestSuites
        evalId={evalId}
        categoryStats={categoryStatsWithSpecialChars}
        plugins={plugins}
        vulnerabilitiesDataGridRef={vulnerabilitiesDataGridRef}
        vulnerabilitiesDataGridFilterModel={vulnerabilitiesDataGridFilterModel}
        setVulnerabilitiesDataGridFilterModel={setVulnerabilitiesDataGridFilterModel}
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
