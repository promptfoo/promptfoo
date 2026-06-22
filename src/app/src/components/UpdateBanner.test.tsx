import { useVersionCheck } from '@app/hooks/useVersionCheck';
import { mockClipboard } from '@app/tests/browserMocks';
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

  it('should prioritize the Node.js runtime notice over an ordinary update', async () => {
    const user = userEvent.setup();
    const dismiss = vi.fn();
    const mockVersionCheckResult: ReturnType<typeof useVersionCheck> = {
      versionInfo: {
        updateAvailable: true,
        updateBlockedByRuntime: false,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        runtimeNotice: {
          id: 'node20-removal-2026-07-30',
          kind: 'runtime_deprecation',
          runtime: 'node',
          currentVersion: 'v20.20.2',
          currentMajor: 20,
          removalDate: '2026-07-30',
          minimumVersion: '22.22.0',
          recommendedVersion: '24 LTS',
          documentationUrl: 'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
          reminderIntervalDays: 7,
        },
        updateCommands: {
          primary: 'npm i -g promptfoo@latest',
          alternative: null,
        },
        commandType: 'npm',
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss,
    };
    mockUseVersionCheck.mockReturnValue(mockVersionCheckResult);

    renderWithProviders(<UpdateBanner />);

    expect(screen.getByText(/Node.js 20 support ends July 30, 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/built-in SQLite/i)).toBeInTheDocument();
    expect(screen.queryByText(/Update available: v2.0.0/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy Update Command/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View upgrade guide/i })).toHaveAttribute(
      'href',
      'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
    );

    await user.click(screen.getByRole('button', { name: /Remind me/i }));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });

  it('should not offer an incompatible latest update when the runtime blocks it', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-01T00:00:00.000Z'));
    mockUseVersionCheck.mockReturnValue({
      versionInfo: {
        updateAvailable: true,
        updateBlockedByRuntime: true,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        runtimeNotice: {
          id: 'node20-removal-2026-07-30',
          kind: 'runtime_deprecation',
          runtime: 'node',
          currentVersion: 'v20.20.2',
          currentMajor: 20,
          removalDate: '2026-07-30',
          minimumVersion: '22.22.0',
          recommendedVersion: '24 LTS',
          documentationUrl: 'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
          reminderIntervalDays: 1,
        },
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    });

    renderWithProviders(<UpdateBanner />);

    expect(screen.getByText(/Node.js 20 support ended July 30, 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(/Update available/i)).not.toBeInTheDocument();
  });

  it('should report ended support for a post-cutoff Docker deployment', () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-08-01T00:00:00.000Z'));
    mockUseVersionCheck.mockReturnValue({
      versionInfo: {
        updateAvailable: true,
        updateBlockedByRuntime: false,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        commandType: 'docker',
        runtimeNotice: {
          id: 'node20-removal-2026-07-30',
          kind: 'runtime_deprecation',
          runtime: 'node',
          currentVersion: 'v20.20.2',
          currentMajor: 20,
          removalDate: '2026-07-30',
          minimumVersion: '22.22.0',
          recommendedVersion: '24 LTS',
          documentationUrl: 'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
          reminderIntervalDays: 1,
        },
        updateCommands: {
          primary: 'docker pull promptfoo/promptfoo:latest',
          alternative: null,
        },
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    });

    renderWithProviders(<UpdateBanner />);

    expect(screen.getByText(/Node.js 20 support ended July 30, 2026/i)).toBeInTheDocument();
  });

  it('should show a compatible promptfoo update while the runtime notice is snoozed', () => {
    mockUseVersionCheck.mockReturnValue({
      versionInfo: {
        updateAvailable: true,
        updateBlockedByRuntime: false,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        runtimeNotice: {
          id: 'node20-removal-2026-07-30',
          kind: 'runtime_deprecation',
          runtime: 'node',
          currentVersion: 'v20.20.2',
          currentMajor: 20,
          removalDate: '2026-07-30',
          minimumVersion: '22.22.0',
          recommendedVersion: '24 LTS',
          documentationUrl: 'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
          reminderIntervalDays: 7,
        },
        updateCommands: {
          primary: 'npm i -g promptfoo@latest',
          alternative: null,
        },
        commandType: 'npm',
      },
      loading: false,
      error: null,
      dismissed: true,
      dismiss: vi.fn(),
      runtimeNoticeDismissed: true,
      updateDismissed: false,
    });

    renderWithProviders(<UpdateBanner />);

    expect(screen.getByText(/Update available: v2.0.0/i)).toBeInTheDocument();
    expect(screen.queryByText(/Node.js 20 support ends/i)).not.toBeInTheDocument();
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
