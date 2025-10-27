import { useCallback, useEffect, useState } from 'react';

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
import { useResultsViewSettingsStore, useTableStore } from './store';
import './Eval.css';

interface EvalOptions {
  /**
   * ID of a specific eval to load.
   */
  fetchId: string | null;

  /** NEW: baseline eval ID from URL (?baseline=...) */
  baselineId?: string | null;

  /** NEW: handler to change/clear baseline (updates URL in page.tsx) */
  onBaselineChange?: (id: string | null) => void;
}

export default function Eval({ 
  fetchId,
  baselineId = null,
  onBaselineChange, 
}: EvalOptions) {
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

  useEffect(() => {
    // Reset filters when navigating to a different eval; necessary because Zustand
    // is a global store.
    resetFilters();

    // Check for a `plugin` param in the URL; we support filtering on plugins via the URL which
    // enables the "View Logs" functionality in Vulnerability reports.
    const pluginParams = searchParams.getAll('plugin');

    // Check for >=1 metric params in the URL.
    const metricParams = searchParams.getAll('metric');

    // Check for >=1 policyId params in the URL.
    const policyIdParams = searchParams.getAll('policy');

    // Check for a `mode` param in the URL.
    const modeParam = searchParams.get('mode');

    if (pluginParams.length > 0) {
      pluginParams.forEach((pluginParam) => {
        addFilter({
          type: 'plugin',
          operator: 'equals',
          value: pluginParam,
          logicOperator: 'or',
        });
      });
    }

    if (metricParams.length > 0) {
      metricParams.forEach((metricParam) => {
        addFilter({
          type: 'metric',
          operator: 'equals',
          value: metricParam,
          logicOperator: 'or',
        });
      });
    }

    if (policyIdParams.length > 0) {
      policyIdParams.forEach((policyId) => {
        addFilter({
          type: 'policy',
          operator: 'equals',
          value: policyId,
          logicOperator: 'or',
        });
      });
    }

    // If a mode param is provided, set the filter mode to the provided value.
    // Otherwise, reset the filter mode to ensure that the filter mode from the previously viewed eval
    // is not applied (again, because Zustand is a global store).
    if (modeParam && EvalResultsFilterMode.safeParse(modeParam).success) {
      setFilterMode(modeParam as EvalResultsFilterMode);
    } else {
      resetFilterMode();
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
    resetFilters,
    setIsStreaming,
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

        // new: pass baseline props down to the viewer surface
        baselineId={baselineId}
        onBaselineChange={onBaselineChange?? (()=> {})}
      />
    </ShiftKeyProvider>
  );
}
