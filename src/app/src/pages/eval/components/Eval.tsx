import { useCallback, useEffect, useRef, useState } from 'react';

import EnterpriseBanner from '@app/components/EnterpriseBanner';
import { Spinner } from '@app/components/ui/spinner';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import { EVAL_ROUTES } from '@app/constants/routes';
import { ShiftKeyProvider } from '@app/contexts/ShiftKeyContext';
import { usePageMeta } from '@app/hooks/usePageMeta';
import useApiConfig from '@app/stores/apiConfig';
import { callApi } from '@app/utils/api';
import { type ResultLightweightWithLabel } from '@promptfoo/types';
import { useLocation, useNavigate } from 'react-router-dom';
import { io as SocketIOClient } from 'socket.io-client';
import EmptyState from './EmptyState';
import ResultsView from './ResultsView';
import { ResultsFilter, useResultsViewSettingsStore, useTableStore } from './store';
import './Eval.css';

import { useToast } from '@app/hooks/useToast';
import logger from '../../../../../logger';
import { useFilterMode } from './FilterModeProvider';
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

  // ================================
  // State
  // ================================

  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [recentEvals, setRecentEvals] = useState<ResultLightweightWithLabel[]>([]);
  const [defaultEvalId, setDefaultEvalId] = useState<string | undefined>(undefined);
  const isHydratingFiltersRef = useRef(false);
  const currentEvalIdRef = useRef(evalId);
  currentEvalIdRef.current = evalId;

  // ================================
  // Handlers
  // ================================

  const fetchRecentFileEvals = async ({
    reportFailure = true,
  }: {
    reportFailure?: boolean;
  } = {}) => {
    const resp = await callApi(`/results`, { cache: 'no-store' });
    if (!resp.ok) {
      if (reportFailure) {
        setFailed(true);
      }
      return;
    }
    const body = (await resp.json()) as { data: ResultLightweightWithLabel[] };
    setRecentEvals(body.data);
    return body.data;
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
      try {
        setEvalId(id);

        const { filters } = useTableStore.getState();

        const data = await fetchEvalData(id, {
          skipSettingEvalId: true,
          skipLoadingState: isBackgroundUpdate,
          filterMode,
          filters: Object.values(filters.values).filter((filter) =>
            filter.type === 'metadata'
              ? Boolean(filter.value && filter.field)
              : Boolean(filter.value),
          ),
        });

        if (!data) {
          setFailed(true);
          return false;
        }
        return true;
      } catch (error) {
        console.error('Error loading eval:', error);
        setFailed(true);
        return false;
      }
    },
    [fetchEvalData, setFailed, setEvalId, filterMode],
  );

  const clearEvalState = useCallback(() => {
    setTable(null);
    setConfig(null);
    setEvalId('');
    setAuthor(null);
    setLoaded(true);
  }, [setAuthor, setConfig, setEvalId, setTable]);

  /**
   * Populates the table store from a websocket signal. Explicit /eval/:id routes stay
   * pinned (they only reload when their own eval changes), while the root /eval route
   * follows the latest eval. Held in a ref (below) so the socket effect never has to tear
   * down and reopen the connection when this handler's dependencies (e.g. filterMode via
   * loadEvalById, or fetchId on navigation) change.
   */
  const handleResultsFile = async (data: EvalRefreshSignal) => {
    if (!data) {
      logger.debug('[Eval] No eval data available', {});
      clearEvalState();
      return;
    }

    const deletedEvalIds = 'deletedEvalIds' in data ? data.deletedEvalIds : undefined;
    const scopedEvalId = 'evalId' in data ? data.evalId : undefined;

    // Reload the displayed table in the background, suppressing the page-level loading
    // flash. Streaming is scoped to the actual reload so signals that don't change the
    // current view (e.g. a scoped update for a different pinned eval) never toggle the
    // streaming indicator. loadEvalById sets the eval id itself.
    const reloadInBackground = async (id: string) => {
      setIsStreaming(true);
      try {
        await loadEvalById(id, true);
      } finally {
        setIsStreaming(false);
      }
    };

    // Pinned /eval/:id route + a scoped update for THIS eval: reload it directly via
    // /eval/:id/table. The recent-evals list is only needed for the dropdown, so fetch it
    // concurrently and don't let a transient /api/results failure drop the pinned eval's refresh.
    if (fetchId && deletedEvalIds === undefined && scopedEvalId === fetchId) {
      const [recents] = await Promise.all([
        fetchRecentFileEvals({ reportFailure: false }),
        reloadInBackground(fetchId),
      ]);
      if (recents && recents.length > 0) {
        setDefaultEvalId(recents[0].evalId);
      }
      return;
    }

    const newRecentEvals = await fetchRecentFileEvals({ reportFailure: false });
    if (!newRecentEvals) {
      // Recents are unavailable. If the socket told us the pinned eval was deleted, don't strand
      // the user on a now-gone /eval/:id — fall back to the root route, which reconciles on load.
      if (
        fetchId &&
        deletedEvalIds !== undefined &&
        displayedEvalWasDeleted(fetchId, deletedEvalIds)
      ) {
        clearEvalState();
        navigate(EVAL_ROUTES.ROOT, { replace: true });
      }
      return;
    }
    if (newRecentEvals.length === 0) {
      clearEvalState();
      if (fetchId) {
        navigate(EVAL_ROUTES.ROOT, { replace: true });
      }
      return;
    }

    const latestEvalId = newRecentEvals[0].evalId;
    const displayedEvalId = fetchId ?? currentEvalIdRef.current;
    setDefaultEvalId(latestEvalId);

    if (deletedEvalIds) {
      if (displayedEvalWasDeleted(displayedEvalId, deletedEvalIds)) {
        if (fetchId) {
          navigate(EVAL_ROUTES.DETAIL(latestEvalId), { replace: true });
        } else {
          await reloadInBackground(latestEvalId);
        }
      }
      return;
    }

    const updatedEvalId = scopedEvalId ?? latestEvalId;
    const shouldReload =
      fetchId === null
        ? scopedEvalId === undefined ||
          scopedEvalId === currentEvalIdRef.current ||
          scopedEvalId === latestEvalId
        : scopedEvalId === fetchId;
    if (shouldReload) {
      await reloadInBackground(updatedEvalId);
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

    if (fetchId) {
      logger.debug('[Eval] Fetching eval by id', { fetchId });
      const run = async () => {
        const success = await loadEvalById(fetchId);
        if (success) {
          setDefaultEvalId(fetchId);
          // Load other recent eval runs
          fetchRecentFileEvals({ reportFailure: false });
          // Note: setLoaded(true) is handled by the useEffect that watches for table updates
        }
      };
      run();
    } else if (!IS_RUNNING_LOCALLY) {
      logger.debug('[Eval] Fetching eval via recent', {});
      // Fetch from server
      const run = async () => {
        const evals = await fetchRecentFileEvals();
        if (evals && evals.length > 0) {
          const defaultEvalId = evals[0].evalId;
          const success = await loadEvalById(defaultEvalId);
          if (success) {
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
    logger.debug('[Eval] Resetting comparison mode', {});
    setInComparisonMode(false);
    setComparisonEvalIds([]);
  }, [
    apiBaseUrl,
    clearEvalState,
    fetchId,
    loadEvalById,
    setDefaultEvalId,
    setInComparisonMode,
    setComparisonEvalIds,
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

  if (failed) {
    return <div className="notice">404 Eval not found</div>;
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
      />
    </ShiftKeyProvider>
  );
}
