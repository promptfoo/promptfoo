import { GridFilterModel, GridLogicOperator } from '@mui/x-data-grid';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Report from './Report';

// Mock dependencies
vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
}));

vi.mock('@app/hooks/usePageMeta', () => ({
  usePageMeta: vi.fn(),
}));

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: () => ({
    recordEvent: vi.fn(),
  }),
}));

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(() =>
    Promise.resolve({
      json: () =>
        Promise.resolve({
          data: {
            config: {
              redteam: {
                plugins: [],
              },
              description: 'Test eval',
              providers: [],
            },
            results: {
              results: [],
            },
            prompts: [],
            createdAt: new Date().toISOString(),
            version: 4,
          },
        }),
    }),
  ),
}));

// Mock all child components to simplify testing
vi.mock('./EnterpriseBanner', () => ({
  default: () => null,
}));

vi.mock('./Overview', () => ({
  default: vi.fn(({ vulnerabilitiesDataGridRef }: any) => null),
}));

vi.mock('./StrategyStats', () => ({
  default: () => null,
}));

vi.mock('./RiskCategories', () => ({
  default: () => null,
}));

vi.mock('./TestSuites', () => ({
  default: vi.fn(({ vulnerabilitiesDataGridRef }: any) => null),
}));

vi.mock('./FrameworkCompliance', () => ({
  default: () => null,
}));

vi.mock('./ReportDownloadButton', () => ({
  default: () => null,
}));

vi.mock('./ReportSettingsDialogButton', () => ({
  default: () => null,
}));

vi.mock('./ToolsDialog', () => ({
  default: () => null,
}));

vi.mock('@app/components/EnterpriseBanner', () => ({
  default: () => null,
}));

import Overview from './Overview';
import TestSuites from './TestSuites';

describe('Report Component Navigation', () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(mockNavigate);

    // Mock window.location.search
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?evalId=test-123' },
    });

    // Mock window.open
    global.window.open = vi.fn();
  });

  it('should navigate to eval page when clicking view all logs button', async () => {
    render(<Report />);

    // Wait for the component to load
    await screen.findByLabelText('view all logs');

    const viewLogsButton = screen.getByLabelText('view all logs');

    // Test normal click - should use navigate
    fireEvent.click(viewLogsButton);
    expect(mockNavigate).toHaveBeenCalledWith('/eval/test-123');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('should open in new tab when ctrl/cmd clicking view all logs button', async () => {
    render(<Report />);

    await screen.findByLabelText('view all logs');

    const viewLogsButton = screen.getByLabelText('view all logs');

    // Test Ctrl+click - should open new tab
    fireEvent.click(viewLogsButton, { ctrlKey: true });
    expect(window.open).toHaveBeenCalledWith('/eval/test-123', '_blank');
    expect(mockNavigate).not.toHaveBeenCalled();

    // Reset mocks
    vi.clearAllMocks();

    // Test Cmd+click (Mac) - should also open new tab
    fireEvent.click(viewLogsButton, { metaKey: true });
    expect(window.open).toHaveBeenCalledWith('/eval/test-123', '_blank');
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('Report Component DataGrid State', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(vi.fn());

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?evalId=test-123' },
    });
  });

  it('should initialize vulnerabilitiesDataGridFilterModel with an empty filter and pass props to Overview and TestSuites', async () => {
    render(<Report />);

    await waitFor(() => {
      expect(Overview).toHaveBeenCalled();
      expect(TestSuites).toHaveBeenCalled();
    });

    const testSuitesProps = vi.mocked(TestSuites).mock.calls[0][0];
    expect(testSuitesProps.vulnerabilitiesDataGridFilterModel).toEqual({
      items: [],
      logicOperator: GridLogicOperator.Or,
    });
    expect(testSuitesProps.vulnerabilitiesDataGridRef).toBeDefined();
    expect(testSuitesProps.vulnerabilitiesDataGridRef).toHaveProperty('current');
    expect(testSuitesProps.setVulnerabilitiesDataGridFilterModel).toBeInstanceOf(Function);

    const overviewProps = vi.mocked(Overview).mock.calls[0][0];
    expect(overviewProps.vulnerabilitiesDataGridRef).toBeDefined();
    expect(overviewProps.vulnerabilitiesDataGridRef).toHaveProperty('current');
    expect(overviewProps.setVulnerabilitiesDataGridFilterModel).toBeInstanceOf(Function);
  });

  it('should update vulnerabilitiesDataGridFilterModel when setVulnerabilitiesDataGridFilterModel is called, and the updated filter model should be passed to TestSuites', async () => {
    render(<Report />);

    await waitFor(() => {
      expect(TestSuites).toHaveBeenCalled();
    });

    const testSuitesProps = vi.mocked(TestSuites).mock.calls[0][0];
    const setVulnerabilitiesDataGridFilterModel =
      testSuitesProps.setVulnerabilitiesDataGridFilterModel;

    const newFilterModel: GridFilterModel = {
      items: [{ field: 'severity', operator: 'equals', value: 'high' }],
      logicOperator: GridLogicOperator.And,
    };

    setVulnerabilitiesDataGridFilterModel(newFilterModel);

    await waitFor(() => {
      expect(TestSuites).toHaveBeenCalledTimes(2);
    });

    const updatedTestSuitesProps = vi.mocked(TestSuites).mock.calls[1][0];
    expect(updatedTestSuitesProps.vulnerabilitiesDataGridFilterModel).toEqual(newFilterModel);
  });
});

describe('Report Component Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(vi.fn());

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?evalId=test-123' },
    });
  });

  it('should render without error when vulnerabilitiesDataGridRef.current is null', async () => {
    const { findByText } = render(<Report />);

    await waitFor(() => {
      expect(Overview).toHaveBeenCalled();
      expect(TestSuites).toHaveBeenCalled();
    });

    await findByText('LLM Risk Assessment');
  });
});
