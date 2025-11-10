import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { createAppTheme } from '@app/components/PageShell';
import FrameworkPluginResult from './FrameworkPluginResult';
import type { FrameworkPluginResultProps } from './FrameworkPluginResult';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const theme = createAppTheme(false);

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <ThemeProvider theme={theme}>
      <MemoryRouter>{component}</MemoryRouter>
    </ThemeProvider>,
  );
};

describe('FrameworkPluginResult', () => {
  const mockGetPluginASR = vi.fn();

  beforeEach(() => {
    mockNavigate.mockClear();
    mockGetPluginASR.mockReturnValue({ asr: 50, total: 100, failCount: 50 });
  });

  it('should navigate with correct filter JSON for "failed" plugin click', () => {
    const props: FrameworkPluginResultProps = {
      evalId: 'eval-123',
      plugin: 'harmful:child-exploitation',
      getPluginASR: mockGetPluginASR,
      type: 'failed',
    };

    renderWithProviders(<FrameworkPluginResult {...props} />);

    const pluginName = screen.getByText(/child exploitation/i);
    fireEvent.click(pluginName);

    expect(mockNavigate).toHaveBeenCalledWith(
      `/eval/eval-123?filter=${encodeURIComponent(
        JSON.stringify([
          {
            type: 'plugin',
            operator: 'equals',
            value: 'harmful:child-exploitation',
          },
        ]),
      )}&mode=failures`,
    );
  });

  it('should navigate to filter URL for "passed" plugin click', () => {
    mockGetPluginASR.mockReturnValue({ asr: 0, total: 100, failCount: 0 });

    const props: FrameworkPluginResultProps = {
      evalId: 'eval-456',
      plugin: 'pii',
      getPluginASR: mockGetPluginASR,
      type: 'passed',
    };

    renderWithProviders(<FrameworkPluginResult {...props} />);

    const pluginName = screen.getByText(/pii/i);
    fireEvent.click(pluginName);

    expect(mockNavigate).toHaveBeenCalledWith(
      `/eval/eval-456?filter=${encodeURIComponent(
        JSON.stringify([
          {
            type: 'plugin',
            operator: 'equals',
            value: 'pii',
          },
        ]),
      )}&mode=failures`,
    );
  });

  it('should URL-encode pluginId with special characters', () => {
    const props: FrameworkPluginResultProps = {
      evalId: 'eval-789',
      plugin: 'harmful:violent-crime',
      getPluginASR: mockGetPluginASR,
      type: 'failed',
    };

    renderWithProviders(<FrameworkPluginResult {...props} />);

    const pluginName = screen.getByText(/violent crime/i);
    fireEvent.click(pluginName);

    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining('/eval/eval-789?filter='),
    );
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining('&mode=failures'));

    const callArg = mockNavigate.mock.calls[0][0];
    expect(callArg).toContain(
      encodeURIComponent(
        JSON.stringify([
          {
            type: 'plugin',
            operator: 'equals',
            value: 'harmful:violent-crime',
          },
        ]),
      ),
    );
  });

  it('should correctly format and display extremely high ASR percentages', () => {
    mockGetPluginASR.mockReturnValue({ asr: 99.9, total: 1000, failCount: 999 });

    const props: FrameworkPluginResultProps = {
      evalId: 'eval-999',
      plugin: 'sql-injection',
      getPluginASR: mockGetPluginASR,
      type: 'failed',
    };

    renderWithProviders(<FrameworkPluginResult {...props} />);

    // The component uses formatASRForDisplay which should handle high percentages
    expect(screen.getByText(/99\.90%/)).toBeInTheDocument();
  });

  it('should not trigger navigation for "untested" plugin type', () => {
    const props: FrameworkPluginResultProps = {
      evalId: 'eval-untested',
      plugin: 'some-plugin',
      getPluginASR: mockGetPluginASR,
      type: 'untested',
    };

    renderWithProviders(<FrameworkPluginResult {...props} />);

    const pluginName = screen.getByText(/some-plugin/i);
    fireEvent.click(pluginName);

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
