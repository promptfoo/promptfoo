import { useCallback, useEffect, useRef, useState } from 'react';

import EnterpriseBanner from '@app/components/EnterpriseBanner';
import { Button } from '@app/components/ui/button';
import { Spinner } from '@app/components/ui/spinner';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import { EVAL_ROUTES } from '@app/constants/routes';
import { ShiftKeyProvider } from '@app/contexts/ShiftKeyContext';
import { usePageMeta } from '@app/hooks/usePageMeta';
import useApiConfig from '@app/stores/apiConfig';
import { callApi } from '@app/utils/api';
import { type ResultLightweightWithLabel } from '@promptfoo/types';
import { useLocation, useNavigate } from 'react-router';
import { io as SocketIOClient } from 'socket.io-client';
import EmptyState from './EmptyState';
import ResultsView from './ResultsView';
import { ResultsFilter, useResultsViewSettingsStore, useTableStore } from './store';
import type { PaginationState } from '@tanstack/react-table';
import './Eval.css';

import { useToast } from '@app/hooks/useToast';
import logger from '../../../../../logger';
import { useFilterMode } from './FilterModeProvider';
import { useComparisonEvalIds } from './useComparisonEvalIds';
import {
  buildEvalUrlWithSearchParams,
  parseEvalOutputPromptHash,
  setEvalDetailsHash,
} from './utils';

interface EvalOptions {
  /**
   * ID of a specific eval to load.
   */
  fetchId: string | null;
}

/** Payload the view-server socket emits on its 'init' / 'update' events. */
type EvalRefreshSignal = { deletedEvalIds?: string[]; evalId?: string } | null;

function parseFiltersParam(filtersParam: string | null): ResultsFilter[] | null {
  if (!filtersParam) {
    return [];
  }

  try {
    return JSON.parse(filtersParam) as ResultsFilter[];
  } catch {
    return null;
  }
}

/** True when a delete signal removed the displayed eval (or all evals, for a delete-all). */
function displayedEvalWasDeleted(
  displayedEvalId: string | null | undefined,
  deletedEvalIds: string[],
): boolean {
  return (
    deletedEvalIds.length === 0 ||
    (displayedEvalId ? deletedEvalIds.includes(displayedEvalId) : false)
  );
}

export default function Eval({ fetchId }: EvalOptions) {
  const navigate = useNavigate();
  const location = useLocation();
  const { apiBaseUrl } = useApiConfig();
  const { showToast } = useToast();

  const {
    table,
    tableError,
    tableSource,
    setTable,
    config,
    setConfig,
    evalId,
    setEvalId,
    setAuthor,
    fetchEvalData,
    setIsStreaming,
  } = useTableStore();

  const { filterMode } = useFilterMode();

  const { setInComparisonMode, setComparisonEvalIds } = useResultsViewSettingsStore();
  const [comparisonEvalIds, updateComparisonEvalIds] = useComparisonEvalIds(fetchId);
  const searchRef = useRef(location.search);
  searchRef.current = location.search;

  // ================================
  // State
  // ================================

  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [recentEvals, setRecentEvals] = useState<ResultLightweightWithLabel[]>([]);
  const [defaultEvalId, setDefaultEvalId] = useState<string | undefined>(undefined);
  const isHydratingFiltersRef = useRef(false);
  const currentEvalIdRef = useRef(evalId);
  const routeContextRef = useRef({ apiBaseUrl, fetchId });
  routeContextRef.current = { apiBaseUrl, fetchId };
  const loadRequestIdRef = useRef(0);
  const tablePaginationRef = useRef<PaginationState | null>(null);
  const handlePaginationChange = useCallback((pagination: PaginationState | null) => {
    tablePaginationRef.current = pagination;
  }, []);
  currentEvalIdRef.current = evalId;

  // ================================
  // Handlers
  // ================================

  const recentRequest = useRef(0);
  const fetchRecentFileEvals = async () => {
    const request = ++recentRequest.current;
    try {
      const resp = await callApi('/results', { cache: 'no-store' });
      if (!resp.ok) {
        return;
      }
      const { data } = (await resp.json()) as { data: ResultLightweightWithLabel[] };
      if (request === recentRequest.current && loadEvalById === loadEvalByIdRef.current) {
        setRecentEvals(data);
      }
      return data;
    } catch (error) {
      logger.error('[Eval] Error fetching recent evaluations', { error });
    }
  };

  /**
   * Triggers the fetching of a specific eval by id. Eval data is populated in the table store.
   *
   * @param {string} id - The eval ID to load
   * @param {boolean} isBackgroundUpdate - Whether this is a background update (e.g., from socket) that shouldn't show loading state
   * @returns {Boolean} Whether the eval was loaded successfully.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  const loadEvalById = useCallback(
    async (id: string, isBackgroundUpdate = false) => {
      const requestId = ++loadRequestIdRef.current;
      try {
        const pagination = (currentEvalIdRef.current === id
          ? tablePaginationRef.current
          : null) ?? { pageIndex: 0, pageSize: 50 };
        setFailed(false);
        const comparisons = comparisonEvalIds.filter((comparisonId) => comparisonId !== id);
        setComparisonEvalIds(comparisons);
        setInComparisonMode(comparisons.length > 0);
        setEvalId(id);

        const { filters, activeEvalQuery } = useTableStore.getState();
        const queryOptions =
          isBackgroundUpdate && activeEvalQuery?.evalId === id
            ? activeEvalQuery.options
            : {
                ...pagination,
                filterMode,
                searchText: new URLSearchParams(searchRef.current).get('search') || '',
                filters: Object.values(filters.values).filter((filter) => {
                  if (filter.type === 'metadata') {
                    return Boolean(filter.field && (filter.operator === 'exists' || filter.value));
                  }
                  if (filter.type === 'metric' && filter.operator === 'is_defined') {
                    return Boolean(filter.field);
                  }
                  return Boolean(filter.value);
                }),
              };

        const data = await fetchEvalData(id, {
          ...queryOptions,
          skipSettingEvalId: true,
          skipLoadingState: isBackgroundUpdate,
        });
        return requestId === loadRequestIdRef.current && !!data;
      } catch (error) {
        console.error('Error loading eval:', error);
        if (requestId === loadRequestIdRef.current) {
          setFailed(true);
        }
        return false;
      }
    },
    [
      apiBaseUrl,
      fetchId,
      fetchEvalData,
      setFailed,
      setEvalId,
      filterMode,
      comparisonEvalIds,
      setComparisonEvalIds,
      setInComparisonMode,
    ],
  );

  // Loader identity includes route/API context to invalidate socket lookups after navigation.
  const loadEvalByIdRef = useRef(loadEvalById);
  loadEvalByIdRef.current = loadEvalById;

  const clearEvalState = useCallback(() => {
    loadRequestIdRef.current += 1;
    recentRequest.current += 1;
    setFailed(false);
    setTable(null);
    setConfig(null);
    setEvalId('');
    setAuthor(null);
    setLoaded(true);
  }, [setAuthor, setConfig, setEvalId, setTable]);

  const reloadInBackground = async (id: string) => {
    setIsStreaming(true);
    try {
      await loadEvalByIdRef.current(id, true);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleDeletion = async (deletedIds: string[]) => {
    const recents = await fetchRecentFileEvals();
    // A deletion survives in-page filter or comparison changes, but must not
    // redirect an unrelated evaluation after navigation or an API switch.
    const route = routeContextRef.current;
    const displayedId = route.fetchId ?? currentEvalIdRef.current;
    if (apiBaseUrl !== route.apiBaseUrl || !displayedEvalWasDeleted(displayedId, deletedIds)) {
      return;
    }
    const latestId = recents?.[0]?.evalId;
    if (!latestId) {
      clearEvalState();
      if (route.fetchId) {
        navigate(EVAL_ROUTES.ROOT, { replace: true });
      }
      return;
    }
    setDefaultEvalId(latestId);
    if (route.fetchId) {
      navigate(EVAL_ROUTES.DETAIL(latestId), { replace: true });
    } else {
      await reloadInBackground(latestId);
    }
  };

  const handleResultsFile = async (data: EvalRefreshSignal) => {
    if (!data) {
      clearEvalState();
      return;
    }
    const { deletedEvalIds, evalId: scopedId } = data;
    if (deletedEvalIds) {
      return handleDeletion(deletedEvalIds);
    }

    // Refresh a pinned evaluation even when the dropdown lookup fails.
    const refreshPinned = fetchId && scopedId === fetchId;
    const [recents] = await Promise.all([
      fetchRecentFileEvals(),
      refreshPinned ? reloadInBackground(fetchId) : null,
    ]);
    if (!recents || loadEvalById !== loadEvalByIdRef.current) {
      return;
    }
    const latestId = recents[0]?.evalId;
    if (!latestId) {
      if (!refreshPinned) {
        clearEvalState();
        if (fetchId) {
          navigate(EVAL_ROUTES.ROOT, { replace: true });
        }
      }
      return;
    }
    setDefaultEvalId(latestId);
    if (!fetchId && (!scopedId || scopedId === currentEvalIdRef.current || scopedId === latestId)) {
      await reloadInBackground(scopedId ?? latestId);
    }
  };

  // Keep the latest handler in a ref so the socket effect only depends on the connection
  // target (apiBaseUrl) plus the stable setIsStreaming setter — never on filterMode/fetchId.
  const handleResultsFileRef = useRef(handleResultsFile);
  handleResultsFileRef.current = handleResultsFile;

  /**
   * Updates the URL with the selected eval id, triggering a re-render of the Eval component.
   */
  const handleRecentEvalSelection = useCallback(
    (id: string) => {
      // A selected eval has a different result set, so row-scoped deep links from the
      // previous eval must not carry into the destination URL.
      navigate(
        buildEvalUrlWithSearchParams(
          { pathname: EVAL_ROUTES.DETAIL(id), search: location.search, hash: '' },
          (params) => {
            params.delete('rowId');
            params.delete('comparisonEvalIds');
          },
        ),
      );
    },
    [location.search, navigate],
  );

  const replaceSearchParams = useCallback(
    (mutateSearchParams: (params: URLSearchParams) => void) => {
      // Filter changes can change the visible result set, so any existing details
      // deep-link is stale and should not be carried into the replacement URL.
      setEvalDetailsHash('');
      navigate(
        buildEvalUrlWithSearchParams(
          { pathname: location.pathname, search: location.search, hash: '' },
          (params) => {
            mutateSearchParams(params);
            params.delete('rowId');
          },
        ),
        { replace: true },
      );
    },
    [location.pathname, location.search, navigate],
  );

  // ================================
  // Effects
  // ================================

  /**
   * Listens for changes to the filters state. Updates the URL query string with the new filters.
   */
  useEffect(() => {
    const unsubscribe = useTableStore.subscribe(
      (state) => state.filters,
      (_filters, previousFilters) => {
        if (isHydratingFiltersRef.current) {
          return;
        }

        // Read the search params from the URL. Does not use the hook to avoid re-running when the search params change.
        const _searchParams = new URLSearchParams(window.location.search);

        // Do search params need to be removed?
        if (_filters.appliedCount === 0) {
          const didClearAppliedFilters = previousFilters.appliedCount > 0;
          // `replaceSearchParams` also drops `rowId` and the details hash, so it must
          // still run when those are present after a filter clear even if there is no
          // `filter` param.
          if (
            didClearAppliedFilters &&
            (_searchParams.has('filter') ||
              _searchParams.has('rowId') ||
              parseEvalOutputPromptHash(window.location.hash) !== null)
          ) {
            replaceSearchParams((params) => {
              params.delete('filter');
            });
          }
        } else if (_filters.appliedCount > 0) {
          // Serialize the filters to a JSON string
          const serializedFilters = JSON.stringify(Object.values(_filters.values));
          // Check whether the serialized filters are already in the search params
          if (_searchParams.get('filter') !== serializedFilters) {
            replaceSearchParams((params) => {
              params.set('filter', serializedFilters);
            });
          }
        }
      },
    );
    return () => unsubscribe();
  }, [replaceSearchParams]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    const _searchParams = new URLSearchParams(window.location.search);

    // Use getState() to avoid adding functions to dependencies
    const { resetFilters: doResetFilters, addFilter: doAddFilter } = useTableStore.getState();

    // Read search params
    const filters = parseFiltersParam(_searchParams.get('filter'));

    isHydratingFiltersRef.current = true;
    try {
      doResetFilters();
      filters?.forEach((filter) => {
        doAddFilter(filter);
      });
    } finally {
      isHydratingFiltersRef.current = false;
    }

    if (!filters) {
      showToast('Invalid filter parameter in URL: filters must be valid JSON', 'error');
      return;
    }

    let cancelled = false;
    if (fetchId) {
      logger.debug('[Eval] Fetching eval by id', { fetchId });
      const run = async () => {
        const success = await loadEvalById(fetchId);
        if (success && !cancelled) {
          setDefaultEvalId(fetchId);
          // Load other recent eval runs
          fetchRecentFileEvals();
          // Note: setLoaded(true) is handled by the useEffect that watches for table updates
        }
      };
      run();
    } else {
      logger.debug('[Eval] Fetching eval via recent', {});
      // Fetch from server
      const run = async () => {
        const loadRequestId = loadRequestIdRef.current;
        const evals = await fetchRecentFileEvals();
        if (cancelled || loadRequestId !== loadRequestIdRef.current) {
          return;
        }
        if (!evals) {
          const current = useTableStore.getState();
          if (
            current.table &&
            current.tableSource?.evalId === current.evalId &&
            current.tableSource.apiBaseUrl === apiBaseUrl
          ) {
            await loadEvalById(current.evalId);
          } else {
            setFailed(true);
          }
          return;
        }
        if (evals.length > 0) {
          const defaultEvalId = evals[0].evalId;
          const success = await loadEvalById(defaultEvalId);
          if (success && !cancelled) {
            setDefaultEvalId(defaultEvalId);
            // Note: setLoaded(true) is handled by the useEffect that watches for table updates
          }
        } else {
          // No evals exist - clear stale state and show empty state
          clearEvalState();
        }
      };
      run();
    }
    return () => {
      cancelled = true;
    };
  }, [
    apiBaseUrl,
    clearEvalState,
    fetchId,
    loadEvalById,
    retryAttempt,
    setDefaultEvalId,
    // Note: resetFilters and addFilter are accessed via getState() to avoid dependency issues
  ]);

  // The websocket only needs to be rebuilt when its connection target (apiBaseUrl) changes.
  // The message handler is read from handleResultsFileRef, so filterMode / fetchId / eval
  // navigation update the handler in place instead of tearing down and reopening the socket
  // (which would otherwise drop signals during the reconnect gap).
  useEffect(() => {
    if (!IS_RUNNING_LOCALLY) {
      return;
    }

    logger.debug('[Eval] Using local server websocket', {});

    // Determine socket path based on deployment configuration:
    // - If apiBaseUrl points to a different origin, use default /socket.io (remote server manages its own)
    // - If apiBaseUrl has a path component on same origin, derive socket path from it
    // - If no apiBaseUrl, use VITE_PUBLIC_BASENAME for same-origin reverse proxy deployments
    let socketPath = '/socket.io';
    let socketUrl = '';

    if (apiBaseUrl) {
      try {
        const url = new URL(apiBaseUrl, window.location.origin);
        const isSameOrigin = url.origin === window.location.origin;
        if (isSameOrigin && url.pathname !== '/') {
          // Same origin with path prefix - derive socket path from API base
          socketPath = `${url.pathname.replace(/\/$/, '')}/socket.io`;
        }
        // For different origins, use default /socket.io and connect to that host
        socketUrl = isSameOrigin ? '' : apiBaseUrl;
      } catch {
        // Invalid URL, fall back to defaults
      }
    } else {
      // No apiBaseUrl - use build-time base path for same-origin deployment
      const basePath = import.meta.env.VITE_PUBLIC_BASENAME || '';
      if (basePath) {
        socketPath = `${basePath}/socket.io`;
      }
    }

    const socket = SocketIOClient(socketUrl, { path: socketPath });

    // socket.io does not await event handlers, so two quickly-emitted events (e.g. the delete
    // and update components of one coalesced signal, or several back-to-back scoped updates)
    // would otherwise run their async table reloads concurrently — and whichever DB response
    // landed last, possibly an OLDER eval's, would win the table. Serialize the handler runs so
    // events apply in arrival order. The returned promise lets tests await the queued work.
    let pending: Promise<void> = Promise.resolve();
    const enqueue = (data: EvalRefreshSignal): Promise<void> => {
      pending = pending
        .then(() => handleResultsFileRef.current(data))
        .catch((error) => {
          logger.error('[Eval] Error handling socket update', { error });
        });
      return pending;
    };

    socket
      .on('init', (data) => {
        logger.debug('[Eval] Initialized socket connection', { data });
        return enqueue(data);
      })
      /**
       * The user has run `promptfoo eval` and a new latest eval
       * result has been received.
       */
      .on('update', (data) => {
        logger.debug('[Eval] Received data update', { data });
        return enqueue(data);
      });

    return () => {
      socket.disconnect();
      setIsStreaming(false);
    };
  }, [apiBaseUrl, setIsStreaming]);

  usePageMeta({
    title: config?.description || evalId || 'Eval',
    description: 'View evaluation results',
  });

  /**
   * If and when a table is available, set loaded to true.
   *
   * Constructing the table is a time-expensive operation; therefore `setLoaded(true)` is not called
   * immediately after the table store is populated. Otherwise, `loaded` will be true before
   * the table is defined resulting in a race condition.
   */
  useEffect(() => {
    if (table && !loaded) {
      setLoaded(true);
    }
  }, [table, loaded]);

  // ================================
  // Rendering
  // ================================

  const tableMatchesSelection =
    tableSource?.apiBaseUrl === apiBaseUrl &&
    tableSource?.evalId === evalId &&
    JSON.stringify(tableSource?.comparisonEvalIds) ===
      JSON.stringify(comparisonEvalIds.filter((id) => id !== evalId));

  if (failed || (tableError && (!table || !tableMatchesSelection))) {
    const comparing = comparisonEvalIds.length > 0;
    const status = failed ? undefined : tableError?.status;
    if (!comparing && status === 404) {
      return <div className="notice">404 Eval not found</div>;
    }
    return (
      <div className="notice space-y-3" role="alert">
        <p>
          {comparing && (status === 400 || status === 404)
            ? 'Unable to load comparison. All evaluations must exist and use the same dataset.'
            : `Unable to load ${comparing ? 'comparison' : 'evaluation'}. Please try again.`}
        </p>
        {comparing && status === 413 && (
          <p>Clear comparison, choose fewer results per page, and compare again.</p>
        )}
        <div className="flex justify-center gap-2">
          <Button onClick={() => setRetryAttempt((attempt) => attempt + 1)}>Retry</Button>
          {comparing && (
            <Button onClick={() => updateComparisonEvalIds([])}>Clear comparison</Button>
          )}
        </div>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="notice">
        <div>
          <Spinner className="size-5" />
        </div>
        <div>Waiting for eval data</div>
      </div>
    );
  }

  if (!table) {
    return <EmptyState />;
  }

  // Check if this is a redteam eval
  const isRedteam = config?.redteam !== undefined;

  return (
    <ShiftKeyProvider>
      {isRedteam && evalId && <EnterpriseBanner evalId={evalId} className="mb-4 mt-4 mx-4" />}
      <ResultsView
        defaultEvalId={defaultEvalId}
        recentEvals={recentEvals}
        onRecentEvalSelected={handleRecentEvalSelection}
        onPaginationChange={handlePaginationChange}
        onRetry={() => {
          if (evalId) {
            void loadEvalById(evalId);
          }
        }}
      />
    </ShiftKeyProvider>
  );
}
