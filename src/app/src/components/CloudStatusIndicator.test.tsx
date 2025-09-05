import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CloudStatusIndicator from './CloudStatusIndicator';

// Mock the useCloudAuth hook
vi.mock('@app/hooks/useCloudAuth', () => ({
  useCloudAuth: vi.fn(),
}));

// Mock the useTelemetry hook
vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: vi.fn(),
}));

import { useCloudAuth } from '@app/hooks/useCloudAuth';
import { useTelemetry } from '@app/hooks/useTelemetry';

describe('CloudStatusIndicator', () => {
  const mockRecordEvent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window.open mock
    global.window.open = vi.fn();

    // Default mock for useTelemetry
    vi.mocked(useTelemetry).mockReturnValue({
      recordEvent: mockRecordEvent,
      identifyUser: vi.fn(),
      isInitialized: true,
    });
  });

  it('should show loading state', () => {
    vi.mocked(useCloudAuth).mockReturnValue({
      isAuthenticated: false,
      hasApiKey: false,
      appUrl: null,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<CloudStatusIndicator />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-label', expect.stringContaining('Checking cloud status'));
  });

  it('should show authenticated state with cloud icon', () => {
    vi.mocked(useCloudAuth).mockReturnValue({
      isAuthenticated: true,
      hasApiKey: true,
      appUrl: 'https://app.promptfoo.app',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<CloudStatusIndicator />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Connected to Promptfoo Cloud'),
    );
    expect(screen.getByTestId('CloudIcon')).toBeInTheDocument();
  });

  it('should show authenticated state with custom URL', () => {
    vi.mocked(useCloudAuth).mockReturnValue({
      isAuthenticated: true,
      hasApiKey: true,
      appUrl: 'https://custom.enterprise.com',
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<CloudStatusIndicator />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Connected to Promptfoo Cloud'),
    );
    expect(screen.getByTestId('CloudIcon')).toBeInTheDocument();
  });

  it('should show unauthenticated state with cloud off icon', () => {
    vi.mocked(useCloudAuth).mockReturnValue({
      isAuthenticated: false,
      hasApiKey: false,
      appUrl: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<CloudStatusIndicator />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Not connected to Promptfoo Cloud'),
    );
    expect(screen.getByTestId('CloudOffIcon')).toBeInTheDocument();
  });

  it('should show error state', () => {
    vi.mocked(useCloudAuth).mockReturnValue({
      isAuthenticated: false,
      hasApiKey: false,
      appUrl: null,
      isLoading: false,
      error: 'Failed to check cloud status',
      refetch: vi.fn(),
    });

    render(<CloudStatusIndicator />);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute(
      'aria-label',
      expect.stringContaining('Unable to check cloud status'),
    );
    expect(screen.getByTestId('CloudOffIcon')).toBeInTheDocument();
  });

  it('should open cloud dashboard when authenticated and track telemetry', () => {
    const mockAppUrl = 'https://app.promptfoo.app';
    vi.mocked(useCloudAuth).mockReturnValue({
      isAuthenticated: true,
      hasApiKey: true,
      appUrl: mockAppUrl,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<CloudStatusIndicator />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(window.open).toHaveBeenCalledWith(mockAppUrl, '_blank');
    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'cloud_status_icon_click',
      authenticated: true,
    });
  });

  it('should show cloud dialog when unauthenticated', () => {
    vi.mocked(useCloudAuth).mockReturnValue({
      isAuthenticated: false,
      hasApiKey: false,
      appUrl: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<CloudStatusIndicator />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(screen.getByText('Connect to Promptfoo Cloud')).toBeInTheDocument();
    expect(screen.getByText(/Share evaluation results with your team/)).toBeInTheDocument();
    expect(screen.getByText(/Centralized dashboard and reporting/)).toBeInTheDocument();
    expect(screen.getByText('Learn More')).toBeInTheDocument();
    expect(mockRecordEvent).toHaveBeenCalledWith('feature_used', {
      feature: 'cloud_status_icon_click',
      authenticated: false,
    });
  });

  it('should show dialog with correct text when unauthenticated', () => {
    vi.mocked(useCloudAuth).mockReturnValue({
      isAuthenticated: false,
      hasApiKey: false,
      appUrl: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<CloudStatusIndicator />);

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(screen.getByText('Connect to Promptfoo Cloud')).toBeInTheDocument();
    expect(screen.getByText(/Share evaluation results with your team/)).toBeInTheDocument();
    expect(screen.getByText(/Centralized dashboard and reporting/)).toBeInTheDocument();
    expect(screen.getByText('Learn More')).toBeInTheDocument();
  });

  it('should close dialog when close button is clicked', async () => {
    vi.mocked(useCloudAuth).mockReturnValue({
      isAuthenticated: false,
      hasApiKey: false,
      appUrl: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<CloudStatusIndicator />);

    // Open dialog
    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(screen.getByText('Connect to Promptfoo Cloud')).toBeInTheDocument();

    // Close dialog
    const closeButton = screen.getByText('Close');
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText('Connect to Promptfoo Cloud')).not.toBeInTheDocument();
    });
  });

  it('should show error in dialog when there is an error', () => {
    const errorMessage = 'Network connection failed';
    vi.mocked(useCloudAuth).mockReturnValue({
      isAuthenticated: false,
      hasApiKey: false,
      appUrl: null,
      isLoading: false,
      error: errorMessage,
      refetch: vi.fn(),
    });

    render(<CloudStatusIndicator />);

    // Open dialog
    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(
      screen.getByText(
        'Unable to connect to cloud service. Please check your connection and try again.',
      ),
    ).toBeInTheDocument();
  });

  it('should track telemetry when promptfoo.app link is clicked', () => {
    vi.mocked(useCloudAuth).mockReturnValue({
      isAuthenticated: false,
      hasApiKey: false,
      appUrl: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<CloudStatusIndicator />);

    // Open dialog
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Click promptfoo.app link
    const promptfooLink = screen.getByText('promptfoo.app');
    fireEvent.click(promptfooLink);

    expect(mockRecordEvent).toHaveBeenCalledWith('webui_action', {
      action: 'cloud_cta_signup_click',
      source: 'cloud_status_dialog',
    });
  });

  it('should track telemetry when Learn More button is clicked', () => {
    vi.mocked(useCloudAuth).mockReturnValue({
      isAuthenticated: false,
      hasApiKey: false,
      appUrl: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<CloudStatusIndicator />);

    // Open dialog
    const button = screen.getByRole('button');
    fireEvent.click(button);

    // Click Learn More button
    const learnMoreButton = screen.getByText('Learn More');
    fireEvent.click(learnMoreButton);

    expect(window.open).toHaveBeenCalledWith(
      'https://www.promptfoo.dev/docs/usage/sharing/',
      '_blank',
    );
    expect(mockRecordEvent).toHaveBeenCalledWith('webui_action', {
      action: 'cloud_learn_more_click',
      source: 'cloud_status_dialog',
    });
  });
});
