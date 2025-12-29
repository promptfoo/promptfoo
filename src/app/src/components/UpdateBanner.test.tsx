import { useVersionCheck } from '@app/hooks/useVersionCheck';
import { renderWithProviders } from '@app/utils/testutils';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import UpdateBanner from './UpdateBanner';

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

    renderWithProviders(<UpdateBanner />);

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

  it('should copy the update command to the clipboard and show check icon when the copy command button is clicked', async () => {
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

    renderWithProviders(<UpdateBanner />);

    const copyCommandButton = screen.getByRole('button', { name: /Copy Update Command/i });

    await fireEvent.click(copyCommandButton);

    expect(mockWriteText).toHaveBeenCalledWith('npm i -g promptfoo@latest');

    // After copying, the Check icon should be shown (Lucide icons have lucide-check class)
    await waitFor(() => {
      const checkIcon = copyCommandButton.querySelector('.lucide-check');
      expect(checkIcon).toBeInTheDocument();
    });
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

    // Light mode
    document.documentElement.removeAttribute('data-theme');
    renderWithProviders(<UpdateBanner />);
    expect(screen.getByText(/Update available: v2.0.0/i)).toBeVisible();

    cleanup();

    // Dark mode
    document.documentElement.setAttribute('data-theme', 'dark');
    renderWithProviders(<UpdateBanner />);
    expect(screen.getByText(/Update available: v2.0.0/i)).toBeVisible();
    document.documentElement.removeAttribute('data-theme');
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

    renderWithProviders(<UpdateBanner />);

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

    renderWithProviders(<UpdateBanner />);

    const copyCommandButton = screen.getByRole('button', { name: /Copy Update Command/i });
    expect(copyCommandButton).toBeInTheDocument();
  });
});
