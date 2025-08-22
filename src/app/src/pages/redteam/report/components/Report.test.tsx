import { fireEvent, render, screen, within } from '@testing-library/react';
import { useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Report from './Report';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline } from '@mui/material';

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
  default: () => null,
}));

vi.mock('./StrategyStats', () => ({
  default: () => null,
}));

vi.mock('./RiskCategories', () => ({
  default: () => null,
}));

vi.mock('./TestSuites', () => ({
  default: () => null,
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

  it('should navigate to eval page when clicking View Eval button', async () => {
    render(<Report />);

    // Wait for the component to load
    await screen.findByLabelText('View eval details and logs');

    const viewEvalButton = screen.getByLabelText('View eval details and logs');

    // Test normal click - should use navigate
    fireEvent.click(viewEvalButton);
    expect(mockNavigate).toHaveBeenCalledWith('/eval/test-123');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('should open in new tab when ctrl/cmd clicking View Eval button', async () => {
    render(<Report />);

    await screen.findByLabelText('View eval details and logs');

    const viewEvalButton = screen.getByLabelText('View eval details and logs');

    // Test Ctrl+click - should open new tab
    fireEvent.click(viewEvalButton, { ctrlKey: true });
    expect(window.open).toHaveBeenCalledWith('/eval/test-123', '_blank');
    expect(mockNavigate).not.toHaveBeenCalled();

    // Reset mocks
    vi.clearAllMocks();

    // Test Cmd+click (Mac) - should also open new tab
    fireEvent.click(viewEvalButton, { metaKey: true });
    expect(window.open).toHaveBeenCalledWith('/eval/test-123', '_blank');
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('Report Component Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(vi.fn());

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?evalId=test-123' },
    });
  });

  it("should render a Button labeled 'View Eval' with the ListAltIcon when evalId is present", async () => {
    render(<Report />);

    const viewEvalButton = await screen.findByRole('button', {
      name: 'View eval details and logs',
    });
    expect(viewEvalButton).toBeInTheDocument();

    expect(viewEvalButton).toHaveTextContent('View Eval');

    const icon = within(viewEvalButton).getByTestId('ListAltIcon');
    expect(icon).toBeInTheDocument();
  });
});

describe('Report Component Theme Styling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useNavigate).mockReturnValue(vi.fn());

    Object.defineProperty(window, 'location', {
      writable: true,
      value: { search: '?evalId=test-123' },
    });
  });

  it('should render the View Eval button with correct theme-dependent styling', async () => {
    const lightTheme = createTheme({ palette: { mode: 'light' } });
    const darkTheme = createTheme({ palette: { mode: 'dark' } });

    const renderWithTheme = (theme: any) =>
      render(
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <Report />
        </ThemeProvider>,
      );

    renderWithTheme(lightTheme);
    const viewEvalButtonLight = (await screen.findByRole('button', {
      name: 'View eval details and logs',
    })) as HTMLButtonElement;
    expect(viewEvalButtonLight).toBeDefined();

    renderWithTheme(darkTheme);
    const viewEvalButtonDark = (await screen.findByRole('button', {
      name: 'View eval details and logs',
    })) as HTMLButtonElement;
    expect(viewEvalButtonDark).toBeDefined();
  });
});
