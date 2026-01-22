import { useEffect, useState } from 'react';

import { getThumbnail, setThumbnail } from './useThumbnailCache';

interface UseVideoThumbnailResult {
  thumbnail: string | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Configuration for thumbnail generation
 */
const THUMBNAIL_SEEK_TIME = 0.5; // Seconds into video to capture
const THUMBNAIL_QUALITY = 0.7; // JPEG quality (0-1)
const GENERATION_TIMEOUT = 10000; // 10 seconds timeout

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

    const loadThumbnail = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Check cache first
        const cached = await getThumbnail(hash);
        if (cached) {
          if (!abortController.signal.aborted) {
            setThumbnailState(cached);
            setIsLoading(false);
          }
          return;
        }

        // Generate new thumbnail with abort support
        const generated = await generateThumbnail(videoUrl, abortController.signal);
        if (!abortController.signal.aborted) {
          setThumbnailState(generated);
          // Cache for future use (don't await - fire and forget)
          setThumbnail(hash, generated).catch(() => {
            // Silently ignore cache write errors
          });
        }
      } catch (err) {
        // Ignore abort errors - they're expected on cleanup
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }
        if (!abortController.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to generate thumbnail');
        }
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    loadThumbnail();

    return () => {
      abortController.abort();
    };
  }, [videoUrl, hash, enabled]);

  return { thumbnail, isLoading, error };
}
