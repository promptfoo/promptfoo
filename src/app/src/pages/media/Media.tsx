import { useCallback, useEffect, useRef, useState } from 'react';

import { PageContainer } from '@app/components/layout/PageContainer';
import { PageHeader } from '@app/components/layout/PageHeader';
import { Alert, AlertDescription } from '@app/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@app/components/ui/alert-dialog';
import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@app/components/ui/dropdown-menu';
import { Progress } from '@app/components/ui/progress';
import { Spinner } from '@app/components/ui/spinner';
import { callApi } from '@app/utils/api';
import { generateMediaFilename } from '@app/utils/media';
import { AlertCircle, ChevronDown, Download, MousePointerClick, RefreshCw, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { MediaEmptyState } from './components/MediaEmptyState';
import { MediaErrorBoundary } from './components/MediaErrorBoundary';
import { MediaFilters } from './components/MediaFilters';
import { MediaGrid } from './components/MediaGrid';
import { MediaModal } from './components/MediaModal';
import { fetchMediaItemByHash, useEvalsWithMedia, useMediaItems } from './hooks/useMediaItems';
import { clearExpiredThumbnails } from './hooks/useThumbnailCache';

import type { MediaItem, MediaSort, MediaTypeFilter } from './types';

export default function Media() {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL state
  const hashParam = searchParams.get('hash');
  const typeParam = (searchParams.get('type') as MediaTypeFilter) || 'all';
  const evalParam = searchParams.get('evalId') || '';
  const sortFieldParam = searchParams.get('sortField') as MediaSort['field'] | null;
  const sortOrderParam = searchParams.get('sortOrder') as MediaSort['order'] | null;

  // Local state
  const [typeFilter, setTypeFilter] = useState<MediaTypeFilter>(typeParam);
  const [evalFilter, setEvalFilter] = useState(evalParam);
  const [sort, setSort] = useState<MediaSort>({
    field: sortFieldParam || 'createdAt',
    order: sortOrderParam || 'desc',
  });
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({
    current: 0,
    total: 0,
    currentFile: '',
  });
  const [downloadErrors, setDownloadErrors] = useState<string[]>([]);
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const [isDeepLinkLoading, setIsDeepLinkLoading] = useState(false);
  const [showBulkDownloadConfirm, setShowBulkDownloadConfirm] = useState(false);
  const downloadAbortRef = useRef<AbortController | null>(null);

  // Selection state for bulk operations
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());

  // Track internal selection state to coordinate between URL sync and hash effects.
  // - null: initial state, no internal action yet (preserve URL hash for deep linking)
  // - string: user selected an item with this hash
  // - 'cleared': user explicitly closed/cleared selection (remove hash from URL)
  const lastInternalSelectionRef = useRef<string | null | 'cleared'>(null);

  // Data fetching
  const { items, total, isLoading, isLoadingMore, error, hasMore, loadMore, refresh } =
    useMediaItems({ type: typeFilter, evalId: evalFilter || undefined, sort });
  const { evals } = useEvalsWithMedia();

  // Clean up expired thumbnails after initial render (non-blocking)
  useEffect(() => {
    // Use requestIdleCallback to run cleanup during idle time, with setTimeout fallback
    const runCleanup = () => {
      clearExpiredThumbnails().catch(() => {
        // Silently ignore cache cleanup errors
      });
    };

    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(runCleanup, { timeout: 5000 });
      return () => window.cancelIdleCallback(id);
    } else {
      // Fallback: defer to next macrotask to not block render
      const id = setTimeout(runCleanup, 1000);
      return () => clearTimeout(id);
    }
  }, []);

  // Handle Escape key to exit selection mode
  useEffect(() => {
    if (!isSelectionMode) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSelectionMode(false);
        setSelectedHashes(new Set());
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isSelectionMode]);

  // Sync URL with filters - use a ref to track previous values and avoid
  // reading searchParams in the effect (which would cause infinite loops)
  const prevUrlStateRef = useRef({
    typeFilter: '',
    evalFilter: '',
    selectedHash: '',
    sortField: 'createdAt',
    sortOrder: 'desc',
  });

  useEffect(() => {
    const currentHash = selectedItem?.hash || '';
    const prev = prevUrlStateRef.current;

    // Only update URL if something actually changed
    const hasFilterChange = typeFilter !== prev.typeFilter || evalFilter !== prev.evalFilter;
    const hasSelectionChange = currentHash !== prev.selectedHash;
    const hasSortChange = sort.field !== prev.sortField || sort.order !== prev.sortOrder;

    if (!hasFilterChange && !hasSelectionChange && !hasSortChange) {
      return;
    }

    // Update ref before calling setSearchParams to prevent stale comparisons
    prevUrlStateRef.current = {
      typeFilter,
      evalFilter,
      selectedHash: currentHash,
      sortField: sort.field,
      sortOrder: sort.order,
    };

    const params = new URLSearchParams();
    if (typeFilter !== 'all') {
      params.set('type', typeFilter);
    }
    if (evalFilter) {
      params.set('evalId', evalFilter);
    }
    // Only add sort params if not default
    if (sort.field !== 'createdAt' || sort.order !== 'desc') {
      params.set('sortField', sort.field);
      params.set('sortOrder', sort.order);
    }
    if (selectedItem) {
      params.set('hash', selectedItem.hash);
    } else if (lastInternalSelectionRef.current !== 'cleared') {
      // Preserve existing hash from URL for deep linking on initial load
      // Using hashParam (derived from searchParams at render) instead of calling
      // searchParams.get() inside effect to avoid adding searchParams as dependency
      if (hashParam) {
        params.set('hash', hashParam);
      }
    }
    setSearchParams(params, { replace: true });
  }, [typeFilter, evalFilter, selectedItem, sort, setSearchParams, hashParam]);

  // Handle hash param for deep linking (external navigation)
  useEffect(() => {
    if (!hashParam) {
      setDeepLinkError(null);
      return;
    }

    // Skip if user explicitly cleared selection (closed modal, changed filters).
    // The URL will be updated shortly to remove the hash.
    if (lastInternalSelectionRef.current === 'cleared') {
      return;
    }

    // Skip if this hash matches our last internal selection.
    // This means the URL is just catching up to what we already selected
    // via click/navigation, so we don't need to do anything.
    if (hashParam === lastInternalSelectionRef.current) {
      return;
    }

    // First check if item is in loaded items
    const item = items.find((i) => i.hash === hashParam);
    if (item) {
      setSelectedItem(item);
      setDeepLinkError(null);
      return;
    }

    // Only fetch if we're done loading and the item wasn't found
    // items.length check prevents fetching before initial load completes
    if (!isLoading && items.length > 0) {
      // Item not in current list, fetch by hash directly
      let cancelled = false;
      setIsDeepLinkLoading(true);
      fetchMediaItemByHash(hashParam).then((result) => {
        if (cancelled) {
          return;
        }
        setIsDeepLinkLoading(false);
        if (result.item) {
          setSelectedItem(result.item);
          setDeepLinkError(null);
        } else {
          // Map error types to user-friendly messages
          const errorMessages = {
            not_found: `Media item not found. It may have been deleted or the link is invalid.`,
            network_error: `Unable to load media item. Please check your connection and try again.`,
            server_error: `Server error while loading media item. Please try again later.`,
          };
          setDeepLinkError(result.error ? errorMessages[result.error] : null);
        }
      });
      return () => {
        cancelled = true;
        setIsDeepLinkLoading(false);
      };
    }
  }, [hashParam, items, isLoading]);

  const handleTypeFilterChange = useCallback((type: MediaTypeFilter) => {
    setTypeFilter(type);
    lastInternalSelectionRef.current = 'cleared';
    setSelectedItem(null);
  }, []);

  const handleEvalFilterChange = useCallback((evalId: string) => {
    setEvalFilter(evalId);
    lastInternalSelectionRef.current = 'cleared';
    setSelectedItem(null);
  }, []);

  const handleClearFilters = useCallback(() => {
    setTypeFilter('all');
    setEvalFilter('');
    lastInternalSelectionRef.current = 'cleared';
    setSelectedItem(null);
  }, []);

  const handleItemClick = useCallback((item: MediaItem) => {
    lastInternalSelectionRef.current = item.hash;
    setSelectedItem(item);
  }, []);

  const handleModalClose = useCallback(() => {
    lastInternalSelectionRef.current = 'cleared';
    setSelectedItem(null);
  }, []);

  const handleModalNavigate = useCallback((item: MediaItem) => {
    lastInternalSelectionRef.current = item.hash;
    setSelectedItem(item);
  }, []);

  // Selection mode handlers
  const handleToggleSelectionMode = useCallback(() => {
    setIsSelectionMode((prev) => {
      if (prev) {
        // Exiting selection mode, clear selections
        setSelectedHashes(new Set());
      }
      return !prev;
    });
  }, []);

  const handleToggleItemSelection = useCallback((hash: string) => {
    setSelectedHashes((prev) => {
      const next = new Set(prev);
      if (next.has(hash)) {
        next.delete(hash);
      } else {
        next.add(hash);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedHashes(new Set(items.map((item) => item.hash)));
  }, [items]);

  const handleDeselectAll = useCallback(() => {
    setSelectedHashes(new Set());
  }, []);

  const handleBulkDownload = useCallback(async () => {
    // Use selected items if in selection mode, otherwise all items
    const itemsToDownload =
      isSelectionMode && selectedHashes.size > 0
        ? items.filter((item) => selectedHashes.has(item.hash))
        : items;

    if (itemsToDownload.length === 0) {
      return;
    }

    // Cancel any existing download
    downloadAbortRef.current?.abort();
    downloadAbortRef.current = new AbortController();
    const signal = downloadAbortRef.current.signal;

    setIsDownloading(true);
    setDownloadProgress({ current: 0, total: itemsToDownload.length, currentFile: '' });
    setDownloadErrors([]);

    const errors: string[] = [];

    try {
      // Download files one by one with progress
      // TODO: Implement server-side ZIP creation for better UX with large batches
      for (let i = 0; i < itemsToDownload.length; i++) {
        if (signal.aborted) {
          break;
        }

        const item = itemsToDownload[i];
        const filename = generateMediaFilename(item.hash, item.mimeType);

        setDownloadProgress({ current: i, total: itemsToDownload.length, currentFile: filename });

        try {
          const response = await callApi(`/blobs/${item.hash}`, { signal });
          if (!response.ok) {
            errors.push(`${filename}: HTTP ${response.status}`);
            continue;
          }

          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          setDownloadProgress({ current: i + 1, total: itemsToDownload.length, currentFile: '' });

          // Small delay between downloads to avoid overwhelming the browser
          await new Promise((r) => setTimeout(r, 100));
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            break;
          }
          const message = err instanceof Error ? err.message : 'Unknown error';
          errors.push(`${filename}: ${message}`);
        }
      }
    } finally {
      setIsDownloading(false);
      setDownloadProgress({ current: 0, total: 0, currentFile: '' });
      if (errors.length > 0) {
        setDownloadErrors(errors);
      }
      // Exit selection mode after download
      if (isSelectionMode) {
        setIsSelectionMode(false);
        setSelectedHashes(new Set());
      }
    }
  }, [items, isSelectionMode, selectedHashes]);

  const handleCancelDownload = useCallback(() => {
    downloadAbortRef.current?.abort();
  }, []);

  const hasFilters = typeFilter !== 'all' || !!evalFilter;
  const showEmptyState = !isLoading && items.length === 0;

  return (
    <PageContainer className="min-h-screen flex flex-col">
      <PageHeader>
        <div className="container max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Media Library</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Browse images, videos, and audio generated by your evaluations
              </p>
            </div>
            {items.length > 0 && (
              <div className="flex items-center gap-3">
                {/* Download Progress */}
                {isDownloading && (
                  <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-3 py-2">
                    <div className="flex flex-col gap-1">
                      <Progress
                        value={(downloadProgress.current / downloadProgress.total) * 100}
                        className="w-32 h-2"
                      />
                      {downloadProgress.currentFile && (
                        <span className="text-xs text-muted-foreground truncate max-w-32">
                          {downloadProgress.currentFile}
                        </span>
                      )}
                    </div>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {downloadProgress.current}/{downloadProgress.total}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCancelDownload}
                      className="h-6 w-6 p-0"
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">Cancel download</span>
                    </Button>
                  </div>
                )}

                {/* Download Controls */}
                {isSelectionMode ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {selectedHashes.size} of {items.length} selected
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={
                        selectedHashes.size === items.length ? handleDeselectAll : handleSelectAll
                      }
                    >
                      {selectedHashes.size === items.length ? 'Deselect All' : 'Select All'}
                    </Button>
                    <Button
                      onClick={() => {
                        if (selectedHashes.size > 10) {
                          setShowBulkDownloadConfirm(true);
                        } else {
                          handleBulkDownload();
                        }
                      }}
                      disabled={isDownloading || selectedHashes.size === 0}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download {selectedHashes.size > 0 ? `(${selectedHashes.size})` : ''}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={handleToggleSelectionMode}>
                      <X className="h-4 w-4" />
                      <span className="sr-only">Cancel selection</span>
                    </Button>
                  </div>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" disabled={isDownloading}>
                        <Download className="h-4 w-4 mr-2" />
                        {isDownloading ? 'Downloading...' : 'Download'}
                        <ChevronDown className="h-4 w-4 ml-2" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          if (items.length > 10) {
                            setShowBulkDownloadConfirm(true);
                          } else {
                            handleBulkDownload();
                          }
                        }}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download All ({items.length})
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleToggleSelectionMode}>
                        <MousePointerClick className="h-4 w-4 mr-2" />
                        Select Items...
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            )}
          </div>
        </div>
      </PageHeader>

      <div className="flex-1 p-6">
        <div className="container max-w-7xl mx-auto space-y-6">
          {/* Filters */}
          <Card className="p-4">
            <MediaFilters
              typeFilter={typeFilter}
              onTypeFilterChange={handleTypeFilterChange}
              evalFilter={evalFilter}
              onEvalFilterChange={handleEvalFilterChange}
              sort={sort}
              onSortChange={setSort}
              evals={evals}
              total={total}
            />
          </Card>

          {/* Error State */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{error}</span>
                <Button variant="outline" size="sm" onClick={refresh}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Deep Link Loading */}
          {isDeepLinkLoading && (
            <Alert>
              <Spinner className="h-4 w-4" />
              <AlertDescription className="flex items-center gap-2">
                <span>Loading media item...</span>
              </AlertDescription>
            </Alert>
          )}

          {/* Deep Link Error */}
          {deepLinkError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>{deepLinkError}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDeepLinkError(null);
                    lastInternalSelectionRef.current = 'cleared';
                    // Clear the hash from URL
                    const params = new URLSearchParams(searchParams);
                    params.delete('hash');
                    setSearchParams(params, { replace: true });
                  }}
                >
                  <X className="h-4 w-4 mr-2" />
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Download Errors */}
          {downloadErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>
                  {downloadErrors.length} file{downloadErrors.length > 1 ? 's' : ''} failed to
                  download
                </span>
                <Button variant="outline" size="sm" onClick={() => setDownloadErrors([])}>
                  <X className="h-4 w-4 mr-2" />
                  Dismiss
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Content */}
          <MediaErrorBoundary>
            {showEmptyState ? (
              <MediaEmptyState
                hasFilters={hasFilters}
                onClearFilters={hasFilters ? handleClearFilters : undefined}
              />
            ) : (
              <MediaGrid
                items={items}
                isLoading={isLoading}
                isLoadingMore={isLoadingMore}
                hasMore={hasMore}
                onLoadMore={loadMore}
                onItemClick={handleItemClick}
                isSelectionMode={isSelectionMode}
                selectedHashes={selectedHashes}
                onToggleSelection={handleToggleItemSelection}
                viewingHash={selectedItem?.hash}
              />
            )}
          </MediaErrorBoundary>
        </div>
      </div>

      {/* Detail Modal */}
      <MediaErrorBoundary>
        <MediaModal
          item={selectedItem}
          items={items}
          onClose={handleModalClose}
          onNavigate={handleModalNavigate}
        />

        {/* Bulk Download Confirmation Dialog */}
        <AlertDialog open={showBulkDownloadConfirm} onOpenChange={setShowBulkDownloadConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Download{' '}
                {isSelectionMode && selectedHashes.size > 0 ? selectedHashes.size : items.length}{' '}
                files?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This will download{' '}
                {isSelectionMode && selectedHashes.size > 0 ? selectedHashes.size : items.length}{' '}
                files to your computer. Each file will be saved separately. Large downloads may take
                a while and could be interrupted by your browser.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setShowBulkDownloadConfirm(false);
                  handleBulkDownload();
                }}
              >
                Download {isSelectionMode && selectedHashes.size > 0 ? 'Selected' : 'All'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </MediaErrorBoundary>
    </PageContainer>
  );
}
