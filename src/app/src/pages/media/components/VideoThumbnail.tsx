import { useState } from 'react';

import { Skeleton } from '@app/components/ui/skeleton';
import { cn } from '@app/lib/utils';
import { Play, Video } from 'lucide-react';
import { useVideoThumbnail } from '../hooks/useVideoThumbnail';

interface VideoThumbnailProps {
  /** Full URL to the video file */
  videoUrl: string;
  /** Unique hash for caching */
  hash: string;
  /** Whether to load the thumbnail (for lazy loading with IntersectionObserver) */
  isVisible?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Displays a video thumbnail with loading state and fallback.
 * Automatically generates thumbnails from video files and caches them.
 */
export function VideoThumbnail({
  videoUrl,
  hash,
  isVisible = true,
  className,
}: VideoThumbnailProps) {
  const { thumbnail, isLoading, error } = useVideoThumbnail(videoUrl, hash, isVisible);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Show fallback icon if there's an error or thumbnail hasn't loaded yet
  const showFallback = error || !thumbnail;

  return (
    <div
      className={cn(
        'relative h-full w-full',
        'bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30',
        className,
      )}
    >
      {/* Loading skeleton */}
      {isLoading && <Skeleton className="absolute inset-0 rounded-none" />}

      {/* Thumbnail image */}
      {thumbnail && !error && (
        <img
          src={thumbnail}
          alt="Video thumbnail"
          className={cn(
            'h-full w-full object-cover transition-opacity duration-200',
            imageLoaded ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={() => setImageLoaded(true)}
        />
      )}

      {/* Fallback icon */}
      {showFallback && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative">
            <Video className="h-12 w-12 text-blue-400 dark:text-blue-500" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-full bg-white/90 dark:bg-zinc-800/90 p-1.5 shadow-sm">
                <Play
                  className="h-4 w-4 text-blue-600 dark:text-blue-400 ml-0.5"
                  fill="currentColor"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Play button overlay for thumbnails */}
      {thumbnail && imageLoaded && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="rounded-full bg-black/50 p-3 backdrop-blur-sm transition-transform group-hover:scale-110">
            <Play className="h-6 w-6 text-white ml-0.5" fill="currentColor" />
          </div>
        </div>
      )}
    </div>
  );
}
