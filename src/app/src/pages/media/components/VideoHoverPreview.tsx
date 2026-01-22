import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@app/lib/utils';
import { Pause, Play } from 'lucide-react';
import { useHoverIntent } from '../hooks/useHoverIntent';
import { VideoThumbnail } from './VideoThumbnail';

interface VideoHoverPreviewProps {
  /** Full URL to the video file */
  videoUrl: string;
  /** Unique hash for caching thumbnails */
  hash: string;
  /** Whether the card is visible (for lazy loading) */
  isVisible?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Check if the device supports hover (not a touch-only device)
 */
function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    // Check for touch capability and no hover support
    const mediaQuery = window.matchMedia('(hover: none)');
    setIsTouch(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return isTouch;
}

/**
 * Video preview component that shows a thumbnail and plays video on hover.
 * Features:
 * - Generates and caches video thumbnails
 * - Plays video on intentional hover (300ms delay) on desktop
 * - Tap to play/pause on touch devices
 * - Respects prefers-reduced-motion
 */
export function VideoHoverPreview({
  videoUrl,
  hash,
  isVisible = true,
  className,
}: VideoHoverPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [isTouchPlaying, setIsTouchPlaying] = useState(false);
  const isTouchDevice = useIsTouchDevice();

  const { isIntentional, hoverProps } = useHoverIntent({
    delay: 300,
    respectReducedMotion: true,
  });

  // Handle video playback based on hover state (desktop) or touch state (mobile)
  const shouldPlay = isTouchDevice ? isTouchPlaying : isIntentional && isVideoLoaded;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    if (shouldPlay && isVideoLoaded) {
      // Start playing from the beginning
      video.currentTime = 0;
      video.play().catch(() => {
        // Autoplay may be blocked, silently fail
      });
      setIsVideoPlaying(true);
    } else {
      video.pause();
      video.currentTime = 0;
      setIsVideoPlaying(false);
    }
  }, [shouldPlay, isVideoLoaded]);

  // Preload video when we detect hover (before intentional)
  const handleVideoCanPlay = useCallback(() => {
    setIsVideoLoaded(true);
  }, []);

  // Handle tap on touch devices
  const handlePlayButtonClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsTouchPlaying((prev) => !prev);
  }, []);

  return (
    <div className={cn('relative h-full w-full overflow-hidden', className)} {...hoverProps}>
      {/* Thumbnail (always rendered as base layer) */}
      <div
        className={cn(
          'absolute inset-0 transition-opacity duration-200',
          isVideoPlaying ? 'opacity-0' : 'opacity-100',
        )}
      >
        <VideoThumbnail videoUrl={videoUrl} hash={hash} isVisible={isVisible} />
      </div>

      {/* Video element (loaded on hover) */}
      <video
        ref={videoRef}
        src={videoUrl}
        className={cn(
          'h-full w-full object-cover transition-opacity duration-200',
          isVideoPlaying ? 'opacity-100' : 'opacity-0',
        )}
        muted
        loop
        playsInline
        preload="none"
        onCanPlay={handleVideoCanPlay}
        aria-hidden="true"
      />

      {/* Play/Pause button overlay */}
      <div
        className={cn(
          'absolute inset-0 flex items-center justify-center',
          'transition-opacity duration-200',
          // On touch devices: always show when not playing, hide when playing
          // On hover devices: controlled by hover state
          isTouchDevice
            ? isVideoPlaying
              ? 'opacity-0 pointer-events-none'
              : 'opacity-100'
            : isVideoPlaying
              ? 'opacity-0 pointer-events-none'
              : 'opacity-100 pointer-events-none',
        )}
      >
        <button
          type="button"
          onClick={handlePlayButtonClick}
          className={cn(
            'rounded-full bg-black/50 p-3 backdrop-blur-sm',
            'transition-transform duration-200',
            'group-hover:scale-110',
            // Make clickable on touch devices
            isTouchDevice ? 'pointer-events-auto cursor-pointer hover:bg-black/60' : '',
          )}
          aria-label={isVideoPlaying ? 'Pause video preview' : 'Play video preview'}
        >
          <Play className="h-6 w-6 text-white ml-0.5" fill="currentColor" />
        </button>
      </div>

      {/* Playing indicator with pause button on touch devices */}
      {isVideoPlaying && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1">
          {isTouchDevice ? (
            <button
              type="button"
              onClick={handlePlayButtonClick}
              className="flex items-center gap-1 px-2 py-1 bg-black/60 rounded text-white text-xs hover:bg-black/70 transition-colors"
              aria-label="Pause video preview"
            >
              <Pause className="h-3 w-3" fill="currentColor" />
              <span>Tap to pause</span>
            </button>
          ) : (
            <div className="flex items-center gap-1 px-2 py-1 bg-black/60 rounded text-white text-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
              <span>Playing</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
