import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UpdateBanner from './UpdateBanner';
import { useVersionCheck } from '@app/hooks/useVersionCheck';
import { ThemeProvider, createTheme, Theme } from '@mui/material/styles';

vi.mock('@app/hooks/useVersionCheck');

describe('UpdateBanner', () => {
  const mockUseVersionCheck = vi.mocked(useVersionCheck);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the banner with correct info when an update with a primary command is available', () => {
    const mockVersionCheckResult: ReturnType<typeof useVersionCheck> = {
      versionInfo: {
        updateAvailable: true,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        updateCommands: {
          primary: 'npm i -g promptfoo@latest',
          alternative: null,
        },
        commandType: 'npm',
        isNpx: false,
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    };
    mockUseVersionCheck.mockReturnValue(mockVersionCheckResult);

    render(<UpdateBanner />);

    expect(screen.getByText(/Update available: v2.0.0/i)).toBeInTheDocument();
    expect(screen.getByText(/\(current: v1.9.0\)/i)).toBeInTheDocument();

    const releaseNotesLink = screen.getByRole('link', { name: /Release Notes/i });
    expect(releaseNotesLink).toBeInTheDocument();
    expect(releaseNotesLink).toHaveAttribute(
      'href',
      'https://github.com/promptfoo/promptfoo/releases/latest',
    );

    const copyCommandButton = screen.getByRole('button', { name: /Copy Update Command/i });
    expect(copyCommandButton).toBeInTheDocument();
    expect(copyCommandButton).toHaveAttribute('title', 'npm i -g promptfoo@latest');
  });

  it('should copy the update command to the clipboard and display a snackbar when the copy command button is clicked and the clipboard API succeeds', async () => {
    const mockVersionCheckResult: ReturnType<typeof useVersionCheck> = {
      versionInfo: {
        updateAvailable: true,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        updateCommands: {
          primary: 'npm i -g promptfoo@latest',
          alternative: null,
        },
        commandType: 'npm',
        isNpx: false,
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    };
    mockUseVersionCheck.mockReturnValue(mockVersionCheckResult);

    const mockWriteText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: mockWriteText,
      },
    });

    render(<UpdateBanner />);

    const copyCommandButton = screen.getByRole('button', { name: /Copy Update Command/i });

    await fireEvent.click(copyCommandButton);

    expect(mockWriteText).toHaveBeenCalledWith('npm i -g promptfoo@latest');

    expect(await screen.findByText(/Update command copied to clipboard/i)).toBeVisible();
  });

  it('should render correctly in both dark and light modes', () => {
    const mockVersionCheckResult: ReturnType<typeof useVersionCheck> = {
      versionInfo: {
        updateAvailable: true,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        updateCommands: {
          primary: 'npm i -g promptfoo@latest',
          alternative: null,
        },
        commandType: 'npm',
        isNpx: false,
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    };
    mockUseVersionCheck.mockReturnValue(mockVersionCheckResult);

    const lightTheme = createTheme({ palette: { mode: 'light' } });
    const darkTheme = createTheme({ palette: { mode: 'dark' } });

    const renderWithTheme = (theme: Theme) =>
      render(
        <ThemeProvider theme={theme}>
          <UpdateBanner />
        </ThemeProvider>,
      );

    renderWithTheme(lightTheme);
    expect(screen.getByText(/Update available: v2.0.0/i)).toBeVisible();

    cleanup();

    renderWithTheme(darkTheme);
    expect(screen.getByText(/Update available: v2.0.0/i)).toBeVisible();
  });

  it('should render the copy command button with default text when commandType is undefined', () => {
    const mockVersionCheckResult: ReturnType<typeof useVersionCheck> = {
      versionInfo: {
        updateAvailable: true,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        updateCommands: {
          primary: 'npm i -g promptfoo@latest',
          alternative: null,
        },
        commandType: undefined,
        isNpx: false,
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    };
    mockUseVersionCheck.mockReturnValue(mockVersionCheckResult);

    render(<UpdateBanner />);

    const copyCommandButton = screen.getByRole('button', { name: /Copy Update Command/i });
    expect(copyCommandButton).toBeInTheDocument();
  });

  it('should render with default command text when commandType is null', () => {
    const mockVersionCheckResult: ReturnType<typeof useVersionCheck> = {
      versionInfo: {
        updateAvailable: true,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        updateCommands: {
          primary: 'npm i -g promptfoo@latest',
          alternative: null,
        },
        commandType: undefined,
        isNpx: false,
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    };
    mockUseVersionCheck.mockReturnValue(mockVersionCheckResult);

    render(<UpdateBanner />);

    const copyCommandButton = screen.getByRole('button', { name: /Copy Update Command/i });
    expect(copyCommandButton).toBeInTheDocument();
  });
});
