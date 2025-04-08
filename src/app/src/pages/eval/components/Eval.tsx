import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import { ShiftKeyProvider } from '@app/contexts/ShiftKeyContext';
import useApiConfig from '@app/stores/apiConfig';
import { callApi } from '@app/utils/api';
import CircularProgress from '@mui/material/CircularProgress';
import type { ResultLightweightWithLabel, ResultsFile } from '@promptfoo/types';
import { io as SocketIOClient } from 'socket.io-client';
import useSWR from 'swr';
import useSWRSubscription from 'swr/subscription';
import EmptyState from './EmptyState';
import ResultsView from './ResultsView';
import { useStore } from './store';
import type { EvalId } from './types';
import './Eval.css';

// ==================================================================================================
// Types
// ==================================================================================================

interface EvalOptions {
  fetchId: EvalId | null;
}

// ==================================================================================================
// Constants
// ==================================================================================================

const DEFAULT_COLUMN_VISIBILITY_COUNT = 5;

// ==================================================================================================
// Default Component
// ==================================================================================================

export default function Eval({ fetchId }: EvalOptions) {
  const navigate = useNavigate();
  const { apiBaseUrl } = useApiConfig();

  const socketEndpoint = apiBaseUrl ?? '';

  // ==================================================================================================
  // Store
  // ==================================================================================================

  const {
    table,
    setTableFromResultsFile,
    config,
    setConfig,
    evalId,
    setEvalId,
    setAuthor,
    setInComparisonMode,
    setColumnState,
  } = useStore();

  // ==================================================================================================
  // State
  // ==================================================================================================

  const [loaded, setLoaded] = useState<boolean>(false);

  // ==================================================================================================
  // Data Fetching: Websocket
  // ==================================================================================================

  /**
   * On mount, subscribe to the websocket and receive updates.
   */
  const { data: socketData, error: socketError } = useSWRSubscription(
    IS_RUNNING_LOCALLY ? socketEndpoint : null,
    (key, { next }) => {
      const socket = SocketIOClient(key);
      socket.on('init', (data: ResultsFile) => next(null, data));
      socket.on('update', (data: ResultsFile) => next(null, data));
      socket.on('error', (error: Error) => next(error));
      return () => socket.disconnect();
    },
  );

  // ==================================================================================================
  // Data Fetching: Recent Evals
  // ==================================================================================================

  /**
   * On mount, fetch the most recent evals.
   */
  const { data: recentEvalsData, error: recentEvalsError } = useSWR<{
    data: ResultLightweightWithLabel[];
  }>('/results', (key: string) => callApi(key, { cache: 'no-store' }).then((res) => res.json()));

  const recentEvals = recentEvalsData?.data;

  // ==================================================================================================
  // Data Fetching: Eval by ID
  // ==================================================================================================

  /**
   * When an eval id is set, fetch the eval data.
   */
  const { data: evalByIdData, error: evalByIdError } = useSWR<{
    data: ResultsFile;
  }>(evalId ? `/results/${evalId}` : null, (key: string) =>
    callApi(key, { cache: 'no-store' }).then((res) => res.json()),
  );

  // ==================================================================================================
  // Event Handlers
  // ==================================================================================================

  const handleRecentEvalSelection = async (id: string) => {
    navigate(`/eval/?evalId=${encodeURIComponent(id)}`);
  };

  // ==================================================================================================
  // Effects
  // ==================================================================================================

  /**
   * Populate store values in response to data changes.
   */
  useEffect(() => {
    // Populate the ID from the URL or the most recent eval:
    const _evalId =
      fetchId ??
      (recentEvalsData && recentEvalsData.data.length > 0 ? recentEvalsData.data[0].evalId : null);

    // Populate the eval id:
    if (_evalId) {
      setEvalId(_evalId);
    }

    // Populate data:
    const data = socketData ?? evalByIdData;
    if (data) {
      setTableFromResultsFile(data);
      setConfig(data?.config);
      setAuthor(data?.author || null);

      /**
       * Populate the default column visibility state:
       */
      if (evalId) {
        const vars = Object.keys(data.results.results[0].testCase.vars);
        setColumnState(evalId, {
          selectedColumns: vars
            .slice(0, DEFAULT_COLUMN_VISIBILITY_COUNT)
            .map((v: any, index: number) => `Variable ${index + 1}`),
          columnVisibility: vars.reduce((acc: any, v: any, index: number) => {
            acc[`Variable ${index + 1}`] = index < DEFAULT_COLUMN_VISIBILITY_COUNT ? true : false;
            return acc;
          }, {}),
        });
      }

      setLoaded(true);
    }

    setInComparisonMode(false);
  }, [socketData, fetchId, recentEvalsData, evalByIdData]);

  /**
   * Set document title.
   */
  useEffect(() => {
    document.title = `${config?.description || evalId || 'Eval'} | promptfoo`;
  }, [config, evalId]);

  // ==================================================================================================
  // Render
  // ==================================================================================================

  const failed = socketError || recentEvalsError || evalByIdError;

  if (failed) {
    return <div className="notice">404 Eval not found</div>;
  }

  if (loaded && !table) {
    return <EmptyState />;
  }

  if (!loaded || !table) {
    return (
      <div className="notice">
        <div>
          <CircularProgress size={22} />
        </div>
        <div>Waiting for eval data</div>
      </div>
    );
  }

  return (
    <ShiftKeyProvider>
      {
        // TODO(Will): Can we enter a state where the results view should be displayed but there is no eval id? e.g. when websockets are issuing updates?
        evalId && (
          <ResultsView
            recentEvals={recentEvals ?? []}
            onRecentEvalSelected={handleRecentEvalSelection}
          />
        )
      }
    </ShiftKeyProvider>
  );
}
