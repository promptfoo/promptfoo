import { useCallback, useEffect, useRef, useState } from 'react';

import { Skeleton } from '@app/components/ui/skeleton';
import { Spinner } from '@app/components/ui/spinner';
import { cn } from '@app/lib/utils';
import { MEDIA_INFINITE_SCROLL_MARGIN } from '@app/utils/media';
import type { MediaItem } from '../types';
import { MediaCard } from './MediaCard';

interface MediaGridProps {
  items: MediaItem[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onItemClick: (item: MediaItem) => void;
  isSelectionMode?: boolean;
  selectedHashes?: Set<string>;
  onToggleSelection?: (hash: string) => void;
  /** Hash of the item currently being viewed in modal */
  viewingHash?: string;
}

/** Calculate items per row based on viewport width (matches Tailwind breakpoints) */
function getItemsPerRow(): number {
  const width = window.innerWidth;
  if (width >= 1280) return 6; // xl
  if (width >= 1024) return 5; // lg
  if (width >= 768) return 4; // md
  if (width >= 640) return 3; // sm
  return 2; // default
}

function MediaCardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="p-3 space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  );
}

export function MediaGrid({
  items,
  isLoading,
  isLoadingMore,
  hasMore,
  onLoadMore,
  onItemClick,
  isSelectionMode = false,
  selectedHashes = new Set(),
  onToggleSelection,
  viewingHash,
}: MediaGridProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLUListElement>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  // Handle keyboard navigation within the grid
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (items.length === 0) return;

      const itemsPerRow = getItemsPerRow();
      let newIndex = focusedIndex;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          newIndex = Math.min(focusedIndex + 1, items.length - 1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          newIndex = Math.max(focusedIndex - 1, 0);
          break;
        case 'ArrowDown':
          e.preventDefault();
          newIndex = Math.min(focusedIndex + itemsPerRow, items.length - 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          newIndex = Math.max(focusedIndex - itemsPerRow, 0);
          break;
        case 'Home':
          e.preventDefault();
          newIndex = 0;
          break;
        case 'End':
          e.preventDefault();
          newIndex = items.length - 1;
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedIndex >= 0 && focusedIndex < items.length) {
            onItemClick(items[focusedIndex]);
          }
          return;
        default:
          return;
      }

      if (newIndex !== focusedIndex) {
        setFocusedIndex(newIndex);
        // Focus the new card
        const cards = gridRef.current?.querySelectorAll('[role="button"]');
        const card = cards?.[newIndex] as HTMLElement | undefined;
        card?.focus();
      }
    },
    [focusedIndex, items, onItemClick],
  );

  // Reset focused index when items change
  useEffect(() => {
    setFocusedIndex(-1);
  }, [items]);

  // Use refs to store latest values to avoid recreating IntersectionObserver
  const stateRef = useRef({ hasMore, isLoadingMore, onLoadMore });
  stateRef.current = { hasMore, isLoadingMore, onLoadMore };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        const { hasMore, isLoadingMore, onLoadMore } = stateRef.current;
        if (entry.isIntersecting && hasMore && !isLoadingMore) {
          onLoadMore();
        }
      },
      {
        root: null,
        rootMargin: `${MEDIA_INFINITE_SCROLL_MARGIN}px`,
        threshold: 0,
      },
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      observer.disconnect();
    };
  }, []); // Empty deps - observer is created once and uses refs for current values

  if (isLoading) {
    return (
      <div
        className={cn(
          'grid gap-4',
          'grid-cols-2',
          'sm:grid-cols-3',
          'md:grid-cols-4',
          'lg:grid-cols-5',
          'xl:grid-cols-6',
        )}
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <MediaCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/*
        Using role="list" instead of "grid" because:
        1. Our layout is responsive and the number of columns varies
        2. Screen readers handle lists more consistently
        3. We still provide arrow key navigation as an enhancement
      */}
      <ul
        ref={gridRef}
        role="list"
        aria-label={`Media library - ${items.length} items`}
        onKeyDown={handleKeyDown}
        className={cn(
          'grid gap-4 list-none p-0 m-0',
          'grid-cols-2',
          'sm:grid-cols-3',
          'md:grid-cols-4',
          'lg:grid-cols-5',
          'xl:grid-cols-6',
        )}
      >
        {items.map((item, index) => (
          <li key={item.hash} className="contents">
            <MediaCard
              item={item}
              onClick={() => onItemClick(item)}
              tabIndex={focusedIndex === -1 ? (index === 0 ? 0 : -1) : (focusedIndex === index ? 0 : -1)}
              onFocus={() => setFocusedIndex(index)}
              isSelectionMode={isSelectionMode}
              isSelected={selectedHashes.has(item.hash)}
              onToggleSelection={onToggleSelection}
              isFocused={focusedIndex === index}
              isViewing={viewingHash === item.hash}
            />
          </li>
        ))}
      </ul>

      {/* Infinite scroll trigger */}
      <div ref={loadMoreRef} className="flex justify-center py-4">
        {isLoadingMore && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Spinner className="h-4 w-4" />
            <span className="text-sm">Loading more...</span>
          </div>
        )}
      </div>
    </div>
  );
}
