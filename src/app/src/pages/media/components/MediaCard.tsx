import { useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@app/components/ui/badge';
import { Skeleton } from '@app/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import { getApiBaseUrl } from '@app/utils/api';
import { downloadMediaItem, formatBytes, getKindIcon, getKindLabel } from '@app/utils/media';
import { Check, CheckCircle, Download, Music, Video, XCircle } from 'lucide-react';
import { AudioPreviewButton } from './AudioPreviewButton';
import { VideoHoverPreview } from './VideoHoverPreview';

import type { MediaItem } from '../types';

interface MediaCardProps {
  item: MediaItem;
  onClick: () => void;
  tabIndex?: number;
  onFocus?: () => void;
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (hash: string) => void;
  isFocused?: boolean;
  /** Whether this item is currently being viewed in the modal */
  isViewing?: boolean;
}

export function MediaCard({
  item,
  onClick,
  tabIndex = 0,
  onFocus,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelection,
  isFocused = false,
  isViewing = false,
}: MediaCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Build the full media URL including API base for dev mode
  const mediaUrl = useMemo(() => {
    const baseUrl = getApiBaseUrl();
    return `${baseUrl}${item.url}`;
  }, [item.url]);

  // Use IntersectionObserver to detect when card is visible
  useEffect(() => {
    const card = cardRef.current;
    if (!card) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsVisible(true);
          // Once visible, no need to observe anymore
          observer.disconnect();
        }
      },
      {
        root: null,
        rootMargin: '100px', // Start loading slightly before visible
        threshold: 0,
      },
    );

    observer.observe(card);

    return () => {
      observer.disconnect();
    };
  }, []);

  const KindIcon = getKindIcon(item.kind);
  const isPlayable = item.kind === 'video' || item.kind === 'audio';
  const isDownloadOnly = item.kind === 'other';

  const handleClick = () => {
    if (isSelectionMode && onToggleSelection) {
      onToggleSelection(item.hash);
      return;
    }
    if (isDownloadOnly) {
      // For unknown types, trigger download
      downloadMediaItem(mediaUrl, item.hash, item.mimeType);
    } else {
      onClick();
    }
  };

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleSelection?.(item.hash);
  };

  const handleDownloadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    downloadMediaItem(mediaUrl, item.hash, item.mimeType);
  };

  return (
    <div
      ref={cardRef}
      className={cn(
        'group relative rounded-xl border bg-card',
        'cursor-pointer transition-all duration-200',
        'hover:border-primary/50 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        isViewing
          ? 'border-primary ring-2 ring-primary/40 shadow-lg'
          : isSelected
            ? 'border-primary ring-2 ring-primary/20'
            : isFocused
              ? 'border-primary/70 ring-2 ring-primary/30 ring-offset-2 ring-offset-background'
              : 'border-border',
      )}
      onClick={handleClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleClick()}
      onFocus={onFocus}
      tabIndex={tabIndex}
      role="button"
      aria-label={`${getKindLabel(item.kind)}: ${item.context.evalDescription || 'Media item'}${isViewing ? ' (currently viewing)' : ''}${isSelectionMode ? (isSelected ? ' (selected)' : ' (not selected)') : ''}`}
    >
      {/* Media Preview Area */}
      <div className="relative aspect-square overflow-hidden rounded-t-xl bg-muted/30">
        {item.kind === 'image' && !imageError ? (
          <>
            {!imageLoaded && <Skeleton className="absolute inset-0 rounded-none" />}
            <img
              src={mediaUrl}
              alt={item.context.evalDescription || 'Generated image'}
              className={cn(
                'h-full w-full object-cover transition-opacity duration-200',
                imageLoaded ? 'opacity-100' : 'opacity-0',
              )}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          </>
        ) : item.kind === 'video' ? (
          <VideoHoverPreview videoUrl={mediaUrl} hash={item.hash} isVisible={isVisible} />
        ) : item.kind === 'audio' ? (
          <AudioPreviewButton audioUrl={mediaUrl} hash={item.hash} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-gray-50 to-slate-50 dark:from-gray-950/30 dark:to-slate-950/30">
            <KindIcon className="h-10 w-10 text-gray-400 dark:text-gray-500" />
            <span className="text-xs text-muted-foreground">{formatBytes(item.sizeBytes)}</span>
          </div>
        )}

        {/* Download Button - Bottom Left Corner */}
        {!isSelectionMode && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleDownloadClick}
                className={cn(
                  'absolute bottom-2 left-2 z-10',
                  'rounded-md bg-black/60 p-1.5',
                  'opacity-0 transition-opacity duration-200 group-hover:opacity-100',
                  'hover:bg-black/80',
                )}
                aria-label="Download"
              >
                <Download className="h-3.5 w-3.5 text-white" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Download</TooltipContent>
          </Tooltip>
        )}

        {/* Selection Checkbox */}
        {isSelectionMode && (
          <button
            onClick={handleCheckboxClick}
            className={cn(
              'absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border-2 transition-all',
              isSelected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/50 bg-white/90 dark:bg-zinc-800/90 hover:border-primary',
            )}
            aria-label={isSelected ? 'Deselect' : 'Select'}
          >
            {isSelected && <Check className="h-4 w-4" />}
          </button>
        )}

        {/* Play indicator for video/audio */}
        {isPlayable && (
          <div className="absolute bottom-2 right-2">
            <Badge variant="secondary" className="bg-black/70 text-white text-xs px-1.5 py-0.5">
              {item.kind === 'video' ? (
                <Video className="h-3 w-3" />
              ) : (
                <Music className="h-3 w-3" />
              )}
            </Badge>
          </div>
        )}

        {/* Pass/Fail indicator */}
        {item.context.pass !== undefined && (
          <div className="absolute top-2 left-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    'flex items-center gap-1 rounded-full px-1.5 py-0.5 text-xs font-medium',
                    item.context.pass
                      ? 'bg-emerald-100/90 text-emerald-700 dark:bg-emerald-900/80 dark:text-emerald-300'
                      : 'bg-red-100/90 text-red-700 dark:bg-red-900/80 dark:text-red-300',
                  )}
                >
                  {item.context.pass ? (
                    <CheckCircle className="h-3 w-3" />
                  ) : (
                    <XCircle className="h-3 w-3" />
                  )}
                  {item.context.score !== undefined && (
                    <span className="tabular-nums">{Math.round(item.context.score * 100)}%</span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {item.context.pass ? 'Passed' : 'Failed'}
                {item.context.score !== undefined &&
                  ` (Score: ${(item.context.score * 100).toFixed(1)}%)`}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Card Footer */}
      <div className="p-3 space-y-1.5">
        {/* Provider row - most important for comparing model outputs */}
        <div className="flex items-center gap-1.5 min-w-0">
          <KindIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {item.context.provider ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs font-medium text-foreground truncate">
                  {item.context.provider}
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">{item.context.provider}</TooltipContent>
            </Tooltip>
          ) : (
            <span className="text-xs text-muted-foreground truncate">{item.mimeType}</span>
          )}
        </div>

        {/* Eval description */}
        <Tooltip>
          <TooltipTrigger asChild>
            <p className="text-sm font-medium truncate">
              {item.context.evalDescription ||
                `Eval ${item.context.evalId?.slice(0, 8) || 'Unknown'}`}
            </p>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            {item.context.evalDescription || item.context.evalId}
          </TooltipContent>
        </Tooltip>

        {/* Test/Prompt indices - only render if we have data */}
        {(item.context.testIdx !== undefined || item.context.promptIdx !== undefined) && (
          <p className="text-xs text-muted-foreground">
            {item.context.testIdx !== undefined && `Test #${item.context.testIdx + 1}`}
            {item.context.testIdx !== undefined && item.context.promptIdx !== undefined && ', '}
            {item.context.promptIdx !== undefined && `Prompt #${item.context.promptIdx + 1}`}
          </p>
        )}
      </div>
    </div>
  );
}
