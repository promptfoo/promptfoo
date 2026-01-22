import { useMemo } from 'react';

import { cn } from '@app/lib/utils';
import { hashToNumber } from '@app/utils/media';
import { Music } from 'lucide-react';

interface AudioWaveformProps {
  /** Content hash used to generate deterministic bar heights */
  hash: string;
  /** Whether audio is currently playing (enables animation) */
  isPlaying?: boolean;
  /** Number of bars in the waveform visualization */
  barCount?: number;
  /** Width of each bar in pixels */
  barWidth?: number;
  /** Minimum height of bars in pixels */
  minBarHeight?: number;
  /** Maximum height of bars in pixels */
  maxBarHeight?: number;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show the music icon above the waveform */
  showIcon?: boolean;
  /** Size of the music icon */
  iconSize?: string;
}

/**
 * Audio waveform visualization with deterministic bar heights based on content hash.
 * Used in both MediaCard (compact) and MediaModal (expanded) views.
 */
export function AudioWaveform({
  hash,
  isPlaying = false,
  barCount = 7,
  barWidth = 4,
  minBarHeight = 8,
  maxBarHeight = 24,
  className,
  showIcon = false,
  iconSize = 'h-10 w-10',
}: AudioWaveformProps) {
  // Generate deterministic bar heights from hash
  const bars = useMemo(() => {
    const seed = hashToNumber(hash);
    return Array.from({ length: barCount }, (_, i) => {
      // Use different bits of the seed for each bar, combined with sine wave for visual interest
      const hashValue = ((seed >> ((i * 3) % 28)) & 0xf) / 15; // 0-1 range
      const sineComponent = Math.sin((i * Math.PI) / (barCount / 2)) * 0.3 + 0.5; // Smooth wave pattern
      const combined = hashValue * 0.6 + sineComponent * 0.4;
      return minBarHeight + combined * (maxBarHeight - minBarHeight);
    });
  }, [hash, barCount, minBarHeight, maxBarHeight]);

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      {showIcon && <Music className={cn(iconSize, 'text-purple-400 dark:text-purple-500')} />}
      <div className="flex items-end" style={{ gap: `${Math.max(1, barWidth / 4)}px` }}>
        {bars.map((height, i) => (
          <div
            key={i}
            className={cn(
              'bg-purple-300 dark:bg-purple-600 rounded-full transition-all duration-150',
              isPlaying && 'animate-pulse',
            )}
            style={{
              width: `${barWidth}px`,
              height: `${height}px`,
              animationDelay: isPlaying ? `${i * 50}ms` : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Compact audio preview for use in card grid views.
 * Shows a music icon with a small waveform below.
 */
export function AudioPreview({ hash }: { hash: string }) {
  return (
    <div className="flex h-full items-center justify-center bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
      <AudioWaveform
        hash={hash}
        barCount={7}
        barWidth={4}
        minBarHeight={8}
        maxBarHeight={24}
        showIcon
        iconSize="h-10 w-10"
      />
    </div>
  );
}
