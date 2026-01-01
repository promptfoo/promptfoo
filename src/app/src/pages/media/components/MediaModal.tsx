import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { CopyButton } from '@app/components/ui/copy-button';
import { Dialog, DialogClose, DialogContent } from '@app/components/ui/dialog';
import { EVAL_ROUTES } from '@app/constants/routes';
import { cn } from '@app/lib/utils';
import { getApiBaseUrl } from '@app/utils/api';
import {
  downloadMediaItem,
  formatBytes,
  formatCost,
  formatLatency,
  formatMediaDate,
  getKindIcon,
  MEDIA_MAX_ZOOM,
  MEDIA_MIN_ZOOM,
  MEDIA_ZOOM_STEP,
  MEDIA_ZOOM_WHEEL_STEP,
} from '@app/utils/media';
import {
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  FileIcon,
  Minimize2,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { GraderResult, MediaItem } from '../types';
import { AudioWaveform } from './AudioWaveform';

interface MediaModalProps {
  item: MediaItem | null;
  items: MediaItem[];
  onClose: () => void;
  onNavigate: (item: MediaItem) => void;
}

// Circular score indicator
function ScoreRing({ score, size = 48 }: { score: number; size?: number }) {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = score * circumference;
  const isPass = score >= 0.5;
  const percentage = Math.round(score * 100);

  return (
    <div
      className="relative"
      style={{ width: size, height: size }}
      role="meter"
      aria-label={`Score: ${percentage}%${isPass ? ' (passing)' : ' (failing)'}`}
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg className="transform -rotate-90" width={size} height={size}>
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/30"
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={circumference - progress}
          strokeLinecap="round"
          className={cn(
            'transition-all duration-500',
            isPass ? 'text-emerald-500' : 'text-red-500',
          )}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className={cn(
            'text-sm font-bold tabular-nums',
            isPass ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
          )}
        >
          {Math.round(score * 100)}
        </span>
      </div>
    </div>
  );
}

interface GraderItemProps {
  grader: GraderResult;
  isExpanded: boolean;
  onToggle: () => void;
}

function GraderItem({ grader, isExpanded, onToggle }: GraderItemProps) {
  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        grader.pass
          ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/50 dark:bg-emerald-950/20'
          : 'border-red-200 dark:border-red-800/50 bg-red-50/50 dark:bg-red-950/20',
      )}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors text-left rounded-lg"
      >
        {grader.pass ? (
          <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        ) : (
          <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
        )}
        <span className="text-sm font-medium min-w-0 flex-1 break-words">{grader.name}</span>
        <span
          className={cn(
            'text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded',
            grader.pass
              ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/50'
              : 'text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/50',
          )}
        >
          {Math.round(grader.score * 100)}%
        </span>
        {grader.reason && (
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform shrink-0',
              isExpanded && 'rotate-180',
            )}
          />
        )}
      </button>
      {isExpanded && grader.reason && (
        <div className="px-3 pb-3 pt-1">
          <div className="bg-white/80 dark:bg-black/20 rounded-md p-2.5 max-h-48 overflow-y-auto">
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
              {grader.reason}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export function MediaModal({ item, items, onClose, onNavigate }: MediaModalProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [expandedGraders, setExpandedGraders] = useState<Set<number>>(new Set());
  const [showDetails, setShowDetails] = useState(false);

  // Image zoom/pan state
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panPosition, setPanPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  const currentIndex = item ? items.findIndex((i) => i.hash === item.hash) : -1;
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < items.length - 1;

  const handlePrevious = useCallback(() => {
    if (hasPrevious) {
      onNavigate(items[currentIndex - 1]);
    }
  }, [hasPrevious, items, currentIndex, onNavigate]);

  const handleNext = useCallback(() => {
    if (hasNext) {
      onNavigate(items[currentIndex + 1]);
    }
  }, [hasNext, items, currentIndex, onNavigate]);

  // Zoom handlers using shared constants
  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(prev * MEDIA_ZOOM_STEP, MEDIA_MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => {
      const newZoom = Math.max(prev / MEDIA_ZOOM_STEP, MEDIA_MIN_ZOOM);
      if (newZoom === MEDIA_MIN_ZOOM) {
        setPanPosition({ x: 0, y: 0 });
      }
      return newZoom;
    });
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoomLevel(MEDIA_MIN_ZOOM);
    setPanPosition({ x: 0, y: 0 });
  }, []);

  // Build the full media URL including API base for dev mode
  const mediaUrl = useMemo(() => {
    if (!item) {
      return '';
    }
    const baseUrl = getApiBaseUrl();
    return `${baseUrl}${item.url}`;
  }, [item]);

  const handleDownload = useCallback(() => {
    if (!item) {
      return;
    }
    downloadMediaItem(mediaUrl, item.hash, item.mimeType);
  }, [item, mediaUrl]);

  const permalinkUrl = useMemo(
    () => (item ? `${window.location.origin}${window.location.pathname}?hash=${item.hash}` : ''),
    [item],
  );

  // Build deep link to exact eval cell
  const evalCellUrl = useMemo(() => {
    if (!item) {
      return '';
    }
    const baseUrl = EVAL_ROUTES.DETAIL(item.context.evalId);
    if (item.context.testIdx !== undefined) {
      return `${baseUrl}?rowId=${item.context.testIdx + 1}`;
    }
    return baseUrl;
  }, [item]);

  // Keyboard navigation handler - using callback instead of window listener
  // to work properly with Radix Dialog's focus management
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!item) {
        return;
      }

      // Arrow keys should ALWAYS navigate between items, regardless of focus.
      // This ensures consistent behavior even when video/audio controls have focus.
      // We use stopPropagation to prevent video elements from seeking.
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        handlePrevious();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        handleNext();
        return;
      }

      // For other shortcuts, skip if focus is in an interactive element
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'VIDEO' ||
        target.tagName === 'AUDIO' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key) {
        case 'd':
        case 'D':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            handleDownload();
          }
          break;
        case ' ':
          if (item.kind === 'video' || item.kind === 'audio') {
            e.preventDefault();
            const mediaEl = item.kind === 'video' ? videoRef.current : audioRef.current;
            if (mediaEl) {
              if (mediaEl.paused) {
                mediaEl.play();
                setIsPlaying(true);
              } else {
                mediaEl.pause();
                setIsPlaying(false);
              }
            }
          }
          break;
        case '+':
        case '=':
          if (item.kind === 'image') {
            e.preventDefault();
            handleZoomIn();
          }
          break;
        case '-':
        case '_':
          if (item.kind === 'image') {
            e.preventDefault();
            handleZoomOut();
          }
          break;
        case '0':
          if (item.kind === 'image') {
            e.preventDefault();
            handleZoomReset();
          }
          break;
        case 'm':
        case 'M':
          if (item.kind === 'video' || item.kind === 'audio') {
            e.preventDefault();
            const mediaEl = item.kind === 'video' ? videoRef.current : audioRef.current;
            if (mediaEl) {
              mediaEl.muted = !mediaEl.muted;
            }
          }
          break;
      }
    },
    [item, handlePrevious, handleNext, handleDownload, handleZoomIn, handleZoomOut, handleZoomReset],
  );

  // Reset state when item changes
  useEffect(() => {
    setIsPlaying(false);
    setExpandedGraders(new Set());
    setShowDetails(false);
    setZoomLevel(MEDIA_MIN_ZOOM);
    setPanPosition({ x: 0, y: 0 });
  }, [item?.hash]);

  // RAF ref for throttling pan updates
  const rafRef = useRef<number | undefined>(undefined);

  // Pan handlers for dragging zoomed images
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoomLevel <= MEDIA_MIN_ZOOM) {
        return;
      }
      e.preventDefault();
      setIsDragging(true);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      panStartRef.current = panPosition;
    },
    [zoomLevel, panPosition],
  );

  // Throttled mouse move using RAF for smooth performance
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) {
        return;
      }

      // Cancel any pending RAF to prevent queuing
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      const clientX = e.clientX;
      const clientY = e.clientY;

      rafRef.current = requestAnimationFrame(() => {
        const dx = clientX - dragStartRef.current.x;
        const dy = clientY - dragStartRef.current.y;
        setPanPosition({
          x: panStartRef.current.x + dx,
          y: panStartRef.current.y + dy,
        });
        rafRef.current = undefined;
      });
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    // Clean up any pending RAF
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
    }
  }, []);

  // Handle wheel zoom on image
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setZoomLevel((prev) => Math.min(prev * MEDIA_ZOOM_WHEEL_STEP, MEDIA_MAX_ZOOM));
    } else {
      setZoomLevel((prev) => {
        const newZoom = Math.max(prev / MEDIA_ZOOM_WHEEL_STEP, MEDIA_MIN_ZOOM);
        if (newZoom === MEDIA_MIN_ZOOM) {
          setPanPosition({ x: 0, y: 0 });
        }
        return newZoom;
      });
    }
  }, []);

  if (!item) {
    return null;
  }

  const KindIcon = getKindIcon(item.kind);
  const hasScore = item.context.score !== undefined;
  const hasGraders = item.context.graderResults && item.context.graderResults.length > 0;

  return (
    <Dialog open={!!item} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-6xl w-[95vw] h-[90vh] md:h-[85vh] overflow-hidden p-0 gap-0"
        onKeyDown={handleKeyDown}
        hideCloseButton
      >
        <div className="flex flex-col md:flex-row h-full">
          {/* Media Preview */}
          <div className="relative flex-1 flex items-center justify-center bg-gradient-to-br from-zinc-900 to-black min-w-0 min-h-[40vh] md:min-h-0 overflow-hidden">
            {/* Close button - visible on dark background */}
            <DialogClose className="absolute top-4 left-4 z-50 p-2 rounded-full bg-white/90 dark:bg-zinc-800/90 shadow-lg hover:bg-white dark:hover:bg-zinc-700 transition-all hover:scale-105">
              <X className="h-5 w-5" />
              <span className="sr-only">Close</span>
            </DialogClose>

            {item.kind === 'image' && (
              <div
                ref={imageContainerRef}
                className={cn(
                  'relative w-full h-full flex items-center justify-center',
                  zoomLevel > MEDIA_MIN_ZOOM ? 'cursor-grab' : 'cursor-zoom-in',
                  isDragging && 'cursor-grabbing',
                )}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                onClick={() => zoomLevel === MEDIA_MIN_ZOOM && handleZoomIn()}
              >
                <img
                  src={mediaUrl}
                  alt={item.context.evalDescription || 'Generated image'}
                  className="max-w-full max-h-full object-contain select-none"
                  style={{
                    transform: `scale(${zoomLevel}) translate(${panPosition.x / zoomLevel}px, ${panPosition.y / zoomLevel}px)`,
                    transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                  }}
                  draggable={false}
                />
              </div>
            )}

            {/* Zoom controls for images */}
            {item.kind === 'image' && (
              <div className="absolute top-4 right-4 flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-lg p-1">
                <button
                  onClick={handleZoomOut}
                  disabled={zoomLevel <= MEDIA_MIN_ZOOM}
                  className={cn(
                    'p-1.5 rounded transition-colors',
                    zoomLevel <= MEDIA_MIN_ZOOM
                      ? 'text-gray-500 cursor-not-allowed'
                      : 'text-white hover:bg-white/20',
                  )}
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </button>
                <span
                  className="text-white text-xs font-medium tabular-nums w-10 text-center"
                  aria-live="polite"
                >
                  {Math.round(zoomLevel * 100)}%
                </span>
                <button
                  onClick={handleZoomIn}
                  disabled={zoomLevel >= MEDIA_MAX_ZOOM}
                  className={cn(
                    'p-1.5 rounded transition-colors',
                    zoomLevel >= MEDIA_MAX_ZOOM
                      ? 'text-gray-500 cursor-not-allowed'
                      : 'text-white hover:bg-white/20',
                  )}
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </button>
                {zoomLevel !== MEDIA_MIN_ZOOM && (
                  <button
                    onClick={handleZoomReset}
                    className="p-1.5 rounded text-white hover:bg-white/20 transition-colors ml-1"
                    aria-label="Reset zoom"
                  >
                    <Minimize2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            {item.kind === 'video' && (
              <video
                ref={videoRef}
                src={mediaUrl}
                controls
                autoPlay
                muted
                className="max-w-full max-h-full"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            )}

            {item.kind === 'audio' && (
              <div className="flex flex-col items-center gap-6 p-8">
                <AudioWaveform
                  hash={item.hash}
                  isPlaying={isPlaying}
                  barCount={12}
                  barWidth={8}
                  minBarHeight={16}
                  maxBarHeight={48}
                  showIcon
                  iconSize="h-16 w-16"
                />
                <audio
                  ref={audioRef}
                  src={mediaUrl}
                  controls
                  autoPlay
                  className="w-full max-w-md"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              </div>
            )}

            {item.kind === 'other' && (
              <div className="flex flex-col items-center gap-4 p-8 text-white">
                <FileIcon className="h-16 w-16 text-gray-400" />
                <span className="text-sm text-gray-400">Preview not available</span>
                <Button onClick={handleDownload} variant="secondary">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            )}

            {/* Navigation Arrows */}
            {hasPrevious && (
              <button
                onClick={handlePrevious}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/90 dark:bg-zinc-800/90 shadow-lg hover:bg-white dark:hover:bg-zinc-700 transition-all hover:scale-105"
                aria-label="Previous"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            {hasNext && (
              <button
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-white/90 dark:bg-zinc-800/90 shadow-lg hover:bg-white dark:hover:bg-zinc-700 transition-all hover:scale-105"
                aria-label="Next"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            )}

            {/* Navigation counter */}
            {items.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm text-white/90 text-sm font-medium tabular-nums">
                {currentIndex + 1} / {items.length}
              </div>
            )}
          </div>

          {/* Details Panel */}
          <div className="w-full md:w-96 lg:w-[420px] border-t md:border-t-0 md:border-l border-border bg-muted/50 flex flex-col shrink-0 max-h-[50vh] md:max-h-none">
            {/* Header with status and score */}
            <div className="p-4 border-b border-border bg-card">
              <div className="flex items-start gap-4">
                {/* Score ring or status icon */}
                {hasScore ? (
                  <ScoreRing score={item.context.score!} size={56} />
                ) : (
                  <div
                    className={cn(
                      'w-14 h-14 rounded-full flex items-center justify-center',
                      item.context.pass === true && 'bg-emerald-100 dark:bg-emerald-900/30',
                      item.context.pass === false && 'bg-red-100 dark:bg-red-900/30',
                      item.context.pass === undefined && 'bg-muted',
                    )}
                  >
                    {item.context.pass === true && (
                      <CheckCircle className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                    )}
                    {item.context.pass === false && (
                      <XCircle className="h-7 w-7 text-red-600 dark:text-red-400" />
                    )}
                    {item.context.pass === undefined && (
                      <KindIcon className="h-7 w-7 text-muted-foreground" />
                    )}
                  </div>
                )}

                {/* Status text and metadata */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {item.context.pass === true && (
                      <span className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">
                        Passed
                      </span>
                    )}
                    {item.context.pass === false && (
                      <span className="text-lg font-semibold text-red-700 dark:text-red-300">
                        Failed
                      </span>
                    )}
                    {item.context.pass === undefined && (
                      <span className="text-lg font-semibold capitalize">{item.kind}</span>
                    )}
                  </div>

                  {/* Provider chip */}
                  {item.context.provider && (
                    <p className="text-xs text-muted-foreground font-mono mt-1 truncate">
                      {item.context.provider}
                    </p>
                  )}

                  {/* Metrics row */}
                  <div className="flex items-center gap-3 mt-2">
                    {item.context.latencyMs !== undefined && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                        <Clock className="h-3 w-3" />
                        {formatLatency(item.context.latencyMs)}
                      </span>
                    )}
                    {item.context.cost !== undefined && item.context.cost > 0 && (
                      <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-full">
                        {formatCost(item.context.cost)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
              {/* Prompt Section */}
              {item.context.prompt && (
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Prompt
                    </h4>
                    <CopyButton
                      value={item.context.prompt}
                      className="h-5 w-5 shrink-0 -mr-0.5"
                      iconSize="h-3.5 w-3.5"
                    />
                  </div>
                  <div className="bg-card rounded-lg border border-border/50 p-3 max-h-36 overflow-y-auto shadow-sm">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                      {item.context.prompt}
                    </p>
                  </div>
                </div>
              )}

              {/* Variables Section */}
              {item.context.variables && Object.keys(item.context.variables).length > 0 && (
                <div className="min-w-0">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Variables
                  </h4>
                  <div className="bg-card rounded-lg border border-border/50 p-3 space-y-2 max-h-32 overflow-y-auto shadow-sm">
                    {Object.entries(item.context.variables).map(([key, value]) => (
                      <div key={key} className="text-sm min-w-0">
                        <span className="text-muted-foreground font-medium">{key}:</span>
                        <span className="ml-2 font-mono text-xs break-words whitespace-pre-wrap">
                          {value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Graders Section */}
              {hasGraders && (
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Assertions
                  </h4>
                  <div className="space-y-2">
                    {item.context.graderResults!.map((grader, idx) => (
                      <GraderItem
                        key={idx}
                        grader={grader}
                        isExpanded={expandedGraders.has(idx)}
                        onToggle={() => {
                          setExpandedGraders((prev) => {
                            const next = new Set(prev);
                            if (next.has(idx)) {
                              next.delete(idx);
                            } else {
                              next.add(idx);
                            }
                            return next;
                          });
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Eval Link */}
              <Link
                to={evalCellUrl}
                className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors group"
              >
                <ExternalLink className="h-4 w-4 shrink-0 group-hover:translate-x-0.5 transition-transform" />
                <span className="truncate">View in {item.context.evalDescription || 'Eval'}</span>
              </Link>

              {/* Details Toggle */}
              <div className="pt-2 border-t border-border/50">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                >
                  <ChevronDown
                    className={cn('h-4 w-4 transition-transform', showDetails && 'rotate-180')}
                  />
                  <span className="font-medium">
                    {showDetails ? 'Hide' : 'Show'} technical details
                  </span>
                </button>

                {showDetails && (
                  <div className="mt-3 space-y-2 text-xs bg-card rounded-lg border border-border/50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Cell</span>
                      <span className="font-mono">
                        {item.context.testIdx !== undefined ? `Row ${item.context.testIdx + 1}` : '—'}
                        {item.context.promptIdx !== undefined && `, Col ${item.context.promptIdx + 1}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Size</span>
                      <span className="font-mono">{formatBytes(item.sizeBytes)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <span>{formatMediaDate(item.createdAt)}</span>
                    </div>
                    {item.context.location && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground shrink-0">Location</span>
                        <code className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded truncate">
                          {item.context.location}
                        </code>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground shrink-0">Hash</span>
                      <div className="flex items-center gap-1.5 min-w-0">
                        <code className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded truncate">
                          {item.hash.slice(0, 16)}...
                        </code>
                        <CopyButton
                          value={item.hash}
                          className="h-4 w-4 shrink-0"
                          iconSize="h-3 w-3"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="border-t border-border bg-card px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleDownload}
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Download</span>
                </Button>
                <CopyButton
                  value={permalinkUrl}
                  className="h-8 w-8 border border-input bg-background rounded-md hover:bg-accent hover:text-accent-foreground"
                  iconSize="h-4 w-4"
                  title="Copy permalink"
                />
              </div>
              {/* Keyboard shortcuts */}
              <div className="hidden lg:flex items-center gap-1.5">
                <kbd className="inline-flex items-center justify-center h-5 min-w-5 px-1 bg-muted/60 rounded text-[10px] font-mono text-muted-foreground border border-border/40">
                  ←
                </kbd>
                <kbd className="inline-flex items-center justify-center h-5 min-w-5 px-1 bg-muted/60 rounded text-[10px] font-mono text-muted-foreground border border-border/40">
                  →
                </kbd>
                <kbd className="inline-flex items-center justify-center h-5 min-w-5 px-1 bg-muted/60 rounded text-[10px] font-mono text-muted-foreground border border-border/40">
                  D
                </kbd>
                {(item.kind === 'video' || item.kind === 'audio') && (
                  <>
                    <kbd className="inline-flex items-center justify-center h-5 px-1.5 bg-muted/60 rounded text-[10px] font-mono text-muted-foreground border border-border/40">
                      Space
                    </kbd>
                    <kbd className="inline-flex items-center justify-center h-5 min-w-5 px-1 bg-muted/60 rounded text-[10px] font-mono text-muted-foreground border border-border/40">
                      M
                    </kbd>
                  </>
                )}
                {item.kind === 'image' && (
                  <>
                    <kbd className="inline-flex items-center justify-center h-5 min-w-5 px-1 bg-muted/60 rounded text-[10px] font-mono text-muted-foreground border border-border/40">
                      +
                    </kbd>
                    <kbd className="inline-flex items-center justify-center h-5 min-w-5 px-1 bg-muted/60 rounded text-[10px] font-mono text-muted-foreground border border-border/40">
                      −
                    </kbd>
                    <kbd className="inline-flex items-center justify-center h-5 min-w-5 px-1 bg-muted/60 rounded text-[10px] font-mono text-muted-foreground border border-border/40">
                      0
                    </kbd>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
