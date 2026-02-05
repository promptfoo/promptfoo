import { useCallback, useEffect, useState } from 'react';

import EnterpriseBanner from '@app/components/EnterpriseBanner';
import { Spinner } from '@app/components/ui/spinner';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import { EVAL_ROUTES } from '@app/constants/routes';
import { ShiftKeyProvider } from '@app/contexts/ShiftKeyContext';
import { usePageMeta } from '@app/hooks/usePageMeta';
import useApiConfig from '@app/stores/apiConfig';
import { callApi } from '@app/utils/api';
import { type ResultLightweightWithLabel, type ResultsFile } from '@promptfoo/types';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { io as SocketIOClient } from 'socket.io-client';
import EmptyState from './EmptyState';
import ResultsView from './ResultsView';
import { ResultsFilter, useResultsViewSettingsStore, useTableStore } from './store';
import './Eval.css';

import { useToast } from '@app/hooks/useToast';
import { useFilterMode } from './FilterModeProvider';

interface EvalOptions {
  /**
   * ID of a specific eval to load.
   */
  fetchId: string | null;
}

export default function Eval({ fetchId }: EvalOptions) {
  const navigate = useNavigate();
  const { apiBaseUrl } = useApiConfig();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();

  const {
    table,
    setTable,
    setTableFromResultsFile,
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

  // ================================
  // Handlers
  // ================================

  const fetchRecentFileEvals = async () => {
    const resp = await callApi(`/results`, { cache: 'no-store' });
    if (!resp.ok) {
      setFailed(true);
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

  /**
   * Updates the URL with the selected eval id, triggering a re-render of the Eval component.
   */
  const handleRecentEvalSelection = useCallback(
    async (id: string) => {
      navigate({
        pathname: EVAL_ROUTES.DETAIL(id),
        search: searchParams.toString(),
      });
    },
    [searchParams, navigate],
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
      (_filters) => {
        // Read the search params from the URL. Does not use the hook to avoid re-running when the search params change.
        const _searchParams = new URLSearchParams(window.location.search);

        // Do search params need to be removed?
        if (_filters.appliedCount === 0) {
          // clear the search params
          setSearchParams(
            (prev) => {
              prev.delete('filter');
              return prev;
            },
            { replace: true },
          );
        } else if (_filters.appliedCount > 0) {
          // Serialize the filters to a JSON string
          const serializedFilters = JSON.stringify(Object.values(_filters.values));
          // Check whether the serialized filters are already in the search params
          if (_searchParams.get('filter') !== serializedFilters) {
            // Add each filter to the search params
            setSearchParams(
              (prev) => {
                prev.set('filter', serializedFilters);
                return prev;
              },
              { replace: true },
            );
          }
        }
      },
    );
    return () => unsubscribe();
  }, [setSearchParams]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional
  useEffect(() => {
    const _searchParams = new URLSearchParams(window.location.search);

    // Use getState() to avoid adding functions to dependencies
    const { resetFilters: doResetFilters, addFilter: doAddFilter } = useTableStore.getState();

    doResetFilters();

    // Read search params
    const filtersParam = _searchParams.get('filter');

    if (filtersParam) {
      let filters: ResultsFilter[] = [];
      try {
        filters = JSON.parse(filtersParam) as ResultsFilter[];
      } catch {
        showToast('Invalid filter parameter in URL: filters must be valid JSON', 'error');
        return;
      }
      filters.forEach((filter: ResultsFilter) => {
        doAddFilter(filter);
      });
    }

    if (fetchId) {
      console.log('Eval init: Fetching eval by id', { fetchId });
      const run = async () => {
        const success = await loadEvalById(fetchId);
        if (success) {
          setDefaultEvalId(fetchId);
          // Load other recent eval runs
          fetchRecentFileEvals();
          // Note: setLoaded(true) is handled by the useEffect that watches for table updates
        }
      };
      run();
    } else if (IS_RUNNING_LOCALLY) {
      console.log('Eval init: Using local server websocket');

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

      /**
       * Populates the table store with the most recent eval result by fetching the data by eval ID
       */
      const handleResultsFile = async (data: ResultsFile | { evalId?: string } | null) => {
        if (!data) {
          console.log('No eval data available');
          setTable(null);
          setConfig(null);
          setEvalId('');
          setAuthor(null);
          setLoaded(true);
          return;
        }

        setIsStreaming(true);

        const newRecentEvals = await fetchRecentFileEvals();
        if (newRecentEvals && newRecentEvals.length > 0) {
          const newId = newRecentEvals[0].evalId;
          setDefaultEvalId(newId);
          setEvalId(newId);
          await loadEvalById(newId, true);
        }

        setIsStreaming(false);
      };

      socket
        .on('init', async (data) => {
          console.log('Initialized socket connection', data);
          await handleResultsFile(data);
        })
        /**
         * The user has run `promptfoo eval` and a new latest eval
         * result has been received.
         */
        .on('update', async (data) => {
          console.log('Received data update', data);
          await handleResultsFile(data);
        });

      return () => {
        socket.disconnect();
        setIsStreaming(false);
      };
    } else {
      console.log('Eval init: Fetching eval via recent');
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
          setTable(null);
          setConfig(null);
          setEvalId('');
          setAuthor(null);
          setLoaded(true);
        }
      };
      run();
    }
    console.log('Eval init: Resetting comparison mode');
    setInComparisonMode(false);
    setComparisonEvalIds([]);
  }, [
    apiBaseUrl,
    fetchId,
    loadEvalById,
    setTableFromResultsFile,
    setConfig,
    setAuthor,
    setEvalId,
    setDefaultEvalId,
    setInComparisonMode,
    setComparisonEvalIds,
    setIsStreaming,
    // Note: resetFilters and addFilter are accessed via getState() to avoid dependency issues
  ]);

  usePageMeta({
    title: config?.description || evalId || 'Eval',
    description: 'View evaluation results',
  });

  /**
   * If and when a table is available, set loaded to true.
   *
   * Constructing the table is a time-expensive operation; therefore `setLoaded(true)` is not called
   * immediately after `setTableFromResultsFile` is called. Otherwise, `loaded` will be true before
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
      {isRedteam && evalId && (
        <div className="mb-4 mt-4 mx-4">
          <EnterpriseBanner evalId={evalId} />
        </div>
      )}
      <ResultsView
        defaultEvalId={defaultEvalId}
        recentEvals={recentEvals}
        onRecentEvalSelected={handleRecentEvalSelection}
      />
    </ShiftKeyProvider>
  );
}
