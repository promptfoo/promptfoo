import { TooltipProvider } from '@app/components/ui/tooltip';
import useCloudConfig, { type CloudConfigData } from '@app/hooks/useCloudConfig';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CloudStatusIndicator from './CloudStatusIndicator';

vi.mock('@app/hooks/useCloudConfig', () => ({ default: vi.fn() }));
vi.mock('@app/hooks/useTelemetry', () => ({ useTelemetry: vi.fn() }));

const recordEvent = vi.fn();
const refetch = vi.fn();
const openWindow = vi.fn();
const unconfigured = {
  appUrl: 'https://www.promptfoo.app',
  isEnabled: false,
  isEnterprise: false,
};

function mockConfig(
  data: CloudConfigData | null = unconfigured,
  overrides: Partial<ReturnType<typeof useCloudConfig>> = {},
) {
  vi.mocked(useCloudConfig).mockReturnValue({
    data,
    isLoading: false,
    error: null,
    refetch,
    ...overrides,
  });
}

function mount() {
  return render(
    <TooltipProvider delayDuration={0}>
      <CloudStatusIndicator />
    </TooltipProvider>,
  );
}

async function openDialog() {
  const user = userEvent.setup();
  await user.click(
    screen.getByRole('button', { name: /not configured|unable to check|unavailable/i }),
  );
  return user;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useTelemetry).mockReturnValue({
    recordEvent,
    identifyUser: vi.fn(),
    isInitialized: true,
  });
  vi.spyOn(window, 'open').mockImplementation(openWindow);
  mockConfig();
});

afterEach(() => vi.restoreAllMocks());

describe('CloudStatusIndicator', () => {
  it.each([
    ['Cloud', 'https://www.promptfoo.app', false],
    ['Enterprise', 'https://enterprise.example', true],
  ])('opens the configured %s dashboard', async (name, appUrl, isEnterprise) => {
    mockConfig({ appUrl, isEnabled: true, isEnterprise });
    mount();
    await userEvent
      .setup()
      .click(
        screen.getByRole('button', { name: `Configured for Promptfoo ${name}. Open dashboard.` }),
      );
    expect(openWindow).toHaveBeenCalledWith(appUrl, '_blank', 'noopener,noreferrer');
    expect(recordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'cloud_status_icon_click',
      configured: true,
    });
  });

  it('explains how to connect with an accessible dialog', async () => {
    mount();
    await openDialog();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Configure Promptfoo Cloud');
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'Connect to share evaluation results with your team.',
    );
    expect(screen.getByText('Share evaluation results with your team')).toBeInTheDocument();
    expect(screen.getByText('View dashboards and reports')).toBeInTheDocument();
    expect(screen.getByText('promptfoo auth login')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'promptfoo.app' })).toHaveAttribute(
      'href',
      'https://www.promptfoo.app/welcome',
    );
    expect(recordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'cloud_status_icon_click',
      configured: false,
    });
  });

  it('links an unconfigured enterprise installation to its own dashboard', async () => {
    mockConfig({ appUrl: 'https://enterprise.example', isEnabled: false, isEnterprise: true });
    mount();
    await openDialog();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Configure Promptfoo Enterprise');
    expect(screen.getByText('Share evaluation results with your organization')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'enterprise.example' })).toHaveAttribute(
      'href',
      'https://enterprise.example',
    );
  });

  it.each([false, true])(
    'keeps enterprise setup on the enterprise host when enabled=%s',
    async (isEnabled) => {
      mockConfig({ appUrl: null, isEnabled, isEnterprise: true });
      mount();
      await openDialog();
      expect(
        screen.getByText('promptfoo auth login --host <enterprise-dashboard-url>'),
      ).toBeInTheDocument();
      expect(screen.queryByText('promptfoo auth login', { exact: true })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'promptfoo.app' })).not.toBeInTheDocument();
      expect(openWindow).not.toHaveBeenCalled();
    },
  );

  it('does not navigate when the dashboard URL is unavailable', async () => {
    mockConfig({ ...unconfigured, isEnabled: true, appUrl: null });
    mount();
    await openDialog();
    expect(openWindow).not.toHaveBeenCalled();
    expect(screen.getByText(/dashboard url is missing or invalid/i)).toBeInTheDocument();
  });

  it.each([null, { ...unconfigured, isEnabled: true }])(
    'shows a fetch error even with cached data %j',
    async (data) => {
      mockConfig(data, { error: 'Network error' });
      mount();
      await openDialog();
      expect(openWindow).not.toHaveBeenCalled();
      expect(
        screen.getByText(
          'Unable to check cloud configuration. Please check your connection and try again.',
        ),
      ).toBeInTheDocument();
    },
  );

  it.each([null, { ...unconfigured, isEnabled: true }])(
    'shows loading state and prevents stale navigation with data %j',
    async (data) => {
      mockConfig(data, { isLoading: true });
      mount();
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: /checking cloud configuration/i }));
      expect(openWindow).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Checking...' })).toBeDisabled();
    },
  );

  it.each(['button', 'Escape'])('restores focus when closed with %s', async (method) => {
    mount();
    const user = await openDialog();
    if (method === 'Escape') {
      await user.keyboard('{Escape}');
    } else {
      await user.click(screen.getAllByRole('button', { name: 'Close' })[0]);
    }
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /not configured/i })).toHaveFocus();
    });
  });

  it('refreshes the configuration and records the action', async () => {
    mount();
    const user = await openDialog();
    await user.click(screen.getByRole('button', { name: 'Refresh Configuration' }));
    expect(refetch).toHaveBeenCalledOnce();
    expect(recordEvent).toHaveBeenCalledWith('webui_action', {
      action: 'cloud_status_refresh',
      source: 'cloud_status_dialog',
    });
  });

  it('records signup and documentation actions', async () => {
    mount();
    const user = await openDialog();
    await user.click(screen.getByRole('link', { name: 'promptfoo.app' }));
    expect(recordEvent).toHaveBeenCalledWith('webui_action', {
      action: 'cloud_cta_signup_click',
      source: 'cloud_status_dialog',
    });
    await user.click(screen.getByRole('button', { name: /learn more/i }));
    expect(openWindow).toHaveBeenCalledWith(
      'https://www.promptfoo.dev/docs/usage/sharing/',
      '_blank',
      'noopener,noreferrer',
    );
    expect(recordEvent).toHaveBeenCalledWith('webui_action', {
      action: 'cloud_learn_more_click',
      source: 'cloud_status_dialog',
    });
  });
});
