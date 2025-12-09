import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useJobSocket } from './useJobSocket';

// Mock socket.io-client
const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

// Mock constants
vi.mock('@app/constants', () => ({
  IS_RUNNING_LOCALLY: true,
}));

// Mock the API config store
vi.mock('@app/stores/apiConfig', () => ({
  default: vi.fn((selector) => selector({ apiBaseUrl: 'http://localhost:3000' })),
}));

describe('useJobSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations
    mockSocket.on.mockImplementation(() => mockSocket);
    mockSocket.emit.mockImplementation(() => mockSocket);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize socket connection on mount', async () => {
      const socketIo = await import('socket.io-client');
      const ioSpy = vi.mocked(socketIo.io);

      renderHook(() =>
        useJobSocket({
          jobId: null,
          onUpdate: vi.fn(),
          onComplete: vi.fn(),
        }),
      );

      expect(ioSpy).toHaveBeenCalledWith('http://localhost:3000', {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
    });

    it('should register event handlers on socket', () => {
      renderHook(() =>
        useJobSocket({
          jobId: null,
          onUpdate: vi.fn(),
          onComplete: vi.fn(),
        }),
      );

      expect(mockSocket.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('connect_error', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('job:update', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('job:complete', expect.any(Function));
    });

    it('should disconnect socket on unmount', () => {
      const { unmount } = renderHook(() =>
        useJobSocket({
          jobId: null,
          onUpdate: vi.fn(),
          onComplete: vi.fn(),
        }),
      );

      unmount();

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe('connection state', () => {
    it('should start with isConnected false', () => {
      const { result } = renderHook(() =>
        useJobSocket({
          jobId: null,
          onUpdate: vi.fn(),
          onComplete: vi.fn(),
        }),
      );

      expect(result.current.isConnected).toBe(false);
    });

    it('should set isConnected true on connect event', async () => {
      let connectHandler: () => void;
      mockSocket.on.mockImplementation((event: string, handler: () => void) => {
        if (event === 'connect') {
          connectHandler = handler;
        }
        return mockSocket;
      });

      const { result } = renderHook(() =>
        useJobSocket({
          jobId: null,
          onUpdate: vi.fn(),
          onComplete: vi.fn(),
        }),
      );

      act(() => {
        connectHandler!();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });
    });

    it('should set isConnected false on disconnect event', async () => {
      let connectHandler: () => void;
      let disconnectHandler: () => void;
      mockSocket.on.mockImplementation((event: string, handler: () => void) => {
        if (event === 'connect') {
          connectHandler = handler;
        }
        if (event === 'disconnect') {
          disconnectHandler = handler;
        }
        return mockSocket;
      });

      const { result } = renderHook(() =>
        useJobSocket({
          jobId: null,
          onUpdate: vi.fn(),
          onComplete: vi.fn(),
        }),
      );

      // First connect
      act(() => {
        connectHandler!();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      // Then disconnect
      act(() => {
        disconnectHandler!();
      });

      await waitFor(() => {
        expect(result.current.isConnected).toBe(false);
      });
    });
  });

  describe('job subscription', () => {
    it('should subscribe to job when jobId is provided', () => {
      renderHook(() =>
        useJobSocket({
          jobId: 'job-123',
          onUpdate: vi.fn(),
          onComplete: vi.fn(),
        }),
      );

      expect(mockSocket.emit).toHaveBeenCalledWith('job:subscribe', 'job-123');
    });

    it('should not subscribe when jobId is null', () => {
      renderHook(() =>
        useJobSocket({
          jobId: null,
          onUpdate: vi.fn(),
          onComplete: vi.fn(),
        }),
      );

      expect(mockSocket.emit).not.toHaveBeenCalledWith('job:subscribe', expect.anything());
    });

    it('should unsubscribe from previous job when jobId changes', () => {
      const { rerender } = renderHook(
        ({ jobId }) =>
          useJobSocket({
            jobId,
            onUpdate: vi.fn(),
            onComplete: vi.fn(),
          }),
        { initialProps: { jobId: 'job-123' } },
      );

      // Change to new job
      rerender({ jobId: 'job-456' });

      expect(mockSocket.emit).toHaveBeenCalledWith('job:unsubscribe', 'job-123');
      expect(mockSocket.emit).toHaveBeenCalledWith('job:subscribe', 'job-456');
    });
  });

  describe('event callbacks', () => {
    it('should call onUpdate when job:update event is received', () => {
      const onUpdate = vi.fn();
      let updateHandler: (payload: unknown) => void;

      mockSocket.on.mockImplementation((event: string, handler: (payload: unknown) => void) => {
        if (event === 'job:update') {
          updateHandler = handler;
        }
        return mockSocket;
      });

      renderHook(() =>
        useJobSocket({
          jobId: 'job-123',
          onUpdate,
          onComplete: vi.fn(),
        }),
      );

      const payload = { status: 'in-progress', progress: 5, total: 10 };
      act(() => {
        updateHandler!(payload);
      });

      expect(onUpdate).toHaveBeenCalledWith(payload);
    });

    it('should call onComplete when job:complete event is received', () => {
      const onComplete = vi.fn();
      let completeHandler: (payload: unknown) => void;

      mockSocket.on.mockImplementation((event: string, handler: (payload: unknown) => void) => {
        if (event === 'job:complete') {
          completeHandler = handler;
        }
        return mockSocket;
      });

      renderHook(() =>
        useJobSocket({
          jobId: 'job-123',
          onUpdate: vi.fn(),
          onComplete,
        }),
      );

      const payload = { status: 'complete', evalId: 'eval-123' };
      act(() => {
        completeHandler!(payload);
      });

      expect(onComplete).toHaveBeenCalledWith(payload);
    });

    it('should call onError when connect_error event is received', () => {
      const onError = vi.fn();
      let errorHandler: (error: Error) => void;

      mockSocket.on.mockImplementation((event: string, handler: (error: Error) => void) => {
        if (event === 'connect_error') {
          errorHandler = handler;
        }
        return mockSocket;
      });

      renderHook(() =>
        useJobSocket({
          jobId: 'job-123',
          onUpdate: vi.fn(),
          onComplete: vi.fn(),
          onError,
        }),
      );

      const error = new Error('Connection failed');
      act(() => {
        errorHandler!(error);
      });

      expect(onError).toHaveBeenCalledWith(error);
    });
  });

  describe('manual subscribe/unsubscribe', () => {
    it('should provide subscribe function', () => {
      const { result } = renderHook(() =>
        useJobSocket({
          jobId: null,
          onUpdate: vi.fn(),
          onComplete: vi.fn(),
        }),
      );

      act(() => {
        result.current.subscribe('manual-job-123');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('job:subscribe', 'manual-job-123');
    });

    it('should provide unsubscribe function', () => {
      const { result } = renderHook(() =>
        useJobSocket({
          jobId: 'job-123',
          onUpdate: vi.fn(),
          onComplete: vi.fn(),
        }),
      );

      act(() => {
        result.current.unsubscribe('job-123');
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('job:unsubscribe', 'job-123');
    });
  });

  describe('reconnection', () => {
    it('should re-subscribe to current job on reconnect', () => {
      let connectHandler: () => void;
      mockSocket.on.mockImplementation((event: string, handler: () => void) => {
        if (event === 'connect') {
          connectHandler = handler;
        }
        return mockSocket;
      });

      renderHook(() =>
        useJobSocket({
          jobId: 'job-123',
          onUpdate: vi.fn(),
          onComplete: vi.fn(),
        }),
      );

      // Clear previous calls
      mockSocket.emit.mockClear();

      // Simulate reconnection
      act(() => {
        connectHandler!();
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('job:subscribe', 'job-123');
    });
  });
});
