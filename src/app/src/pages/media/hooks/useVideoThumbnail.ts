import { useEffect, useState } from 'react';

import { getThumbnail, setThumbnail } from './useThumbnailCache';

interface UseVideoThumbnailResult {
  thumbnail: string | null;
  isLoading: boolean;
  error: string | null;
}

interface ThumbnailLoadState {
  setThumbnailState: (thumbnail: string) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
}

/**
 * Configuration for thumbnail generation
 */
const THUMBNAIL_SEEK_TIME = 0.5; // Seconds into video to capture
const THUMBNAIL_QUALITY = 0.7; // JPEG quality (0-1)
const GENERATION_TIMEOUT = 10000; // 10 seconds timeout
const MAX_CONCURRENT_GENERATIONS = 3; // Limit concurrent video element creations

/**
 * Simple concurrency limiter to prevent creating too many video elements at once.
 * Shared across all useVideoThumbnail instances.
 * Uses closure-based state to avoid `this` binding pitfalls.
 */
const concurrencyQueue = (() => {
  let active = 0;
  const waiting: Array<() => void> = [];
  return {
    async acquire(): Promise<void> {
      if (active < MAX_CONCURRENT_GENERATIONS) {
        active++;
        return;
      }
      return new Promise<void>((resolve) => {
        waiting.push(resolve);
      });
    },
    release(): void {
      active--;
      const next = waiting.shift();
      if (next) {
        active++;
        next();
      }
    },
  };
})();

/**
 * Generates a thumbnail from a video URL by capturing a frame.
 * Supports cancellation via AbortSignal to prevent memory leaks.
 */
async function generateThumbnail(videoUrl: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    // Check if already aborted before starting
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const video = document.createElement('video');
    let isCleanedUp = false;

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error('Thumbnail generation timed out'));
    }, GENERATION_TIMEOUT);

    const cleanup = () => {
      if (isCleanedUp) {
        return;
      }
      isCleanedUp = true;

      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', handleAbort);

      // Remove all event listeners
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.onabort = null;

      // Stop loading and release resources
      video.pause();
      video.src = '';
      video.load();
      // Remove from DOM if somehow attached (shouldn't be, but defensive)
      video.remove();
    };

    const handleAbort = () => {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    signal?.addEventListener('abort', handleAbort);

    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => {
      if (isCleanedUp) {
        return;
      }
      // Seek to a frame that's likely not black
      // Use 0.5s or 10% of duration, whichever is smaller
      const seekTime = Math.min(THUMBNAIL_SEEK_TIME, video.duration * 0.1);
      video.currentTime = seekTime;
    };

    video.onseeked = () => {
      if (isCleanedUp) {
        return;
      }
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY);

        cleanup();
        resolve(dataUrl);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to load video'));
    };

    video.src = videoUrl;
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function loadCachedThumbnail(
  hash: string,
  signal: AbortSignal,
  state: ThumbnailLoadState,
): Promise<boolean> {
  const cached = await getThumbnail(hash);
  if (!cached) {
    return false;
  }

  if (!signal.aborted) {
    state.setThumbnailState(cached);
    state.setIsLoading(false);
  }

  return true;
}

async function generateAndCacheThumbnail(
  videoUrl: string,
  hash: string,
  signal: AbortSignal,
  state: ThumbnailLoadState,
): Promise<void> {
  await concurrencyQueue.acquire();
  if (signal.aborted) {
    concurrencyQueue.release();
    return;
  }

  try {
    const generated = await generateThumbnail(videoUrl, signal);
    if (signal.aborted) {
      return;
    }

    state.setThumbnailState(generated);
    setThumbnail(hash, generated).catch(() => {
      // Silently ignore cache write errors
    });
  } finally {
    concurrencyQueue.release();
  }
}

async function runThumbnailLoad(
  videoUrl: string,
  hash: string,
  signal: AbortSignal,
  state: ThumbnailLoadState,
): Promise<void> {
  state.setIsLoading(true);
  state.setError(null);

  try {
    if (await loadCachedThumbnail(hash, signal, state)) {
      return;
    }

    await generateAndCacheThumbnail(videoUrl, hash, signal, state);
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }

    if (!signal.aborted) {
      state.setError(error instanceof Error ? error.message : 'Failed to generate thumbnail');
    }
  } finally {
    if (!signal.aborted) {
      state.setIsLoading(false);
    }
  }
}

/**
 * Hook to generate and cache video thumbnails.
 *
 * @param videoUrl - Full URL to the video file
 * @param hash - Unique hash for caching
 * @param enabled - Whether to generate the thumbnail (for lazy loading)
 */
export function useVideoThumbnail(
  videoUrl: string,
  hash: string,
  enabled = true,
): UseVideoThumbnailResult {
  const [thumbnail, setThumbnailState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !videoUrl || !hash) {
      return;
    }

    const abortController = new AbortController();
    runThumbnailLoad(videoUrl, hash, abortController.signal, {
      setThumbnailState,
      setIsLoading,
      setError,
    });

    return () => {
      abortController.abort();
    };
  }, [videoUrl, hash, enabled]);

  return { thumbnail, isLoading, error };
}
