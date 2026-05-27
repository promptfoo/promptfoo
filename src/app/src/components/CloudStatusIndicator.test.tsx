import { TooltipProvider } from '@app/components/ui/tooltip';
import useCloudConfig from '@app/hooks/useCloudConfig';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CloudStatusIndicator from './CloudStatusIndicator';

vi.mock('@app/hooks/useCloudConfig', () => ({
  default: vi.fn(),
}));

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: vi.fn(),
}));

const mockRecordEvent = vi.fn();
const mockRefetch = vi.fn();
const mockWindowOpen = vi.fn();

function renderCloudStatusIndicator() {
  return render(
    <TooltipProvider delayDuration={0}>
      <CloudStatusIndicator />
    </TooltipProvider>,
  );
}

describe('CloudStatusIndicator', () => {
  beforeEach(() => {
    vi.mocked(useTelemetry).mockReturnValue({
      recordEvent: mockRecordEvent,
      identifyUser: vi.fn(),
      isInitialized: true,
    });
    vi.spyOn(window, 'open').mockImplementation(mockWindowOpen);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('shows loading state', () => {
    vi.mocked(useCloudConfig).mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    expect(screen.getByRole('button', { name: /checking cloud configuration/i })).toHaveClass(
      'size-11',
      'sm:size-9',
    );
  });

  it('shows configured cloud state', () => {
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: true,
        appUrl: 'https://app.promptfoo.app',
        isEnterprise: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    expect(
      screen.getByRole('button', { name: /configured for promptfoo cloud/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('CloudIcon')).toBeInTheDocument();
  });

  it('shows configured enterprise state', () => {
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: true,
        appUrl: 'https://enterprise.company.com',
        isEnterprise: true,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    expect(
      screen.getByRole('button', { name: /configured for promptfoo enterprise/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('CloudIcon')).toBeInTheDocument();
  });

  it('shows unconfigured cloud state while retaining its app URL', () => {
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: false,
        appUrl: 'https://app.promptfoo.app',
        isEnterprise: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    expect(
      screen.getByRole('button', { name: /promptfoo cloud is not configured/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('CloudOffIcon')).toBeInTheDocument();
  });

  it('shows error state', () => {
    vi.mocked(useCloudConfig).mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    expect(
      screen.getByRole('button', { name: /unable to check cloud configuration/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('CloudOffIcon')).toBeInTheDocument();
  });

  it('does not open a configured app when a safe dashboard URL is unavailable', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: true,
        appUrl: null,
        isEnterprise: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    await user.click(
      screen.getByRole('button', {
        name: /promptfoo cloud dashboard url is unavailable/i,
      }),
    );

    expect(mockWindowOpen).not.toHaveBeenCalled();
    expect(
      screen.getByText(/safe promptfoo cloud dashboard url is unavailable/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/please check your connection/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('CloudOffIcon')).toBeInTheDocument();
  });

  it('does not open unsafe URLs returned by an older or alternate API server', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: true,
        appUrl: 'javascript:alert(document.domain)',
        isEnterprise: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    await user.click(
      screen.getByRole('button', {
        name: /promptfoo cloud dashboard url is unavailable/i,
      }),
    );

    expect(mockWindowOpen).not.toHaveBeenCalled();
    expect(
      screen.getByText(/safe promptfoo cloud dashboard url is unavailable/i),
    ).toBeInTheDocument();
  });

  it('does not expose credentialed enterprise URLs in the connection dialog', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: false,
        appUrl: 'https://user:password@enterprise.company.com',
        isEnterprise: true,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    await user.click(
      screen.getByRole('button', { name: /promptfoo enterprise is not configured/i }),
    );

    expect(screen.queryByRole('link', { name: 'enterprise.company.com' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'promptfoo.app' })).toHaveAttribute(
      'href',
      'https://www.promptfoo.app/welcome',
    );
  });

  it('opens cloud dashboard securely when configured and tracks telemetry', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: true,
        appUrl: 'https://app.promptfoo.app',
        isEnterprise: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    await user.click(screen.getByRole('button', { name: /configured for promptfoo cloud/i }));

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://app.promptfoo.app',
      '_blank',
      'noopener,noreferrer',
    );
    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'cloud_status_icon_click',
      configured: true,
    });
  });

  it('opens the dialog instead of a stale dashboard URL when refresh fails', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: true,
        appUrl: 'https://app.promptfoo.app',
        isEnterprise: false,
      },
      isLoading: false,
      isError: true,
      error: new Error('Network error'),
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    await user.click(screen.getByRole('button', { name: /unable to check cloud configuration/i }));

    expect(mockWindowOpen).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        'Unable to check cloud configuration. Please check your connection and try again.',
      ),
    ).toBeInTheDocument();
  });

  it('opens dialog when unconfigured and tracks telemetry', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: false,
        appUrl: 'https://app.promptfoo.app',
        isEnterprise: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    await user.click(screen.getByRole('button', { name: /promptfoo cloud is not configured/i }));

    expect(screen.getByText('Configure Promptfoo Cloud')).toBeInTheDocument();
    expect(
      screen.getByText('Configure Promptfoo Cloud to unlock team workflows.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'Configure Promptfoo Cloud to unlock team workflows.',
    );
    expect(screen.getByText(/share evaluation results with your team/i)).toBeInTheDocument();
    expect(screen.getByText(/open centralized dashboards and reports/i)).toBeInTheDocument();
    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'cloud_status_icon_click',
      configured: false,
    });
  });

  it('opens enterprise dialog when enterprise is unconfigured', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: false,
        appUrl: 'https://enterprise.company.com',
        isEnterprise: true,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    await user.click(
      screen.getByRole('button', { name: /promptfoo enterprise is not configured/i }),
    );

    expect(screen.getByText('Configure Promptfoo Enterprise')).toBeInTheDocument();
    expect(
      screen.getByText(/share evaluation results with your organization/i),
    ).toBeInTheDocument();
  });

  it('links to the enterprise app when enterprise is unconfigured', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: false,
        appUrl: 'https://enterprise.company.com',
        isEnterprise: true,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    await user.click(
      screen.getByRole('button', { name: /promptfoo enterprise is not configured/i }),
    );

    expect(screen.getByRole('link', { name: 'enterprise.company.com' })).toHaveAttribute(
      'href',
      'https://enterprise.company.com',
    );
  });

  it('closes dialog when close button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: false,
        appUrl: 'https://app.promptfoo.app',
        isEnterprise: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    await user.click(screen.getByRole('button', { name: /promptfoo cloud is not configured/i }));
    expect(screen.getByText('Configure Promptfoo Cloud')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Close' })[0]);

    await waitFor(() => {
      expect(screen.queryByText('Configure Promptfoo Cloud')).not.toBeInTheDocument();
    });
  });

  it('shows error in dialog when there is an error', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error('Network connection failed'),
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    await user.click(screen.getByRole('button', { name: /unable to check cloud configuration/i }));

    expect(
      screen.getByText(
        'Unable to check cloud configuration. Please check your connection and try again.',
      ),
    ).toBeInTheDocument();
  });

  it('tracks telemetry when promptfoo.app link is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: false,
        appUrl: 'https://app.promptfoo.app',
        isEnterprise: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    await user.click(screen.getByRole('button', { name: /promptfoo cloud is not configured/i }));
    await user.click(screen.getByRole('link', { name: 'promptfoo.app' }));

    expect(mockRecordEvent).toHaveBeenCalledWith('webui_action', {
      action: 'cloud_cta_signup_click',
      source: 'cloud_status_dialog',
    });
  });

  it('tracks telemetry when learn more button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: false,
        appUrl: 'https://app.promptfoo.app',
        isEnterprise: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    await user.click(screen.getByRole('button', { name: /promptfoo cloud is not configured/i }));
    await user.click(screen.getByRole('button', { name: /learn more/i }));

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://www.promptfoo.dev/docs/usage/sharing/',
      '_blank',
      'noopener,noreferrer',
    );
    expect(mockRecordEvent).toHaveBeenCalledWith('webui_action', {
      action: 'cloud_learn_more_click',
      source: 'cloud_status_dialog',
    });
  });

  it('calls refetch when refresh configuration button is clicked', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: false,
        appUrl: 'https://app.promptfoo.app',
        isEnterprise: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    await user.click(screen.getByRole('button', { name: /promptfoo cloud is not configured/i }));
    await user.click(screen.getByRole('button', { name: 'Refresh Configuration' }));

    expect(mockRefetch).toHaveBeenCalled();
    expect(mockRecordEvent).toHaveBeenCalledWith('webui_action', {
      action: 'cloud_status_refresh',
      source: 'cloud_status_dialog',
    });
  });

  it('does not open a cached dashboard while refreshing and disables refresh', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: true,
        appUrl: 'https://app.promptfoo.app',
        isEnterprise: false,
      },
      isLoading: true,
      isError: false,
      error: null,
      refetch: mockRefetch,
    } as any);

    renderCloudStatusIndicator();

    await user.click(screen.getByRole('button', { name: /checking cloud configuration/i }));

    expect(mockWindowOpen).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Checking...' })).toBeDisabled();
  });
});
