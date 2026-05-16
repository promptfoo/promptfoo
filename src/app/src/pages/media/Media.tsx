import {
  type MutableRefObject,
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react';

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
import { useTelemetry } from '@app/hooks/useTelemetry';
import { getApiBaseUrl } from '@app/utils/api';
import { downloadFile, generateMediaFilename } from '@app/utils/media';
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

type InternalSelectionState = string | null | 'cleared';

const MEDIA_TYPE_FILTERS: MediaTypeFilter[] = ['all', 'image', 'video', 'audio', 'other'];
const MEDIA_SORT_FIELDS: MediaSort['field'][] = ['createdAt', 'sizeBytes'];
const MEDIA_SORT_ORDERS: MediaSort['order'][] = ['asc', 'desc'];

function getMediaUrlState(searchParams: URLSearchParams) {
  const rawType = searchParams.get('type');
  const rawSortField = searchParams.get('sortField');
  const rawSortOrder = searchParams.get('sortOrder');

  return {
    hashParam: searchParams.get('hash'),
    typeParam:
      rawType && MEDIA_TYPE_FILTERS.includes(rawType as MediaTypeFilter)
        ? (rawType as MediaTypeFilter)
        : 'all',
    evalParam: searchParams.get('evalId') || '',
    sortFieldParam:
      rawSortField && MEDIA_SORT_FIELDS.includes(rawSortField as MediaSort['field'])
        ? (rawSortField as MediaSort['field'])
        : null,
    sortOrderParam:
      rawSortOrder && MEDIA_SORT_ORDERS.includes(rawSortOrder as MediaSort['order'])
        ? (rawSortOrder as MediaSort['order'])
        : null,
  };
}

function buildMediaSearchParams({
  typeFilter,
  evalFilter,
  sort,
  selectedItem,
  hashParam,
  lastInternalSelectionRef,
}: {
  typeFilter: MediaTypeFilter;
  evalFilter: string;
  sort: MediaSort;
  selectedItem: MediaItem | null;
  hashParam: string | null;
  lastInternalSelectionRef: MutableRefObject<InternalSelectionState>;
}) {
  const params = new URLSearchParams();

  if (typeFilter !== 'all') {
    params.set('type', typeFilter);
  }
  if (evalFilter) {
    params.set('evalId', evalFilter);
  }
  if (sort.field !== 'createdAt' || sort.order !== 'desc') {
    params.set('sortField', sort.field);
    params.set('sortOrder', sort.order);
  }
  if (selectedItem) {
    params.set('hash', selectedItem.hash);
  } else if (lastInternalSelectionRef.current !== 'cleared' && hashParam) {
    params.set('hash', hashParam);
  }

  return params;
}

function useMediaUrlSync({
  typeFilter,
  evalFilter,
  selectedItem,
  sort,
  hashParam,
  setSearchParams,
  lastInternalSelectionRef,
}: {
  typeFilter: MediaTypeFilter;
  evalFilter: string;
  selectedItem: MediaItem | null;
  sort: MediaSort;
  hashParam: string | null;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
  lastInternalSelectionRef: MutableRefObject<InternalSelectionState>;
}) {
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
    const hasFilterChange = typeFilter !== prev.typeFilter || evalFilter !== prev.evalFilter;
    const hasSelectionChange = currentHash !== prev.selectedHash;
    const hasSortChange = sort.field !== prev.sortField || sort.order !== prev.sortOrder;

    if (!hasFilterChange && !hasSelectionChange && !hasSortChange) {
      return;
    }

    prevUrlStateRef.current = {
      typeFilter,
      evalFilter,
      selectedHash: currentHash,
      sortField: sort.field,
      sortOrder: sort.order,
    };

    const params = buildMediaSearchParams({
      typeFilter,
      evalFilter,
      sort,
      selectedItem,
      hashParam,
      lastInternalSelectionRef,
    });
    const isUserSelection =
      hasSelectionChange &&
      !!selectedItem &&
      lastInternalSelectionRef.current === selectedItem.hash;

    setSearchParams(params, { replace: !isUserSelection });
  }, [
    typeFilter,
    evalFilter,
    selectedItem,
    sort,
    setSearchParams,
    hashParam,
    lastInternalSelectionRef,
  ]);
}

function getDeepLinkErrorMessage(
  error?: 'not_found' | 'network_error' | 'server_error',
): string | null {
  if (!error) {
    return null;
  }

  const errorMessages = {
    not_found: 'Media item not found. It may have been deleted or the link is invalid.',
    network_error: 'Unable to load media item. Please check your connection and try again.',
    server_error: 'Server error while loading media item. Please try again later.',
  };

  return errorMessages[error];
}

function useDeepLinkedMediaSelection({
  hashParam,
  items,
  isLoading,
  setSelectedItem,
  setDeepLinkError,
  setIsDeepLinkLoading,
  lastInternalSelectionRef,
  lastResolvedDeepLinkRef,
}: {
  hashParam: string | null;
  items: MediaItem[];
  isLoading: boolean;
  setSelectedItem: (item: MediaItem | null) => void;
  setDeepLinkError: (error: string | null) => void;
  setIsDeepLinkLoading: (isLoading: boolean) => void;
  lastInternalSelectionRef: MutableRefObject<InternalSelectionState>;
  lastResolvedDeepLinkRef: MutableRefObject<string | null>;
}) {
  useEffect(() => {
    if (!hashParam) {
      lastResolvedDeepLinkRef.current = null;
      lastInternalSelectionRef.current = null;
      setDeepLinkError(null);
      setSelectedItem(null);
      return;
    }

    if (
      lastInternalSelectionRef.current === 'cleared' ||
      hashParam === lastInternalSelectionRef.current ||
      lastResolvedDeepLinkRef.current === hashParam
    ) {
      return;
    }

    const item = items.find((candidate) => candidate.hash === hashParam);
    if (item) {
      lastResolvedDeepLinkRef.current = hashParam;
      setSelectedItem(item);
      setDeepLinkError(null);
      return;
    }

    if (isLoading) {
      return;
    }

    let cancelled = false;
    setIsDeepLinkLoading(true);
    fetchMediaItemByHash(hashParam).then((result) => {
      if (cancelled) {
        return;
      }

      setIsDeepLinkLoading(false);
      if (result.item) {
        lastResolvedDeepLinkRef.current = hashParam;
        setSelectedItem(result.item);
        setDeepLinkError(null);
        return;
      }

      if (result.error === 'not_found') {
        lastResolvedDeepLinkRef.current = hashParam;
      }
      setDeepLinkError(getDeepLinkErrorMessage(result.error));
    });

    return () => {
      cancelled = true;
      setIsDeepLinkLoading(false);
    };
  }, [
    hashParam,
    items,
    isLoading,
    lastInternalSelectionRef,
    lastResolvedDeepLinkRef,
    setDeepLinkError,
    setIsDeepLinkLoading,
    setSelectedItem,
  ]);
}

function DownloadProgressStatus({
  progress,
  onCancel,
}: {
  progress: {
    current: number;
    total: number;
    currentFile: string;
  };
  onCancel: () => void;
}) {
  return (
    <div className="flex items-center gap-3 bg-muted/50 rounded-lg px-3 py-2">
      <div className="flex flex-col gap-1">
        <Progress
          value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0}
          className="w-32 h-2"
        />
        {progress.currentFile && (
          <span className="text-xs text-muted-foreground truncate max-w-32">
            {progress.currentFile}
          </span>
        )}
      </div>
      <span className="text-sm text-muted-foreground tabular-nums">
        {progress.current}/{progress.total}
      </span>
      <Button variant="ghost" size="sm" onClick={onCancel} className="h-6 w-6 p-0">
        <X className="h-4 w-4" />
        <span className="sr-only">Cancel download</span>
      </Button>
    </div>
  );
}

function SelectionDownloadControls({
  selectedCount,
  totalItems,
  isDownloading,
  onToggleAll,
  onDownload,
  onCancelSelection,
}: {
  selectedCount: number;
  totalItems: number;
  isDownloading: boolean;
  onToggleAll: () => void;
  onDownload: () => void;
  onCancelSelection: () => void;
}) {
  const hasAllSelected = selectedCount === totalItems;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">
        {selectedCount} of {totalItems} selected
      </span>
      <Button variant="ghost" size="sm" onClick={onToggleAll}>
        {hasAllSelected ? 'Deselect All' : 'Select All'}
      </Button>
      <Button onClick={onDownload} disabled={isDownloading || selectedCount === 0}>
        <Download className="h-4 w-4 mr-2" />
        Download {selectedCount > 0 ? `(${selectedCount})` : ''}
      </Button>
      <Button variant="ghost" size="sm" onClick={onCancelSelection}>
        <X className="h-4 w-4" />
        <span className="sr-only">Cancel selection</span>
      </Button>
    </div>
  );
}

function BulkDownloadMenu({
  isDownloading,
  itemsCount,
  hasMore,
  total,
  onDownloadAll,
  onSelectItems,
}: {
  isDownloading: boolean;
  itemsCount: number;
  hasMore: boolean;
  total: number;
  onDownloadAll: () => void;
  onSelectItems: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={isDownloading}>
          <Download className="h-4 w-4 mr-2" />
          {isDownloading ? 'Downloading...' : 'Download'}
          <ChevronDown className="h-4 w-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onDownloadAll}>
          <Download className="h-4 w-4 mr-2" />
          Download All ({itemsCount}
          {hasMore ? ` of ${total}` : ''} loaded)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSelectItems}>
          <MousePointerClick className="h-4 w-4 mr-2" />
          Select Items...
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MediaHeaderActions({
  itemsCount,
  total,
  hasMore,
  isDownloading,
  isSelectionMode,
  selectedCount,
  downloadProgress,
  onCancelDownload,
  onToggleAll,
  onDownloadSelected,
  onToggleSelectionMode,
  onDownloadAll,
}: {
  itemsCount: number;
  total: number;
  hasMore: boolean;
  isDownloading: boolean;
  isSelectionMode: boolean;
  selectedCount: number;
  downloadProgress: {
    current: number;
    total: number;
    currentFile: string;
  };
  onCancelDownload: () => void;
  onToggleAll: () => void;
  onDownloadSelected: () => void;
  onToggleSelectionMode: () => void;
  onDownloadAll: () => void;
}) {
  if (itemsCount === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {isDownloading && (
        <DownloadProgressStatus progress={downloadProgress} onCancel={onCancelDownload} />
      )}
      {isSelectionMode ? (
        <SelectionDownloadControls
          selectedCount={selectedCount}
          totalItems={itemsCount}
          isDownloading={isDownloading}
          onToggleAll={onToggleAll}
          onDownload={onDownloadSelected}
          onCancelSelection={onToggleSelectionMode}
        />
      ) : (
        <BulkDownloadMenu
          isDownloading={isDownloading}
          itemsCount={itemsCount}
          hasMore={hasMore}
          total={total}
          onDownloadAll={onDownloadAll}
          onSelectItems={onToggleSelectionMode}
        />
      )}
    </div>
  );
}

export default function Media() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { hashParam, typeParam, evalParam, sortFieldParam, sortOrderParam } =
    getMediaUrlState(searchParams);

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
  const [deepLinkError, setDeepLinkError] = useState<string | null>(null);
  const [isDeepLinkLoading, setIsDeepLinkLoading] = useState(false);
  const [showBulkDownloadConfirm, setShowBulkDownloadConfirm] = useState(false);
  const downloadAbortRef = useRef<AbortController | null>(null);

  // Eval search state — lifted here so the server-side search can be debounced
  const [evalSearchQuery, setEvalSearchQuery] = useState('');
  const deferredEvalSearch = useDeferredValue(evalSearchQuery);

  // Selection state for bulk operations
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());

  // Track internal selection state to coordinate between URL sync and hash effects.
  // - null: initial state, no internal action yet (preserve URL hash for deep linking)
  // - string: user selected an item with this hash
  // - 'cleared': user explicitly closed/cleared selection (remove hash from URL)
  const lastInternalSelectionRef = useRef<InternalSelectionState>(null);
  const lastResolvedDeepLinkRef = useRef<string | null>(null);

  // Data fetching
  const {
    items,
    total,
    isLoading,
    isLoadingMore,
    error,
    hasMore,
    blobStorageEnabled,
    loadMore,
    refresh,
  } = useMediaItems({ type: typeFilter, evalId: evalFilter || undefined, sort });
  const {
    evals,
    isLoading: evalsLoading,
    error: evalsError,
    isTruncated: evalsTruncated,
  } = useEvalsWithMedia(deferredEvalSearch || undefined);

  // Telemetry
  const { recordEvent } = useTelemetry();

  // Record page view once on mount
  useEffect(() => {
    recordEvent('feature_used', { feature: 'media_library' });
  }, [recordEvent]);

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

  useMediaUrlSync({
    typeFilter,
    evalFilter,
    selectedItem,
    sort,
    hashParam,
    setSearchParams,
    lastInternalSelectionRef,
  });
  useDeepLinkedMediaSelection({
    hashParam,
    items,
    isLoading,
    setSelectedItem,
    setDeepLinkError,
    setIsDeepLinkLoading,
    lastInternalSelectionRef,
    lastResolvedDeepLinkRef,
  });

  const handleTypeFilterChange = useCallback(
    (type: MediaTypeFilter) => {
      setTypeFilter(type);
      lastInternalSelectionRef.current = 'cleared';
      setSelectedItem(null);
      setSelectedHashes(new Set());
      recordEvent('feature_used', {
        feature: 'media_library_filter',
        filterType: 'type',
        value: type,
      });
    },
    [recordEvent],
  );

  const handleEvalFilterChange = useCallback(
    (evalId: string) => {
      setEvalFilter(evalId);
      lastInternalSelectionRef.current = 'cleared';
      setSelectedItem(null);
      setSelectedHashes(new Set());
      recordEvent('feature_used', { feature: 'media_library_filter', filterType: 'eval' });
    },
    [recordEvent],
  );

  const handleClearFilters = useCallback(() => {
    setTypeFilter('all');
    setEvalFilter('');
    lastInternalSelectionRef.current = 'cleared';
    setSelectedItem(null);
    setSelectedHashes(new Set());
  }, []);

  const handleItemClick = useCallback(
    (item: MediaItem) => {
      lastInternalSelectionRef.current = item.hash;
      setSelectedItem(item);
      recordEvent('feature_used', { feature: 'media_library_view', mediaKind: item.kind });
    },
    [recordEvent],
  );

  const handleModalClose = useCallback(() => {
    lastInternalSelectionRef.current = 'cleared';
    setSelectedItem(null);
  }, []);

  const handleModalNavigate = useCallback((item: MediaItem) => {
    lastInternalSelectionRef.current = item.hash;
    // Clear so browser Back can re-resolve previously visited hashes
    // instead of short-circuiting in the deep-link effect.
    lastResolvedDeepLinkRef.current = null;
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

    // Track bulk download usage
    recordEvent('feature_used', {
      feature: 'media_library_download',
      downloadType: isSelectionMode && selectedHashes.size > 0 ? 'selected' : 'all',
      count: itemsToDownload.length,
    });

    // Cancel any in-progress download loop
    downloadAbortRef.current?.abort();
    downloadAbortRef.current = new AbortController();
    const signal = downloadAbortRef.current.signal;

    setIsDownloading(true);
    setDownloadProgress({ current: 0, total: itemsToDownload.length, currentFile: '' });

    try {
      // Trigger browser downloads one by one via anchor elements.
      // Anchor-based downloads handle presigned URL redirects (CORS-safe) but
      // cannot report per-file errors — the browser manages each download.
      const baseUrl = getApiBaseUrl();
      for (let i = 0; i < itemsToDownload.length; i++) {
        if (signal.aborted) {
          break;
        }

        const item = itemsToDownload[i];
        const filename = generateMediaFilename(item.hash, item.mimeType);

        setDownloadProgress({ current: i, total: itemsToDownload.length, currentFile: filename });

        downloadFile(`${baseUrl}/api/blobs/${item.hash}`, filename);

        setDownloadProgress({ current: i + 1, total: itemsToDownload.length, currentFile: '' });

        // Delay between downloads to avoid overwhelming the browser
        await new Promise((r) => setTimeout(r, 200));
      }
    } finally {
      setIsDownloading(false);
      setDownloadProgress({ current: 0, total: 0, currentFile: '' });
      // Exit selection mode after download
      if (isSelectionMode) {
        setIsSelectionMode(false);
        setSelectedHashes(new Set());
      }
    }
  }, [items, isSelectionMode, selectedHashes, recordEvent]);

  const handleCancelDownload = useCallback(() => {
    downloadAbortRef.current?.abort();
  }, []);

  const hasFilters = typeFilter !== 'all' || !!evalFilter;
  const showEmptyState = !isLoading && items.length === 0;

  return (
    <PageContainer>
      <PageHeader>
        <div className="container max-w-7xl mx-auto px-6 py-6">
          <div className="flex flex-col gap-4 min-[390px]:flex-row min-[390px]:items-start min-[390px]:justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Media Library</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Browse images, videos, and audio generated by your evaluations
              </p>
            </div>
            <MediaHeaderActions
              itemsCount={items.length}
              total={total}
              hasMore={hasMore}
              isDownloading={isDownloading}
              isSelectionMode={isSelectionMode}
              selectedCount={selectedHashes.size}
              downloadProgress={downloadProgress}
              onCancelDownload={handleCancelDownload}
              onToggleAll={
                selectedHashes.size === items.length ? handleDeselectAll : handleSelectAll
              }
              onDownloadSelected={() => {
                if (selectedHashes.size > 10) {
                  setShowBulkDownloadConfirm(true);
                } else {
                  handleBulkDownload();
                }
              }}
              onToggleSelectionMode={handleToggleSelectionMode}
              onDownloadAll={() => {
                if (items.length > 10) {
                  setShowBulkDownloadConfirm(true);
                } else {
                  handleBulkDownload();
                }
              }}
            />
          </div>
        </div>
      </PageHeader>

      <div className="p-6">
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
              evalsLoading={evalsLoading}
              evalsError={evalsError}
              evalsTruncated={evalsTruncated}
              evalSearchQuery={evalSearchQuery}
              onEvalSearchQueryChange={setEvalSearchQuery}
              total={total}
            />
          </Card>

          {/* Error State */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">{error}</span>
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
              <AlertDescription className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="min-w-0">{deepLinkError}</span>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
                  {/* Retry button for transient errors (not "not found") */}
                  {!deepLinkError.includes('not found') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (!hashParam) {
                          return;
                        }
                        setDeepLinkError(null);
                        setIsDeepLinkLoading(true);
                        fetchMediaItemByHash(hashParam).then((result) => {
                          setIsDeepLinkLoading(false);
                          if (result.item) {
                            lastResolvedDeepLinkRef.current = hashParam;
                            setSelectedItem(result.item);
                          } else {
                            if (result.error === 'not_found') {
                              lastResolvedDeepLinkRef.current = hashParam;
                            }
                            const errorMessages = {
                              not_found: `Media item not found. It may have been deleted or the link is invalid.`,
                              network_error: `Unable to load media item. Please check your connection and try again.`,
                              server_error: `Server error while loading media item. Please try again later.`,
                            };
                            setDeepLinkError(result.error ? errorMessages[result.error] : null);
                          }
                        });
                      }}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Retry
                    </Button>
                  )}
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
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Content */}
          <MediaErrorBoundary>
            {showEmptyState ? (
              <MediaEmptyState
                hasFilters={hasFilters}
                blobStorageEnabled={blobStorageEnabled}
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
                {!(isSelectionMode && selectedHashes.size > 0) && hasMore && (
                  <> Scroll down to load more items before downloading if you need all {total}.</>
                )}
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
