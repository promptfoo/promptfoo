import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mock socket.io-client
const mockSocket = {
  on: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

// Mock the constants
vi.mock('@app/constants', () => ({
  IS_RUNNING_LOCALLY: true,
}));

// Mock the API config store
vi.mock('@app/stores/apiConfig', () => ({
  default: vi.fn(() => ({ apiBaseUrl: 'http://localhost:3000' })),
}));

// Mock callApi
const mockCallApi = vi.fn();
vi.mock('@app/utils/api', () => ({
  callApi: (...args: unknown[]) => mockCallApi(...args),
}));

// Mock the Prompts component to simplify testing
vi.mock('./Prompts', () => ({
  default: ({ data, isLoading, error }: { data: unknown[]; isLoading: boolean; error: string | null }) => (
    <div data-testid="prompts-component">
      {isLoading && <span>Loading...</span>}
      {error && <span>{error}</span>}
      <span data-testid="prompts-count">{data.length}</span>
    </div>
  ),
}));

// Import after mocks
import PromptsPage from './page';

const theme = createTheme();

function renderWithProviders() {
  return render(
    <MemoryRouter>
      <ThemeProvider theme={theme}>
        <PromptsPage />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe('PromptsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.on.mockClear();
    mockSocket.disconnect.mockClear();
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: [] }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch prompts on mount', async () => {
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: [{ id: '1', prompt: { raw: 'test' } }] }),
    });

    renderWithProviders();

    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalledWith('/prompts');
    });
  });

  it('should subscribe to Socket.io updates when running locally', async () => {
    renderWithProviders();

    await waitFor(() => {
      expect(mockSocket.on).toHaveBeenCalledWith('update', expect.any(Function));
    });
  });

  it('should refetch prompts when Socket.io update event is received', async () => {
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: [] }),
    });

    renderWithProviders();

    // Wait for initial fetch
    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalledTimes(1);
    });

    // Get the update handler that was registered
    const updateHandler = mockSocket.on.mock.calls.find(
      (call: [string, () => void]) => call[0] === 'update',
    )?.[1];

    expect(updateHandler).toBeDefined();

    // Simulate Socket.io update event
    if (updateHandler) {
      updateHandler();
    }

    // Wait for refetch
    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalledTimes(2);
    });
  });

  it('should disconnect socket on unmount', async () => {
    const { unmount } = renderWithProviders();

    await waitFor(() => {
      expect(mockSocket.on).toHaveBeenCalled();
    });

    unmount();

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it('should handle API errors gracefully', async () => {
    mockCallApi.mockRejectedValue(new Error('API Error'));

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByText('Failed to load prompts. Please try again.')).toBeInTheDocument();
    });
  });

  it('should not show loading state on background updates', async () => {
    mockCallApi.mockResolvedValue({
      json: () => Promise.resolve({ data: [{ id: '1', prompt: { raw: 'test' } }] }),
    });

    renderWithProviders();

    // Wait for initial fetch to complete
    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalledTimes(1);
    });

    // Verify loading state is gone after initial load
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    // Get the update handler
    const updateHandler = mockSocket.on.mock.calls.find(
      (call: [string, () => void]) => call[0] === 'update',
    )?.[1];

    // Trigger background update
    if (updateHandler) {
      updateHandler();
    }

    // Loading state should not appear for background updates
    await waitFor(() => {
      expect(mockCallApi).toHaveBeenCalledTimes(2);
    });

    // Should still not show loading (background update doesn't trigger loading state)
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
});
