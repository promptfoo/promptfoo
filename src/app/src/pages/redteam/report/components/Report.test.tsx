import { fireEvent, render, screen } from '@testing-library/react';
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
