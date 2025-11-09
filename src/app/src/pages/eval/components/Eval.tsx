import { useCallback, useEffect, useRef, useState } from 'react';

import EnterpriseBanner from '@app/components/EnterpriseBanner';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import { ShiftKeyProvider } from '@app/contexts/ShiftKeyContext';
import { usePageMeta } from '@app/hooks/usePageMeta';
import useApiConfig from '@app/stores/apiConfig';
import { callApi } from '@app/utils/api';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import {
  EvalResultsFilterMode,
  type ResultLightweightWithLabel,
  type ResultsFile,
} from '@promptfoo/types';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { io as SocketIOClient } from 'socket.io-client';
import EmptyState from './EmptyState';
import ResultsView from './ResultsView';
import { resultsFiltersArraySchema, useResultsViewSettingsStore, useTableStore } from './store';
import { MAX_FILTERS_FROM_URL } from './constants';
import type { ResultsFilter, ResultsFilterType, ResultsFilterOperator } from './store';
import './Eval.css';

/**
 * Serializes a filter object for URL comparison with deterministic key ordering.
 * Strips internal fields (id, sortIndex) and sorts keys alphabetically for consistent JSON output.
 * This must match the serialization logic in ResultsView.tsx subscription.
 */
function serializeFilterForComparison(filter: Partial<ResultsFilter>): Record<string, any> {
  // biome-ignore lint/correctness/noUnusedVariables: id and sortIndex are intentionally excluded from comparison
  const { id, sortIndex, ...rest } = filter as any;
  const sortedKeys = Object.keys(rest).sort();
  const sorted: Record<string, any> = {};
  for (const key of sortedKeys) {
    sorted[key] = rest[key];
  }
  return sorted;
}

/**
 * Parses filters from URL search params and applies them to the store.
 * Supports both new JSON format (?filter=[...]) and legacy params (?plugin=, ?metric=, ?policy=).
 */
function parseAndApplyFiltersFromUrl(
  searchParams: URLSearchParams,
  addFilter: (filter: {
    type: ResultsFilterType;
    operator: ResultsFilterOperator;
    value: string;
    logicOperator?: 'and' | 'or';
    field?: string;
  }) => void,
  setFilterMode: (mode: EvalResultsFilterMode) => void,
  resetFilterMode: () => void,
) {
  // Try new filter format first (JSON array)
  const newFiltersParam = searchParams.get('filter');

  if (newFiltersParam) {
    try {
      const parsedFilters = JSON.parse(newFiltersParam);
      const validationResult = resultsFiltersArraySchema.safeParse(parsedFilters);

      if (validationResult.success) {
        // Limit number of filters to prevent DoS
        const filtersToApply = validationResult.data.slice(0, MAX_FILTERS_FROM_URL);

        if (validationResult.data.length > MAX_FILTERS_FROM_URL) {
          console.warn(
            `URL contains ${validationResult.data.length} filters. Limited to ${MAX_FILTERS_FROM_URL}.`,
          );
        }

        filtersToApply.forEach((filter) => {
          addFilter({
            type: filter.type,
            operator: filter.operator,
            value: filter.value,
            logicOperator: filter.logicOperator,
            field: filter.field,
          });
        });
      } else {
        console.error('Invalid filters in URL:', validationResult.error);
      }
    } catch (error) {
      console.error('Failed to parse filters from URL:', error);
    }
  } else {
    // Fall back to legacy format for backward compatibility
    const legacyParamConfigs = [
      { param: 'plugin', type: 'plugin' as const },
      { param: 'metric', type: 'metric' as const },
      { param: 'policy', type: 'policy' as const },
    ];

    for (const { param, type } of legacyParamConfigs) {
      const values = searchParams.getAll(param);
      if (values.length > 0) {
        values.forEach((value) => {
          addFilter({
            type,
            operator: 'equals',
            value,
            logicOperator: 'or',
          });
        });
      }
    }
  }

  // Handle filter mode param
  const modeParam = searchParams.get('mode');
  if (modeParam && EvalResultsFilterMode.safeParse(modeParam).success) {
    setFilterMode(modeParam as EvalResultsFilterMode);
  } else {
    resetFilterMode();
  }
}

interface EvalOptions {
  /**
   * ID of a specific eval to load.
   */
  fetchId: string | null;
}

export default function Eval({ fetchId }: EvalOptions) {
  const navigate = useNavigate();
  const { apiBaseUrl } = useApiConfig();
  const [searchParams] = useSearchParams();

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
    resetFilters,
    addFilter,
    setIsStreaming,
    setFilterMode,
    resetFilterMode,
  } = useTableStore();

  const { setInComparisonMode, setComparisonEvalIds } = useResultsViewSettingsStore();

  // ================================
  // State
  // ================================

  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [recentEvals, setRecentEvals] = useState<ResultLightweightWithLabel[]>([]);
  const [defaultEvalId, setDefaultEvalId] = useState<string | undefined>(undefined);

  // Ref to track current eval ID being loaded (prevents race conditions)
  const currentEvalIdRef = useRef<string | null>(null);

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
  const loadEvalById = useCallback(
    async (id: string, isBackgroundUpdate = false) => {
      try {
        // Track current eval ID to prevent race conditions
        currentEvalIdRef.current = id;
        setEvalId(id);

        const { filters, filterMode } = useTableStore.getState();

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

        // Check if we're still on the same eval (user may have navigated away)
        if (currentEvalIdRef.current !== id) {
          console.log(
            `Eval ${id} loaded but user navigated to ${currentEvalIdRef.current}, ignoring`,
          );
          return false;
        }

        if (!data) {
          setFailed(true);
          return false;
        }
        return true;
      } catch (error) {
        console.error('Error loading eval:', error);
        // Only set failed if still on same eval
        if (currentEvalIdRef.current === id) {
          setFailed(true);
        }
        return false;
      }
    },
    [fetchEvalData, setFailed, setEvalId],
  );

  /**
   * Updates the URL with the selected eval id, triggering a re-render of the Eval component.
   */
  const handleRecentEvalSelection = useCallback(
    async (id: string) => {
      navigate({
        pathname: `/eval/${encodeURIComponent(id)}`,
        search: searchParams.toString(),
      });
    },
    [searchParams, navigate],
  );

  // ================================
  // Effects
  // ================================

  // Effect 1: Handle eval loading when fetchId changes
  useEffect(() => {
    // Reset filters when navigating to a different eval
    resetFilters();

    // Apply filters from URL for the new eval
    parseAndApplyFiltersFromUrl(searchParams, addFilter, setFilterMode, resetFilterMode);

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

      const socket = SocketIOClient(apiBaseUrl || '');

      /**
       * Populates the table store with the most recent eval result.
       */
      const handleResultsFile = async (data: ResultsFile | null) => {
        // If no data provided (e.g., no evals exist yet), clear stale state and mark as loaded
        if (!data) {
          console.log('No eval data available');
          setTable(null);
          setConfig(null);
          setEvalId('');
          setAuthor(null);
          setLoaded(true);
          return;
        }

        // Set streaming state when we start receiving data
        setIsStreaming(true);

        const newRecentEvals = await fetchRecentFileEvals();
        if (newRecentEvals && newRecentEvals.length > 0) {
          const newId = newRecentEvals[0].evalId;
          setDefaultEvalId(newId);
          setEvalId(newId);
          await loadEvalById(newId, true); // Pass true for isBackgroundUpdate since this is from socket
        }

        // Clear streaming state after update is complete
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    // apiBaseUrl is only used in socket.io branch when fetchId is null, omit to prevent unnecessary reruns
    fetchId,
    // loadEvalById, setTableFromResultsFile, setConfig, setAuthor, setEvalId, setDefaultEvalId,
    // setInComparisonMode, setComparisonEvalIds, setIsStreaming are stable Zustand store functions
    // resetFilters, addFilter, setFilterMode, resetFilterMode are stable Zustand store functions
    searchParams,
  ]);

  // Effect 2: Handle filter updates from URL (browser back/forward)
  // This runs when searchParams changes but only applies changes if filters actually differ from store
  const prevFetchId = useRef<string | null>(null);
  const hasInitializedForFetchId = useRef<string | null>(null);

  useEffect(() => {
    // Skip if we haven't initialized for this fetchId yet - Effect 1 handles initial filter setup
    if (hasInitializedForFetchId.current !== fetchId) {
      hasInitializedForFetchId.current = fetchId;
      prevFetchId.current = fetchId;
      return;
    }

    // Skip if eval changed (Effect 1 handles that)
    if (prevFetchId.current !== fetchId) {
      prevFetchId.current = fetchId;
      return;
    }

    const currentFiltersParam = searchParams.get('filter');

    // Get current filters from store and serialize them the same way the subscription does
    const { filters } = useTableStore.getState();
    const serializedStoreFilters =
      filters.appliedCount > 0
        ? JSON.stringify(
            Object.values(filters.values)
              .map(serializeFilterForComparison)
              .sort((a, b) => {
                // Sort filters by type then value for consistent ordering
                const typeCompare = a.type.localeCompare(b.type);
                if (typeCompare !== 0) {
                  return typeCompare;
                }
                return a.value.localeCompare(b.value);
              }),
          )
        : null;

    // Only apply URL filters if they differ from current store state
    if (currentFiltersParam !== serializedStoreFilters) {
      console.log('URL filters differ from store - syncing from URL (browser back/forward)');
      resetFilters();
      parseAndApplyFiltersFromUrl(searchParams, addFilter, setFilterMode, resetFilterMode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    searchParams,
    fetchId,
    // resetFilters, addFilter, setFilterMode, resetFilterMode are stable Zustand store functions
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
          <CircularProgress size={22} />
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
        <Box sx={{ mb: 2, mt: 2, mx: 2 }}>
          <EnterpriseBanner evalId={evalId} />
        </Box>
      )}
      <ResultsView
        defaultEvalId={defaultEvalId}
        recentEvals={recentEvals}
        onRecentEvalSelected={handleRecentEvalSelection}
      />
    </ShiftKeyProvider>
  );
}
