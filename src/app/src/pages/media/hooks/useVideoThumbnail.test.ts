import { type TestTimers, useTestTimers } from '@app/tests/timers';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVideoThumbnail } from './useVideoThumbnail';

// Mock the cache module
vi.mock('./useThumbnailCache', () => ({
  getThumbnail: vi.fn(),
  setThumbnail: vi.fn(),
}));

import { getThumbnail, setThumbnail } from './useThumbnailCache';

const MOCK_DATA_URL = 'data:image/jpeg;base64,mockbase64data';

/**
 * Creates a mock video element that simulates the browser's video loading lifecycle.
 * Returns the mock and helpers to trigger events (loadeddata, seeked, error).
 */
function createMockVideo() {
  const listeners: Record<string, EventListener> = {};
  const mock = {
    src: '',
    crossOrigin: null as string | null,
    preload: '',
    muted: false,
    playsInline: false,
    currentTime: 0,
    duration: 10,
    videoWidth: 640,
    videoHeight: 480,
    onloadeddata: null as ((e: Event) => void) | null,
    onseeked: null as ((e: Event) => void) | null,
    onerror: null as ((e: Event) => void) | null,
    onabort: null as ((e: Event) => void) | null,
    pause: vi.fn(),
    load: vi.fn(),
    remove: vi.fn(),
    addEventListener: vi.fn((event: string, listener: EventListener) => {
      listeners[event] = listener;
    }),
    removeEventListener: vi.fn((event: string) => {
      delete listeners[event];
    }),
  };

  return {
    element: mock as unknown as HTMLVideoElement,
    fireLoadedData: () => mock.onloadeddata?.(new Event('loadeddata')),
    fireSeeked: () => mock.onseeked?.(new Event('seeked')),
    fireError: () => mock.onerror?.(new Event('error')),
    mock,
  };
}

function createMockCanvas() {
  const drawImage = vi.fn();
  const mock = {
    width: 0,
    height: 0,
    getContext: vi.fn((_id: string): { drawImage: typeof drawImage } | null => ({ drawImage })),
    toDataURL: vi.fn((_type: string, _quality?: number) => MOCK_DATA_URL),
  };
  return { element: mock as unknown as HTMLCanvasElement, drawImage, mock };
}

describe('useVideoThumbnail', () => {
  let mockVideo: ReturnType<typeof createMockVideo>;
  let mockCanvas: ReturnType<typeof createMockCanvas>;
  let originalCreateElement: typeof document.createElement;
  let timers: TestTimers | undefined;

  beforeEach(() => {
    vi.clearAllMocks();

    mockVideo = createMockVideo();
    mockCanvas = createMockCanvas();

    // Default: cache miss
    vi.mocked(getThumbnail).mockResolvedValue(null);
    vi.mocked(setThumbnail).mockResolvedValue(undefined);

    originalCreateElement = document.createElement.bind(document);
    document.createElement = vi.fn((tagName: string) => {
      if (tagName === 'video') {
        return mockVideo.element;
      }
      if (tagName === 'canvas') {
        return mockCanvas.element;
      }
      return originalCreateElement(tagName);
    }) as typeof document.createElement;
  });

  afterEach(() => {
    timers?.restore({ runPending: true });
    timers = undefined;
    document.createElement = originalCreateElement;
    vi.restoreAllMocks();
  });

  it('returns a cached thumbnail without generating a new one', async () => {
    vi.mocked(getThumbnail).mockResolvedValue('data:image/jpeg;base64,cached');

    const { result } = renderHook(() => useVideoThumbnail('/video.mp4', 'hash1'));

    await waitFor(() => {
      expect(result.current.thumbnail).toBe('data:image/jpeg;base64,cached');
      expect(result.current.isLoading).toBe(false);
    });

    // Should not have created a video element for generation
    expect(document.createElement).not.toHaveBeenCalledWith('video');
  });

  it('generates a thumbnail on cache miss via loadeddata → seeked lifecycle', async () => {
    const { result } = renderHook(() => useVideoThumbnail('/video.mp4', 'hash2'));

    // Wait for cache check to complete and video element to be created
    await waitFor(() => {
      expect(document.createElement).toHaveBeenCalledWith('video');
    });

    // Simulate the browser video lifecycle: loadeddata → seek → seeked
    act(() => {
      mockVideo.fireLoadedData();
    });

    // After loadeddata, hook should have set currentTime (seek to 0.5s)
    expect(mockVideo.mock.currentTime).toBe(0.5);

    act(() => {
      mockVideo.fireSeeked();
    });

    // After seeked, canvas captures the frame
    await waitFor(() => {
      expect(result.current.thumbnail).toBe(MOCK_DATA_URL);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    // Should have cached the result
    expect(setThumbnail).toHaveBeenCalledWith('hash2', MOCK_DATA_URL);
  });

  it('seeks to 10% of duration for short videos', async () => {
    mockVideo.mock.duration = 2; // 2s video → min(0.5, 2*0.1) = 0.2s

    renderHook(() => useVideoThumbnail('/short.mp4', 'hash-short'));

    await waitFor(() => {
      expect(document.createElement).toHaveBeenCalledWith('video');
    });

    act(() => {
      mockVideo.fireLoadedData();
    });

    expect(mockVideo.mock.currentTime).toBe(0.2);
  });

  it('aborts generation when component unmounts', async () => {
    const { result, unmount } = renderHook(() => useVideoThumbnail('/video.mp4', 'hash3'));

    await waitFor(() => {
      expect(document.createElement).toHaveBeenCalledWith('video');
    });

    // Unmount triggers the abort controller
    unmount();

    // Events arriving after unmount should be no-ops due to isCleanedUp guard
    act(() => {
      mockVideo.fireLoadedData();
      mockVideo.fireSeeked();
    });

    expect(result.current.thumbnail).toBeNull();
  });

  it('sets error state when video fails to load', async () => {
    const { result } = renderHook(() => useVideoThumbnail('/bad.mp4', 'hash-err'));

    await waitFor(() => {
      expect(document.createElement).toHaveBeenCalledWith('video');
    });

    act(() => {
      mockVideo.fireError();
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load video');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.thumbnail).toBeNull();
    });
  });

  it('sets error when canvas context is unavailable', async () => {
    mockCanvas.mock.getContext.mockReturnValue(null);

    const { result } = renderHook(() => useVideoThumbnail('/video.mp4', 'hash-no-ctx'));

    await waitFor(() => {
      expect(document.createElement).toHaveBeenCalledWith('video');
    });

    act(() => {
      mockVideo.fireLoadedData();
    });
    act(() => {
      mockVideo.fireSeeked();
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Could not get canvas context');
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('times out after 10 seconds', async () => {
    const testTimers = useTestTimers();
    timers = testTimers;

    const { result } = renderHook(() => useVideoThumbnail('/slow.mp4', 'hash-timeout'));

    // Flush microtasks so the async chain (useEffect → cache check →
    // concurrency acquire → generateThumbnail) completes and the
    // 10s setTimeout is registered. Wrap in act so React processes
    // any state updates triggered during flushing.
    await act(async () => {
      await testTimers.advanceByAsync(100);
    });

    // Video element should now be created and waiting for events
    expect(document.createElement).toHaveBeenCalledWith('video');

    // Advance past the 10s timeout without firing any video events
    await act(async () => {
      await testTimers.advanceByAsync(10_000);
    });

    expect(result.current.error).toBe('Thumbnail generation timed out');
    expect(result.current.isLoading).toBe(false);
  });

  it('does not generate when enabled is false', () => {
    const { result } = renderHook(() => useVideoThumbnail('/video.mp4', 'hash-disabled', false));

    expect(result.current.thumbnail).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(getThumbnail).not.toHaveBeenCalled();
    expect(document.createElement).not.toHaveBeenCalledWith('video');
  });

  it('does not generate when videoUrl is empty', () => {
    const { result } = renderHook(() => useVideoThumbnail('', 'hash-empty'));

    expect(result.current.thumbnail).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(getThumbnail).not.toHaveBeenCalled();
  });

  it('cleans up video resources after successful generation', async () => {
    renderHook(() => useVideoThumbnail('/video.mp4', 'hash-cleanup'));

    await waitFor(() => {
      expect(document.createElement).toHaveBeenCalledWith('video');
    });

    act(() => {
      mockVideo.fireLoadedData();
    });
    act(() => {
      mockVideo.fireSeeked();
    });

    await waitFor(() => {
      expect(mockVideo.mock.pause).toHaveBeenCalled();
      expect(mockVideo.mock.remove).toHaveBeenCalled();
      expect(mockVideo.mock.onloadeddata).toBeNull();
      expect(mockVideo.mock.onseeked).toBeNull();
      expect(mockVideo.mock.onerror).toBeNull();
    });
  });

  it('silently ignores cache write failures', async () => {
    vi.mocked(setThumbnail).mockRejectedValue(new Error('IndexedDB full'));

    const { result } = renderHook(() => useVideoThumbnail('/video.mp4', 'hash-cache-fail'));

    await waitFor(() => {
      expect(document.createElement).toHaveBeenCalledWith('video');
    });

    act(() => {
      mockVideo.fireLoadedData();
    });
    act(() => {
      mockVideo.fireSeeked();
    });

    await waitFor(() => {
      expect(result.current.thumbnail).toBe(MOCK_DATA_URL);
      expect(result.current.error).toBeNull();
    });
  });
});
