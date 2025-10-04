import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

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
import { useResultsViewSettingsStore, useEvalTable } from '../hooks';
import { evalKeys } from '../hooks/queryKeys';
import { useEvalUIStore } from '../store/uiStore';
import './Eval.css';

interface EvalOptions {
  /**
   * ID of a specific eval to load.
   */
  fetchId: string | null;
}

export default function Eval({ fetchId }: EvalOptions) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { apiBaseUrl } = useApiConfig();
  const [searchParams] = useSearchParams();

  // Client state from UI store
  const {
    evalId,
    setEvalId,
    filters,
    filterMode,
    setIsStreaming,
    resetFilters,
    addFilter,
    setFilterMode,
    resetFilterMode,
  } = useEvalUIStore();

  const { setInComparisonMode, setComparisonEvalIds, comparisonEvalIds } =
    useResultsViewSettingsStore();

  // Server state from React Query
  const { data: evalData, isLoading, error } = useEvalTable(evalId, {
    pageIndex: 0,
    pageSize: 50,
    filterMode,
    searchText: '',
    filters: Object.values(filters.values).filter((filter) =>
      filter.type === 'metadata' ? Boolean(filter.value && filter.field) : Boolean(filter.value),
    ),
    comparisonEvalIds,
  });

  // Local UI state
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
   * Triggers the fetching of a specific eval by id.
   * With React Query, we just set the evalId and the hook automatically refetches.
   */
  const loadEvalById = useCallback(
    async (id: string, isBackgroundUpdate = false) => {
      try {
        setEvalId(id);

        // If it's a background update (from socket), invalidate to force refetch
        if (isBackgroundUpdate) {
          await queryClient.invalidateQueries({ queryKey: evalKeys.byId(id) });
        }

        // React Query will automatically fetch when evalId changes
        return true;
      } catch (error) {
        console.error('Error loading eval:', error);
        setFailed(true);
        return false;
      }
    },
    [setEvalId, queryClient],
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
    // Reset filters when navigating to a different eval; necessary because the UI store
    // is global.
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
        }
      };
      run();
    } else if (IS_RUNNING_LOCALLY) {
      console.log('Eval init: Using local server websocket');

      const socket = SocketIOClient(apiBaseUrl || '');

      /**
       * Handles incoming results from websocket.
       */
      const handleResultsFile = async (data: ResultsFile | null, isInit: boolean = false) => {
        // If no data provided (e.g., no evals exist yet), clear stale state and mark as loaded
        if (!data) {
          console.log('No eval data available');
          setEvalId('');
          setLoaded(true);
          return;
        }

        // Set streaming state when we start receiving data
        setIsStreaming(true);

        const newRecentEvals = await fetchRecentFileEvals();
        if (newRecentEvals && newRecentEvals.length > 0) {
          const newId = newRecentEvals[0].evalId;
          setDefaultEvalId(newId);
          await loadEvalById(newId, true); // Pass true for isBackgroundUpdate
        }

        // Clear streaming state after update is complete
        setIsStreaming(false);
      };

      socket
        .on('init', async (data) => {
          console.log('Initialized socket connection', data);
          await handleResultsFile(data, true);
        })
        .on('update', async (data) => {
          console.log('Received data update', data);
          await handleResultsFile(data, false);
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
          }
        } else {
          // No evals exist - show empty state
          setEvalId('');
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
    setEvalId,
    setDefaultEvalId,
    setInComparisonMode,
    setComparisonEvalIds,
    resetFilters,
    setIsStreaming,
    addFilter,
    setFilterMode,
    resetFilterMode,
    searchParams,
  ]);

  usePageMeta({
    title: evalData?.config?.description || evalId || 'Eval',
    description: 'View evaluation results',
  });

  /**
   * If and when eval data is available, set loaded to true.
   */
  useEffect(() => {
    if (evalData?.table && !loaded) {
      setLoaded(true);
    }
  }, [evalData, loaded]);

  // Handle errors
  useEffect(() => {
    if (error) {
      setFailed(true);
    }
  }, [error]);

  // ================================
  // Rendering
  // ================================

  if (failed) {
    return <div className="notice">404 Eval not found</div>;
  }

  if (!loaded || isLoading) {
    return (
      <div className="notice">
        <div>
          <CircularProgress size={22} />
        </div>
        <div>Waiting for eval data</div>
      </div>
    );
  }

  if (!evalData?.table) {
    return <EmptyState />;
  }

  // Check if this is a redteam eval
  const isRedteam = evalData?.config?.redteam !== undefined;

  return (
    <ShiftKeyProvider>
      {isRedteam && evalId && (
        <Box sx={{ mb: 2, mt: 2, mx: 2 }}>
          <EnterpriseBanner evalId={evalId} />
        </Box>
      )}
      <ResultsView
        recentEvals={recentEvals}
        onRecentEvalSelected={handleRecentEvalSelection}
        defaultEvalId={defaultEvalId}
      />
    </ShiftKeyProvider>
  );
}
