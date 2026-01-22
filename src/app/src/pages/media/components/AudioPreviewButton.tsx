import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@app/lib/utils';
import { Pause, Play, Volume2 } from 'lucide-react';
import { AudioWaveform } from './AudioWaveform';

interface AudioPreviewButtonProps {
  /** Full URL to the audio file */
  audioUrl: string;
  /** Unique hash for waveform generation */
  hash: string;
  /** Preview duration in milliseconds */
  previewDuration?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Audio preview component with play button overlay.
 * Features:
 * - Plays audio preview on click (not hover, to avoid being jarring)
 * - Shows animated waveform while playing
 * - Auto-stops after preview duration
 * - Fades out at the end
 */
export function AudioPreviewButton({
  audioUrl,
  hash,
  previewDuration = 5000,
  className,
}: AudioPreviewButtonProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const fadeIntervalRef = useRef<number | undefined>(undefined);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (fadeIntervalRef.current !== undefined) {
        clearInterval(fadeIntervalRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
      }
    };
  }, []);

  const fadeOutAndStop = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    // Fade out over 500ms
    const startVolume = audio.volume;
    const fadeSteps = 10;
    const stepDuration = 500 / fadeSteps;
    let currentStep = 0;

    fadeIntervalRef.current = window.setInterval(() => {
      currentStep++;
      audio.volume = Math.max(0, startVolume * (1 - currentStep / fadeSteps));

      if (currentStep >= fadeSteps) {
        if (fadeIntervalRef.current !== undefined) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = undefined;
        }
        audio.pause();
        audio.currentTime = 0;
        audio.volume = startVolume;
        setIsPlaying(false);
      }
    }, stepDuration);
  }, []);

  const togglePlay = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();

      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      if (isPlaying) {
        // Stop immediately
        if (fadeIntervalRef.current !== undefined) {
          clearInterval(fadeIntervalRef.current);
          fadeIntervalRef.current = undefined;
        }
        audio.pause();
        audio.currentTime = 0;
        setIsPlaying(false);
      } else {
        // Start playing
        audio.currentTime = 0;
        audio.volume = 0.7; // Start at 70% volume
        audio.play().catch(() => {
          // Autoplay may be blocked
        });
        setIsPlaying(true);

        // Schedule fade out
        setTimeout(() => {
          fadeOutAndStop();
        }, previewDuration - 500); // Start fade 500ms before end
      }
    },
    [isPlaying, previewDuration, fadeOutAndStop],
  );

  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  return (
    <div
      className={cn(
        'relative h-full w-full flex items-center justify-center',
        'bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30',
        className,
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Hidden audio element */}
      <audio ref={audioRef} src={audioUrl} preload="none" onEnded={handleAudioEnded} />

      {/* Waveform visualization */}
      <AudioWaveform
        hash={hash}
        isPlaying={isPlaying}
        barCount={7}
        barWidth={4}
        minBarHeight={8}
        maxBarHeight={24}
        showIcon
        iconSize="h-10 w-10"
      />

      {/* Play/Pause button overlay */}
      <button
        onClick={togglePlay}
        className={cn(
          'absolute inset-0 flex items-center justify-center',
          'transition-opacity duration-200',
          isHovering || isPlaying ? 'opacity-100' : 'opacity-0',
        )}
        aria-label={isPlaying ? 'Pause audio preview' : 'Play audio preview'}
      >
        <div
          className={cn(
            'rounded-full bg-purple-600/80 dark:bg-purple-500/80 p-3 backdrop-blur-sm',
            'transition-all duration-200',
            'hover:bg-purple-600 dark:hover:bg-purple-500 hover:scale-110',
            'shadow-lg',
          )}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5 text-white" fill="currentColor" />
          ) : (
            <Play className="h-5 w-5 text-white ml-0.5" fill="currentColor" />
          )}
        </div>
      </button>

      {/* Playing indicator */}
      {isPlaying && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 px-2 py-1 bg-purple-600/80 rounded text-white text-xs">
          <Volume2 className="h-3 w-3" />
          <span>Preview</span>
        </div>
      )}

      {/* Hover hint */}
      {isHovering && !isPlaying && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/60 rounded text-white text-xs whitespace-nowrap">
          Click to preview
        </div>
      )}
    </div>
  );
}
