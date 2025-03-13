import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { useApiHealth } from '@app/hooks/useApiHealth';
import useApiConfig from '@app/stores/apiConfig';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ApiSettingsModal from './ApiSettingsModal';

vi.mock('@app/hooks/useApiHealth', () => ({
  useApiHealth: vi.fn(),
}));

vi.mock('@app/stores/apiConfig', () => ({
  default: vi.fn(),
}));

describe('ApiSettingsModal', () => {
  const mockOnClose = vi.fn();
  const mockCheckHealth = vi.fn();
  const mockSetApiBaseUrl = vi.fn();
  const mockEnablePersistApiBaseUrl = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useApiHealth).mockReturnValue({
      status: 'unknown',
      message: null,
      checkHealth: mockCheckHealth,
      isChecking: false,
    });

    vi.mocked(useApiConfig).mockReturnValue({
      apiBaseUrl: 'https://api.example.com',
      setApiBaseUrl: mockSetApiBaseUrl,
      enablePersistApiBaseUrl: mockEnablePersistApiBaseUrl,
    });
  });

  it('does not render when closed', () => {
    render(<ApiSettingsModal open={false} onClose={mockOnClose} />);
    expect(screen.queryByText('API and Sharing Settings')).not.toBeInTheDocument();
  });

  it('displays the correct title when open', () => {
    render(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    expect(screen.getByText('API and Sharing Settings')).toBeInTheDocument();
  });

  it('shows current API URL in text field', () => {
    render(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    const input = screen.getByLabelText('API Base URL') as HTMLInputElement;
    expect(input.value).toBe('https://api.example.com');
  });

  it('updates API URL when typing', () => {
    render(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    const input = screen.getByLabelText('API Base URL');
    fireEvent.change(input, { target: { value: 'https://new-api.example.com' } });
    expect((input as HTMLInputElement).value).toBe('https://new-api.example.com');
  });

  it('checks health status on open', () => {
    render(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    expect(mockCheckHealth).toHaveBeenCalledTimes(1);
  });

  it('shows loading state during health check', () => {
    vi.mocked(useApiHealth).mockReturnValue({
      status: 'loading',
      message: null,
      checkHealth: mockCheckHealth,
      isChecking: true,
    });

    render(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    expect(screen.getByText('Checking connection...')).toBeInTheDocument();
  });

  it('shows success state when connected', () => {
    vi.mocked(useApiHealth).mockReturnValue({
      status: 'connected',
      message: 'Cloud API is healthy',
      checkHealth: mockCheckHealth,
      isChecking: false,
    });

    render(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    expect(screen.getByText('Connected to promptfoo API')).toBeInTheDocument();
    expect(screen.getByText('Cloud API is healthy')).toBeInTheDocument();
  });

  it('shows error state when blocked', () => {
    vi.mocked(useApiHealth).mockReturnValue({
      status: 'blocked',
      message: 'Failed to connect',
      checkHealth: mockCheckHealth,
      isChecking: false,
    });

    render(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    expect(screen.getByText('Cannot connect to promptfoo API')).toBeInTheDocument();
    expect(screen.getByText('Failed to connect')).toBeInTheDocument();
  });

  it('shows disabled state when remote generation is disabled', () => {
    vi.mocked(useApiHealth).mockReturnValue({
      status: 'disabled',
      message: 'Remote generation is disabled',
      checkHealth: mockCheckHealth,
      isChecking: false,
    });

    render(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    const statusText = screen
      .getAllByText('Remote generation is disabled')
      .find((element) => element.tagName.toLowerCase() === 'p');
    expect(statusText).toBeInTheDocument();
  });

  it('handles save button click correctly', async () => {
    render(<ApiSettingsModal open={true} onClose={mockOnClose} />);

    const input = screen.getByLabelText('API Base URL');
    fireEvent.change(input, { target: { value: 'https://new-api.example.com' } });

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockSetApiBaseUrl).toHaveBeenCalledWith('https://new-api.example.com');
      expect(mockEnablePersistApiBaseUrl).toHaveBeenCalled();
      expect(mockCheckHealth).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('disables form controls during health check', () => {
    vi.mocked(useApiHealth).mockReturnValue({
      status: 'loading',
      message: null,
      checkHealth: mockCheckHealth,
      isChecking: true,
    });

    render(<ApiSettingsModal open={true} onClose={mockOnClose} />);

    expect(screen.getByLabelText('API Base URL')).toBeDisabled();
    expect(screen.getByText('Save')).toBeDisabled();
    expect(screen.getByText('Close')).toBeDisabled();
  });

  it('shows refresh button and handles click', () => {
    render(<ApiSettingsModal open={true} onClose={mockOnClose} />);

    const refreshButton = screen.getByLabelText('Check connection');
    fireEvent.click(refreshButton);

    expect(mockCheckHealth).toHaveBeenCalled();
  });

  it('has correct aria-labelledby attribute', () => {
    render(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-labelledby', 'api-settings-dialog-title');
  });
});
