import { type ApiHealthResult, useApiHealth } from '@app/hooks/useApiHealth';
import useApiConfig from '@app/stores/apiConfig';
import { renderWithProviders } from '@app/utils/testutils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ApiSettingsModal from './ApiSettingsModal';
import type { DefinedUseQueryResult } from '@tanstack/react-query';

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
      data: { status: 'unknown', message: '' },
      refetch: mockCheckHealth,
      isLoading: false,
    } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

    vi.mocked(useApiConfig).mockReturnValue({
      apiBaseUrl: 'https://api.example.com',
      setApiBaseUrl: mockSetApiBaseUrl,
      enablePersistApiBaseUrl: mockEnablePersistApiBaseUrl,
    });
  });

  it('does not render when closed', () => {
    renderWithProviders(<ApiSettingsModal open={false} onClose={mockOnClose} />);
    expect(screen.queryByText('API and Sharing Settings')).not.toBeInTheDocument();
  });

  it('displays the correct title when open', () => {
    renderWithProviders(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    expect(screen.getByText('API and Sharing Settings')).toBeInTheDocument();
  });

  it('shows current API URL in text field', () => {
    renderWithProviders(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    const input = screen.getByLabelText('API Base URL') as HTMLInputElement;
    expect(input.value).toBe('https://api.example.com');
  });

  it('updates API URL when typing', () => {
    renderWithProviders(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    const input = screen.getByLabelText('API Base URL');
    fireEvent.change(input, { target: { value: 'https://new-api.example.com' } });
    expect((input as HTMLInputElement).value).toBe('https://new-api.example.com');
  });

  it('checks health status on open', () => {
    renderWithProviders(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    expect(mockCheckHealth).toHaveBeenCalledTimes(1);
  });

  it('shows loading state during health check', () => {
    vi.mocked(useApiHealth).mockReturnValue({
      data: { status: 'loading', message: '' },
      refetch: mockCheckHealth,
      isLoading: true,
    } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

    renderWithProviders(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    expect(screen.getByText('Checking connection...')).toBeInTheDocument();
  });

  it('shows success state when connected', () => {
    vi.mocked(useApiHealth).mockReturnValue({
      data: { status: 'connected', message: 'Cloud API is healthy' },
      refetch: mockCheckHealth,
      isLoading: false,
    } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

    renderWithProviders(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    expect(screen.getByText('Connected to promptfoo API')).toBeInTheDocument();
    expect(screen.getByText('Cloud API is healthy')).toBeInTheDocument();
  });

  it('shows error state when blocked', () => {
    vi.mocked(useApiHealth).mockReturnValue({
      data: { status: 'blocked', message: 'Failed to connect' },
      refetch: mockCheckHealth,
      isLoading: false,
    } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

    renderWithProviders(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    expect(screen.getByText('Cannot connect to promptfoo API')).toBeInTheDocument();
    expect(screen.getByText('Failed to connect')).toBeInTheDocument();
  });

  it('shows disabled state when remote generation is disabled', () => {
    vi.mocked(useApiHealth).mockReturnValue({
      data: { status: 'disabled', message: 'Remote generation is disabled' },
      refetch: mockCheckHealth,
      isLoading: false,
    } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

    renderWithProviders(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    const elements = screen.getAllByText('Remote generation is disabled');
    expect(elements.length).toBeGreaterThan(0);
  });

  it('handles save button click correctly', async () => {
    renderWithProviders(<ApiSettingsModal open={true} onClose={mockOnClose} />);

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
      data: { status: 'loading', message: '' },
      refetch: mockCheckHealth,
      isLoading: true,
    } as unknown as DefinedUseQueryResult<ApiHealthResult, Error>);

    renderWithProviders(<ApiSettingsModal open={true} onClose={mockOnClose} />);

    expect(screen.getByLabelText('API Base URL')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    // Find the Close button in the footer (not the dialog X button)
    const closeButtons = screen.getAllByRole('button', { name: 'Close' });
    const footerCloseButton = closeButtons.find((btn) => btn.textContent === 'Close');
    expect(footerCloseButton).toBeDisabled();
  });

  it('shows refresh button and handles click', () => {
    renderWithProviders(<ApiSettingsModal open={true} onClose={mockOnClose} />);

    const refreshButton = screen.getByLabelText('Check connection');
    fireEvent.click(refreshButton);

    expect(mockCheckHealth).toHaveBeenCalled();
  });

  it('has accessible dialog with title', () => {
    renderWithProviders(<ApiSettingsModal open={true} onClose={mockOnClose} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('API and Sharing Settings');
  });
});
