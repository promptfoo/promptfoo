import { useTelemetry } from '@app/hooks/useTelemetry';
import { useVersionCheck } from '@app/hooks/useVersionCheck';
import { mockClipboard, mockDocumentExecCommand } from '@app/tests/browserMocks';
import { renderWithProviders } from '@app/utils/testutils';
import { cleanup, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UpdateBanner from './UpdateBanner';

vi.mock('@app/hooks/useTelemetry');
vi.mock('@app/hooks/useVersionCheck');

describe('UpdateBanner', () => {
  const mockRecordEvent = vi.fn();
  const mockUseTelemetry = vi.mocked(useTelemetry);
  const mockUseVersionCheck = vi.mocked(useVersionCheck);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-06-22T12:00:00.000Z'));
    mockUseTelemetry.mockReturnValue({
      identifyUser: vi.fn(),
      isInitialized: true,
      recordEvent: mockRecordEvent,
    });
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

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/Node.js 20 support ends July 30, 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/This Promptfoo server is running/i)).toHaveClass(
      'dark:text-amber-200',
    );
    expect(screen.queryByText(/Update available: v2.0.0/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy Update Command/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View upgrade guide/i })).toHaveAttribute(
      'href',
      'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
    );

    await user.click(screen.getByRole('button', { name: 'Remind me later' }));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(mockRecordEvent).toHaveBeenCalledWith(
      'feature_used',
      expect.objectContaining({
        action: 'remind_later',
        feature: 'runtime_compatibility_notice',
      }),
    );
  });

  it('should keep reminder copy truthful at the final-phase boundary', () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-07-16T00:00:00.000Z'));
    mockUseVersionCheck.mockReturnValue({
      versionInfo: {
        updateAvailable: false,
        latestVersion: '1.9.0',
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
        },
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
      runtimePolicyUpdatedAt: Date.parse('2026-07-16T00:00:00.000Z'),
    });

    renderWithProviders(<UpdateBanner />);

    expect(screen.getByRole('button', { name: 'Remind me later' })).toBeInTheDocument();
  });

  it('should show malformed removal dates verbatim instead of normalizing them', () => {
    mockUseVersionCheck.mockReturnValue({
      versionInfo: {
        updateAvailable: false,
        latestVersion: '1.9.0',
        currentVersion: '1.9.0',
        runtimeNotice: {
          id: 'node20-removal-invalid-date',
          kind: 'runtime_deprecation',
          runtime: 'node',
          currentVersion: 'v20.20.2',
          currentMajor: 20,
          removalDate: '2026-02-30',
          minimumVersion: '22.22.0',
          recommendedVersion: '24 LTS',
          documentationUrl: 'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
        },
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    });

    renderWithProviders(<UpdateBanner />);

    expect(screen.getByText(/Node.js 20 support ends 2026-02-30/i)).toBeInTheDocument();
  });

  it('should not offer an incompatible latest update when the runtime blocks it', () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-08-01T00:00:00.000Z'));
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
        },
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    });

    renderWithProviders(<UpdateBanner />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Node.js 20 support ended July 30, 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(/Update available/i)).not.toBeInTheDocument();
  });

  it('should report ended support for a post-cutoff Docker deployment', () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-08-01T00:00:00.000Z'));
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
        },
        updateCommands: {
          primary: 'docker pull ghcr.io/promptfoo/promptfoo:latest',
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
    expect(screen.getByText(/Pull the latest Promptfoo Docker image/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Docker Command/i })).toHaveAttribute(
      'title',
      'docker pull ghcr.io/promptfoo/promptfoo:latest',
    );
  });

  it('should show rebuild guidance instead of an upstream pull for a custom container', () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-08-01T00:00:00.000Z'));
    mockUseVersionCheck.mockReturnValue({
      versionInfo: {
        updateAvailable: true,
        updateBlockedByRuntime: true,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        commandType: 'npm',
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
        },
        updateCommands: {
          primary: '',
          alternative: null,
          isCustomContainer: true,
        },
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    });

    renderWithProviders(<UpdateBanner />);

    expect(
      screen.getByText(/Update this custom image's Node.js base to 24 LTS/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Pull the latest Promptfoo Docker image/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy/i })).not.toBeInTheDocument();
  });

  it('should show a compatible promptfoo update after the runtime notice is dismissed', () => {
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

  it('should not show an npm update from stale pre-cutoff data after runtime support ends', () => {
    const versionCheckResult: ReturnType<typeof useVersionCheck> = {
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
        },
        blockedUpdateNotice: {
          id: 'node20-removal-2026-07-30',
          kind: 'runtime_deprecation',
          runtime: 'node',
          currentVersion: 'v20.20.2',
          currentMajor: 20,
          removalDate: '2026-07-30',
          minimumVersion: '22.22.0',
          recommendedVersion: '24 LTS',
          documentationUrl: 'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
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
      runtimePolicyUpdatedAt: Date.parse('2026-07-29T23:59:00.000Z'),
    };
    mockUseVersionCheck.mockReturnValue(versionCheckResult);

    const { rerender } = renderWithProviders(<UpdateBanner />);

    expect(screen.getByText(/Update available: v2.0.0/i)).toBeInTheDocument();

    mockUseVersionCheck.mockReturnValue({
      ...versionCheckResult,
      runtimePolicyUpdatedAt: Date.parse('2026-07-30T00:00:00.000Z'),
    });
    rerender(<UpdateBanner />);

    expect(screen.queryByText(/Update available/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/requires a newer Node.js runtime/i)).not.toBeInTheDocument();
  });

  it('should fail closed after the cutoff when runtime notices are disabled', () => {
    const versionCheckResult: ReturnType<typeof useVersionCheck> = {
      versionInfo: {
        updateAvailable: true,
        updateBlockedByRuntime: false,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        runtimeNotice: null,
        runtimePolicy: { supportEndDate: '2026-07-30' },
        updateCommands: {
          primary: 'npm i -g promptfoo@latest',
          alternative: null,
        },
        commandType: 'npm',
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
      runtimePolicyUpdatedAt: Date.parse('2026-07-29T23:59:00.000Z'),
    };
    mockUseVersionCheck.mockReturnValue(versionCheckResult);

    const { rerender } = renderWithProviders(<UpdateBanner />);

    expect(screen.getByText(/Update available: v2.0.0/i)).toBeInTheDocument();

    mockUseVersionCheck.mockReturnValue({
      ...versionCheckResult,
      runtimePolicyUpdatedAt: Date.parse('2026-07-30T00:00:00.000Z'),
    });
    rerender(<UpdateBanner />);

    expect(screen.queryByText(/Update available/i)).not.toBeInTheDocument();
  });

  it('should show blocked update guidance when runtime reminders are disabled', async () => {
    const user = userEvent.setup();
    const dismissUpdate = vi.fn();
    const versionCheckResult: ReturnType<typeof useVersionCheck> = {
      versionInfo: {
        updateAvailable: false,
        updateBlockedByRuntime: true,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        runtimeNotice: null,
        blockedUpdateNotice: {
          id: 'node20-removal-2026-07-30',
          kind: 'runtime_deprecation',
          runtime: 'node',
          currentVersion: 'v20.20.2',
          currentMajor: 20,
          removalDate: '2026-07-30',
          minimumVersion: '22.22.0',
          recommendedVersion: '24 LTS',
          documentationUrl: 'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
        },
        runtimePolicy: { supportEndDate: '2026-07-30' },
        updateCommands: {
          primary: 'npm i -g promptfoo@latest',
          alternative: null,
        },
        commandType: 'npm',
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
      updateDismissed: false,
      dismissUpdate,
      runtimePolicyUpdatedAt: Date.parse('2026-07-30T00:00:00.000Z'),
    };
    mockUseVersionCheck.mockReturnValue(versionCheckResult);

    const { rerender } = renderWithProviders(<UpdateBanner />);

    expect(
      screen.getByText(/Promptfoo v2.0.0 requires a newer Node.js runtime/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Upgrade to Node.js 22.22.0 or newer/i)).toBeInTheDocument();
    expect(screen.getByText(/then update Promptfoo to v2.0.0/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /View upgrade guide/i })).toHaveAttribute(
      'href',
      'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
    );
    expect(screen.queryByRole('button', { name: /Copy Update Command/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Don't remind me of this version/i }));
    expect(dismissUpdate).toHaveBeenCalledTimes(1);
    expect(mockRecordEvent).not.toHaveBeenCalled();

    mockUseVersionCheck.mockReturnValue({ ...versionCheckResult, updateDismissed: true });
    rerender(<UpdateBanner />);

    expect(
      screen.queryByText(/Promptfoo v2.0.0 requires a newer Node.js runtime/i),
    ).not.toBeInTheDocument();
  });

  it('should preserve Docker updates after the cutoff when runtime notices are disabled', () => {
    mockUseVersionCheck.mockReturnValue({
      versionInfo: {
        updateAvailable: true,
        updateBlockedByRuntime: false,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        runtimeNotice: null,
        runtimePolicy: { supportEndDate: '2026-07-30' },
        updateCommands: {
          primary: 'docker pull ghcr.io/promptfoo/promptfoo:latest',
          alternative: null,
        },
        commandType: 'docker',
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
      runtimePolicyUpdatedAt: Date.parse('2026-07-30T00:00:00.000Z'),
    });

    renderWithProviders(<UpdateBanner />);

    expect(screen.getByText(/Update available: v2.0.0/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy Docker Command/i })).toBeInTheDocument();
  });

  it('should show actionable custom-container updates before cutoff and block them after', () => {
    const versionCheckResult: ReturnType<typeof useVersionCheck> = {
      versionInfo: {
        updateAvailable: true,
        updateBlockedByRuntime: false,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        runtimeNotice: null,
        runtimePolicy: { supportEndDate: '2026-07-30' },
        updateCommands: {
          primary: '',
          alternative: null,
          isCustomContainer: true,
        },
        commandType: 'npm',
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
      runtimePolicyUpdatedAt: Date.parse('2026-07-29T23:59:59.999Z'),
    };
    mockUseVersionCheck.mockReturnValue(versionCheckResult);

    const { rerender } = renderWithProviders(<UpdateBanner />);

    expect(screen.getByText(/Update available: v2.0.0/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Update the Promptfoo source, dependency, or parent image/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy/i })).not.toBeInTheDocument();

    mockUseVersionCheck.mockReturnValue({
      ...versionCheckResult,
      versionInfo: {
        ...versionCheckResult.versionInfo!,
        updateAvailable: false,
        updateBlockedByRuntime: true,
        blockedUpdateNotice: {
          id: 'node20-removal-2026-07-30',
          kind: 'runtime_deprecation',
          runtime: 'node',
          currentVersion: 'v20.20.2',
          currentMajor: 20,
          removalDate: '2026-07-30',
          minimumVersion: '22.22.0',
          recommendedVersion: '24 LTS',
          documentationUrl: 'https://www.promptfoo.dev/docs/installation/#nodejs-runtime-support',
        },
      },
      runtimePolicyUpdatedAt: Date.parse('2026-07-30T00:00:00.000Z'),
    });
    rerender(<UpdateBanner />);

    expect(screen.queryByText(/Update available/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Update the Promptfoo source, dependency, or parent image/i),
    ).toHaveTextContent(/Node.js base to 24 LTS, then rebuild and redeploy/i);
  });

  it('should still show a Docker update after runtime support ends', () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse('2026-08-01T00:00:00.000Z'));
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
        },
        updateCommands: {
          primary: 'docker pull ghcr.io/promptfoo/promptfoo:latest',
          alternative: null,
        },
        commandType: 'docker',
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
    expect(screen.getByRole('button', { name: /Copy Docker Command/i })).toBeInTheDocument();
  });

  it('should record a runtime notice impression after telemetry initializes', () => {
    const versionCheckResult: ReturnType<typeof useVersionCheck> = {
      versionInfo: {
        updateAvailable: false,
        latestVersion: '1.9.0',
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
        },
      },
      loading: false,
      error: null,
      dismissed: false,
      dismiss: vi.fn(),
    };
    mockUseVersionCheck.mockReturnValue(versionCheckResult);
    mockUseTelemetry.mockReturnValue({
      identifyUser: vi.fn(),
      isInitialized: false,
      recordEvent: mockRecordEvent,
    });

    const { rerender } = renderWithProviders(<UpdateBanner />);

    expect(mockRecordEvent).not.toHaveBeenCalled();

    mockUseTelemetry.mockReturnValue({
      identifyUser: vi.fn(),
      isInitialized: true,
      recordEvent: mockRecordEvent,
    });
    rerender(<UpdateBanner />);

    expect(mockRecordEvent).toHaveBeenCalledWith(
      'feature_used',
      expect.objectContaining({
        action: 'shown',
        feature: 'runtime_compatibility_notice',
      }),
    );
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
    expect(screen.getByRole('status')).not.toContainElement(copyCommandButton);

    await user.click(copyCommandButton);

    expect(mockWriteText).toHaveBeenCalledWith('npm i -g promptfoo@latest');

    // After copying, the Check icon should be shown (Lucide icons have lucide-check class)
    await waitFor(() => {
      const checkIcon = copyCommandButton.querySelector('.lucide-check');
      expect(checkIcon).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copied' })).toBe(copyCommandButton);
      expect(screen.getByText('Command copied')).toHaveAttribute('aria-live', 'polite');
    });
  });

  it('should not report copy success when the clipboard fallback rejects the command', async () => {
    const user = userEvent.setup();
    mockUseVersionCheck.mockReturnValue({
      versionInfo: {
        updateAvailable: true,
        latestVersion: '2.0.0',
        currentVersion: '1.9.0',
        updateCommands: {
          primary: 'npm i -g promptfoo@latest',
          alternative: null,
        },
        commandType: 'npm',
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
    expect(screen.queryByRole('button', { name: 'Copied' })).not.toBeInTheDocument();
    expect(screen.queryByText('Command copied')).not.toBeInTheDocument();
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
