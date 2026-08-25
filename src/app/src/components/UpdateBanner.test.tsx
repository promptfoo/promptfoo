import { useVersionCheck } from '@app/hooks/useVersionCheck';
import { mockClipboard, mockDocumentExecCommand } from '@app/tests/browserMocks';
import { renderWithProviders } from '@app/utils/testutils';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UpdateBanner from './UpdateBanner';

vi.mock('@app/hooks/useVersionCheck');

describe('UpdateBanner', () => {
  const mockUseVersionCheck = vi.mocked(useVersionCheck);

  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.style.removeProperty('--update-banner-height');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.documentElement.style.removeProperty('--update-banner-height');
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
    const user = userEvent.setup();
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
    mockClipboard({ writeText: mockWriteText as Clipboard['writeText'] });

    renderWithProviders(<UpdateBanner />);

    const copyCommandButton = screen.getByRole('button', { name: /Copy Update Command/i });

    await user.click(copyCommandButton);

    expect(mockWriteText).toHaveBeenCalledWith('npm i -g promptfoo@latest');

    // After copying, the Check icon should be shown (Lucide icons have lucide-check class)
    await waitFor(() => {
      const checkIcon = copyCommandButton.querySelector('.lucide-check');
      expect(checkIcon).toBeInTheDocument();
    });
  });

  it('should announce a successful copy to assistive technology', async () => {
    const user = userEvent.setup();
    mockUseVersionCheck.mockReturnValue({
      versionInfo: {
        updateAvailable: true,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        updateCommands: { primary: 'npm i -g promptfoo@latest', alternative: null },
        commandType: 'npm',
        isNpx: false,
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    });
    mockClipboard({ writeText: vi.fn().mockResolvedValue(undefined) as Clipboard['writeText'] });

    renderWithProviders(<UpdateBanner />);

    expect(screen.queryByText(/copied to clipboard/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Copy Update Command/i }));

    // The icon swap alone conveys nothing to a screen reader, so both the accessible name and
    // the polite live region must reflect the success.
    await waitFor(() => {
      expect(screen.getByText(/Update command copied to clipboard/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /^Copied$/i })).toBeInTheDocument();
  });

  it('should not report copy success when the clipboard fallback rejects the command', async () => {
    const user = userEvent.setup();
    mockUseVersionCheck.mockReturnValue({
      versionInfo: {
        updateAvailable: true,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        updateCommands: { primary: 'npm i -g promptfoo@latest', alternative: null },
        commandType: 'npm',
        isNpx: false,
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    });
    mockClipboard({ writeText: vi.fn().mockRejectedValue(new Error('Clipboard unavailable')) });
    const execCommand = mockDocumentExecCommand().mockReturnValue(false);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    renderWithProviders(<UpdateBanner />);
    await user.click(screen.getByRole('button', { name: /Copy Update Command/i }));

    await waitFor(() => {
      expect(execCommand).toHaveBeenCalledWith('copy');
      expect(alertSpy).toHaveBeenCalledWith('Failed to copy. Command: npm i -g promptfoo@latest');
    });
    expect(screen.queryByRole('button', { name: /^Copied$/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/copied to clipboard/i)).not.toBeInTheDocument();
  });

  it('should announce update information politely without including action controls', () => {
    mockUseVersionCheck.mockReturnValue({
      versionInfo: {
        updateAvailable: true,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        updateCommands: { primary: 'npm i -g promptfoo@latest', alternative: null },
        commandType: 'npm',
        isNpx: false,
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    });

    renderWithProviders(<UpdateBanner />);

    // An available update is informational; role="alert" would interrupt screen readers.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: /Update available/i })).toBeInTheDocument();

    const updateStatus = screen.getByRole('status');
    expect(updateStatus).toHaveAttribute('aria-live', 'polite');
    expect(updateStatus).toHaveAttribute('aria-atomic', 'true');
    expect(updateStatus).toHaveTextContent(/Update available: v2\.0\.0/i);
    expect(updateStatus).toHaveTextContent(/\(current: v1\.9\.0\)/i);
    expect(updateStatus).not.toContainElement(
      screen.getByRole('button', { name: /Copy Update Command/i }),
    );
  });

  it('should tell derived official Docker image users to rebuild before redeploying', () => {
    mockUseVersionCheck.mockReturnValue({
      versionInfo: {
        updateAvailable: true,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        updateCommands: {
          primary: 'docker pull ghcr.io/promptfoo/promptfoo:latest',
          alternative: null,
        },
        commandType: 'docker',
        isNpx: false,
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    });

    renderWithProviders(<UpdateBanner />);

    expect(screen.getByText(/If this is a derived image/i)).toHaveTextContent(
      /update its Promptfoo base and rebuild before redeploying/i,
    );
    expect(screen.getByRole('button', { name: /Copy Docker Command/i })).toHaveAttribute(
      'title',
      'docker pull ghcr.io/promptfoo/promptfoo:latest',
    );
  });

  it('should tell custom-container users to rebuild instead of offering a command', () => {
    mockUseVersionCheck.mockReturnValue({
      versionInfo: {
        updateAvailable: true,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        // /api/version returns an empty primary command for custom images: there is no
        // command the user can run, so the banner must render rebuild guidance instead.
        updateCommands: { primary: '', alternative: null, isCustomContainer: true },
        commandType: 'npm',
        isNpx: false,
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    });

    renderWithProviders(<UpdateBanner />);

    expect(
      screen.getByText(/Update the Promptfoo source, dependency, or parent image/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy/i })).not.toBeInTheDocument();
  });

  it("should make the don't remind me action clickable", async () => {
    const user = userEvent.setup();
    const dismiss = vi.fn();
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
      dismiss,
    };
    mockUseVersionCheck.mockReturnValue(mockVersionCheckResult);

    renderWithProviders(<UpdateBanner />);

    const dismissButton = screen.getByRole('button', {
      name: "Don't remind me of this version",
    });

    expect(dismissButton).toHaveClass('cursor-pointer');

    await user.click(dismissButton);

    expect(dismiss).toHaveBeenCalledTimes(1);
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

  it('should measure the banner when it becomes visible after loading', async () => {
    const hiddenState: ReturnType<typeof useVersionCheck> = {
      versionInfo: null,
      loading: true,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    };
    const visibleState: ReturnType<typeof useVersionCheck> = {
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
    mockUseVersionCheck.mockReturnValue(hiddenState);

    const { rerender } = renderWithProviders(<UpdateBanner />);

    expect(document.documentElement.style.getPropertyValue('--update-banner-height')).toBe('');

    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(48);
    mockUseVersionCheck.mockReturnValue(visibleState);
    rerender(<UpdateBanner />);

    await waitFor(() => {
      expect(document.documentElement.style.getPropertyValue('--update-banner-height')).toBe(
        '48px',
      );
    });
  });
});
