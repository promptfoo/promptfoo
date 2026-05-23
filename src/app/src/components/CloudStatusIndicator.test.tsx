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
      error: null,
      refetch: mockRefetch,
    });

    renderCloudStatusIndicator();

    expect(
      screen.getByRole('button', { name: /checking cloud configuration/i }),
    ).toBeInTheDocument();
  });

  it('shows configured cloud state', () => {
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: true,
        appUrl: 'https://app.promptfoo.app',
        isEnterprise: false,
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

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
      error: null,
      refetch: mockRefetch,
    });

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
      error: null,
      refetch: mockRefetch,
    });

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
      error: 'Network error',
      refetch: mockRefetch,
    });

    renderCloudStatusIndicator();

    expect(
      screen.getByRole('button', { name: /unable to check cloud configuration/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('CloudOffIcon')).toBeInTheDocument();
  });

  it('does not open an invalid configured app URL', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: true,
        appUrl: null,
        isEnterprise: false,
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderCloudStatusIndicator();

    await user.click(
      screen.getByRole('button', {
        name: /promptfoo cloud configuration has an invalid application url/i,
      }),
    );

    expect(mockWindowOpen).not.toHaveBeenCalled();
    expect(screen.getByText(/unable to check cloud configuration/i)).toBeInTheDocument();
    expect(screen.getByTestId('CloudOffIcon')).toBeInTheDocument();
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
      error: null,
      refetch: mockRefetch,
    });

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

  it('opens dialog when unconfigured and tracks telemetry', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: false,
        appUrl: 'https://app.promptfoo.app',
        isEnterprise: false,
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderCloudStatusIndicator();

    await user.click(screen.getByRole('button', { name: /promptfoo cloud is not configured/i }));

    expect(screen.getByText('Configure Promptfoo Cloud')).toBeInTheDocument();
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
      error: null,
      refetch: mockRefetch,
    });

    renderCloudStatusIndicator();

    await user.click(
      screen.getByRole('button', { name: /promptfoo enterprise is not configured/i }),
    );

    expect(screen.getByText('Configure Promptfoo Enterprise')).toBeInTheDocument();
    expect(
      screen.getByText(/share evaluation results with your organization/i),
    ).toBeInTheDocument();
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
      error: null,
      refetch: mockRefetch,
    });

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
      error: 'Network connection failed',
      refetch: mockRefetch,
    });

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
      error: null,
      refetch: mockRefetch,
    });

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
      error: null,
      refetch: mockRefetch,
    });

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
      error: null,
      refetch: mockRefetch,
    });

    renderCloudStatusIndicator();

    await user.click(screen.getByRole('button', { name: /promptfoo cloud is not configured/i }));
    await user.click(screen.getByRole('button', { name: 'Refresh Configuration' }));

    expect(mockRefetch).toHaveBeenCalled();
    expect(mockRecordEvent).toHaveBeenCalledWith('webui_action', {
      action: 'cloud_status_refresh',
      source: 'cloud_status_dialog',
    });
  });

  it('disables refresh status button while loading', async () => {
    const user = userEvent.setup();
    vi.mocked(useCloudConfig).mockReturnValue({
      data: {
        isEnabled: false,
        appUrl: 'https://app.promptfoo.app',
        isEnterprise: false,
      },
      isLoading: true,
      error: null,
      refetch: mockRefetch,
    });

    renderCloudStatusIndicator();

    await user.click(screen.getByRole('button', { name: /checking cloud configuration/i }));

    expect(screen.getByRole('button', { name: 'Checking...' })).toBeDisabled();
  });
});
