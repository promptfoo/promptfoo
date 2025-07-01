import { render, screen, fireEvent } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import TestSuites from './TestSuites';

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
}));

vi.mock('@promptfoo/redteam/constants', () => ({
  categoryAliases: {
    'test-plugin': 'Test Plugin',
    'plugin-with-special-chars~!@#$%^&*()_+=-`': 'Plugin With Special Chars',
    'test-plugin-na': 'Test Plugin NA',
  },
  displayNameOverrides: {},
  riskCategories: {
    'test-category': ['test-plugin', 'plugin-with-special-chars~!@#$%^&*()_+=-`', 'test-plugin-na'],
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
  },
}));

vi.mock('@promptfoo/redteam/sharedFrontend', () => ({
  getRiskCategorySeverityMap: vi.fn(() => ({
    'test-plugin': 'High',
    'plugin-with-special-chars~!@#$%^&*()_+=-`': 'High',
    'test-plugin-na': 'Low',
  })),
}));

describe('TestSuites Component', () => {
  const mockNavigate = vi.fn();

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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?evalId=test-eval-123' },
    });
  });

  it('should render an empty table body when categoryStats is empty', () => {
    render(<TestSuites {...defaultProps} categoryStats={{}} />);
    const tableElements = screen.getAllByRole('rowgroup');
    const tableBody = tableElements.find((el) => el.tagName.toLowerCase() === 'tbody');
    expect(tableBody?.children.length).toBe(0);
  });
});

describe('TestSuites Component Navigation', () => {
  const mockNavigate = vi.fn();

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
      '/eval/?evalId=test-eval-123&search=metadata%3DpluginId%3Aplugin-with-special-chars~!%40%23%24%25%5E%26*()_%2B%3D-%60',
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
    const viewLogsButton = viewLogsButtons[0];

    fireEvent.click(viewLogsButton);

    expect(mockNavigate).toHaveBeenCalledWith(
      '/eval/?evalId=test-eval-123&search=metadata%3DpluginId%3Aplugin-with-special-chars~!%40%23%24%25%5E%26*()_%2B%3D-%60',
    );
  });
});

describe('TestSuites Component Navigation with Missing EvalId', () => {
  const mockNavigate = vi.fn();

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

    expect(mockNavigate).toHaveBeenCalledWith(
      '/eval/?evalId=null&search=metadata%3DpluginId%3Atest-plugin',
    );
  });
});

describe('TestSuites Component Filtering', () => {
  const mockNavigate = vi.fn();

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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?evalId=test-eval-123' },
    });
  });

  it('should filter out subcategories with a pass rate of N/A', () => {
    render(<TestSuites {...defaultProps} />);
    const tableRows = screen.getAllByRole('row');

    expect(tableRows.length).toBe(2);
  });
});
