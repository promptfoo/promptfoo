import { renderHook, act } from '@testing-library/react';
import { callApi } from '@app/utils/api';
import type { TelemetryEventTypes } from '@promptfoo/telemetry';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useTelemetry } from './useTelemetry';

vi.mock('@app/utils/api', () => ({
  callApi: vi.fn(),
}));

const TEST_EVENT: TelemetryEventTypes = 'command_used';
const TEST_PROPS = { foo: 'bar' };

describe('useTelemetry', () => {
  const originalEnv = import.meta.env.VITE_PROMPTFOO_DISABLE_TELEMETRY;
  const consoleError = console.error;

  beforeEach(() => {
    vi.clearAllMocks();
    console.error = vi.fn();
  });

  afterEach(() => {
    import.meta.env.VITE_PROMPTFOO_DISABLE_TELEMETRY = originalEnv;
    console.error = consoleError;
  });

  it('calls callApi when telemetry is enabled', async () => {
    import.meta.env.VITE_PROMPTFOO_DISABLE_TELEMETRY = 'false';
    const { result } = renderHook(() => useTelemetry());

    await act(async () => {
      await result.current.recordEvent(TEST_EVENT, TEST_PROPS);
    });

    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it('does not call callApi when telemetry is disabled', async () => {
    import.meta.env.VITE_PROMPTFOO_DISABLE_TELEMETRY = 'true';
    const { result } = renderHook(() => useTelemetry());

    await act(async () => {
      await result.current.recordEvent(TEST_EVENT, TEST_PROPS);
    });

    expect(callApi).not.toHaveBeenCalled();
  });

  it('logs error when callApi rejects', async () => {
    import.meta.env.VITE_PROMPTFOO_DISABLE_TELEMETRY = 'false';
    vi.mocked(callApi).mockRejectedValueOnce(new Error('network'));
    const { result } = renderHook(() => useTelemetry());

    await act(async () => {
      await result.current.recordEvent(TEST_EVENT, TEST_PROPS);
    });

    expect(console.error).toHaveBeenCalledWith(
      'Failed to record telemetry event:',
      expect.any(Error),
    );
  });
});
