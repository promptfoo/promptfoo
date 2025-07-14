import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import CloudStatusIndicator from './CloudStatusIndicator';

vi.mock('@app/hooks/useCloudAuth', () => ({
  useCloudAuth: vi.fn(),
}));

vi.mock('@app/hooks/useTelemetry', () => ({
  useTelemetry: vi.fn(),
}));

import { useCloudAuth } from '@app/hooks/useCloudAuth';
import { useTelemetry } from '@app/hooks/useTelemetry';

describe('CloudStatusIndicator', () => {
  const mockRecordEvent = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.window.open = vi.fn();

    vi.mocked(useTelemetry).mockReturnValue({
      recordEvent: mockRecordEvent,
      identifyUser: vi.fn(),
      isInitialized: true,
    });
  });

  it('should render IconButton with color inherit when not authenticated, not loading, and no error', () => {
    vi.mocked(useCloudAuth).mockReturnValue({
      isAuthenticated: false,
      hasApiKey: false,
      appUrl: null,
      isEnterprise: false,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<CloudStatusIndicator />);

    const button = screen.getByRole('button');
    expect(button).toHaveClass('MuiIconButton-colorInherit');
  });
});
