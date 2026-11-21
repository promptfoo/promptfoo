import { useMemo } from 'react';

import { cn } from '@app/lib/utils';
import { hashToNumber } from '@app/utils/media';
import { Music } from 'lucide-react';

const sizes = {
  compact: { barCount: 7, barWidth: 4, minBarHeight: 8, maxBarHeight: 24, iconSize: 'h-10 w-10' },
  expanded: {
    barCount: 12,
    barWidth: 8,
    minBarHeight: 16,
    maxBarHeight: 48,
    iconSize: 'h-16 w-16',
  },
};

interface AudioWaveformProps {
  /** Content hash used to generate deterministic bar heights */
  hash: string;
  isPlaying: boolean;
  size: keyof typeof sizes;
}

/**
 * Audio waveform visualization with deterministic bar heights based on content hash.
 * Used in both MediaCard (compact) and MediaModal (expanded) views.
 */
export function AudioWaveform({ hash, isPlaying, size }: AudioWaveformProps) {
  const { barCount, barWidth, minBarHeight, maxBarHeight, iconSize } = sizes[size];
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
    <div className="flex flex-col items-center gap-2">
      <Music className={cn(iconSize, 'text-purple-400 dark:text-purple-500')} />
      <div className="flex items-end" style={{ gap: `${barWidth / 4}px` }}>
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
