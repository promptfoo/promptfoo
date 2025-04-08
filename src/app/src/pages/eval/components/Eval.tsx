import { useEffect, useState, useCallback } from 'react';
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

interface EvalOptions {
  fetchId: EvalId | null;
}

export default function Eval({ fetchId }: EvalOptions) {
  const navigate = useNavigate();
  const { apiBaseUrl } = useApiConfig();

  const socketEndpoint = apiBaseUrl ?? '';

  // ==================================================================================================
  // Store
  // ==================================================================================================

  const {
    table,
    setTable,
    setTableFromResultsFile,
    config,
    setConfig,
    evalId,
    setEvalId,
    setAuthor,
    setInComparisonMode,
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
      socket.on('init', (data) => next(null, data));
      socket.on('update', (data) => next(null, data));
      socket.on('error', (error) => next(error));
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
  // Event Handlers
  // ==================================================================================================

  const fetchEvalById = useCallback(
    async (id: string) => {
      const resp = await callApi(`/results/${id}`, { cache: 'no-store' });
      if (!resp.ok) {
        //setFailed(true);
        return;
      }
      const body = (await resp.json()) as { data: ResultsFile };

      setTableFromResultsFile(body.data);
      setConfig(body.data.config);
      setAuthor(body.data.author);
      setEvalId(id);
    },
    [setTable, setConfig, setEvalId, setAuthor],
  );

  const handleRecentEvalSelection = async (id: string) => {
    navigate(`/eval/?evalId=${encodeURIComponent(id)}`);
  };

  // ==================================================================================================
  // Effects
  // ==================================================================================================

  /**
   * Store-mutation effects:
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
    if (socketData) {
      setTableFromResultsFile(socketData);
      setConfig(socketData?.config);
      setAuthor(socketData?.author || null);
      setLoaded(true);
    }

    // setColumnState(evalId, {
    //   selectedColumns: vars.map((v: any, index: number) => `Variable ${index + 1}`),
    //   columnVisibility: vars.reduce((acc: any, v: any, index: number) => {
    //     acc[`Variable ${index + 1}`] = true;
    //     return acc;
    //   }, {}),
    // });
  }, [socketData, fetchId, recentEvalsData]);

  /**
   * Load the eval data.
   */
  useEffect(() => {
    const evalId = fetchId;
    if (evalId) {
      console.log('Eval init: Fetching eval by id', { fetchId });
      const run = async () => {
        await fetchEvalById(evalId);
        setLoaded(true);
        //setDefaultEvalId(evalId);
        // Load other recent eval runs
        //fetchRecentFileEvals();
      };
      run();
    } else if (IS_RUNNING_LOCALLY) {
      console.log('Eval init: Using local server websocket');
      // socket.on('init', (data) => {
      //   console.log('Initialized socket connection', data);
      //   setLoaded(true);
      //   setTableFromResultsFile(data);
      //   setConfig(data?.config);
      //   setAuthor(data?.author || null);
      //   fetchRecentFileEvals().then((newRecentEvals) => {
      //     if (newRecentEvals && newRecentEvals.length > 0) {
      //       setDefaultEvalId(newRecentEvals[0]?.evalId);
      //       setEvalId(newRecentEvals[0]?.evalId);
      //       console.log('setting default eval id', newRecentEvals[0]?.evalId);
      //     }
      //   });
      // });

      // socket.on('update', (data) => {
      //   console.log('Received data update', data);
      //   setTableFromResultsFile(data);
      //   setConfig(data.config);
      //   setAuthor(data.author || null);
      //   fetchRecentFileEvals().then((newRecentEvals) => {
      //     if (newRecentEvals && newRecentEvals.length > 0) {
      //       const newId = newRecentEvals[0]?.evalId;
      //       if (newId) {
      //         setDefaultEvalId(newId);
      //         setEvalId(newId);
      //       }
      //     }
      //   });
      // });
    } else {
      console.log('Eval init: Fetching eval via recent');
      // Fetch from server
      const run = async () => {
        const evals = await fetchRecentFileEvals();
        if (evals && evals.length > 0) {
          const defaultEvalId = evals[0].evalId;
          const resp = await callApi(`/results/${defaultEvalId}`);
          const body = await resp.json();
          setTableFromResultsFile(body.data);
          setConfig(body.data.config);
          setAuthor(body.data.author || null);
          setLoaded(true);
          setDefaultEvalId(defaultEvalId);
          setEvalId(defaultEvalId);
        } else {
          return (
            <div className="notice">
              No evals yet. Share some evals to this server and they will appear here.
            </div>
          );
        }
      };
      run();
    }
    setInComparisonMode(false);
  }, [
    apiBaseUrl,
    fetchId,
    setTable,
    setConfig,
    setAuthor,
    setEvalId,
    fetchEvalById,
    setInComparisonMode,
  ]);

  /**
   * Set document title.
   */
  useEffect(() => {
    document.title = `${config?.description || evalId || 'Eval'} | promptfoo`;
  }, [config, evalId]);

  // ==================================================================================================
  // Render
  // ==================================================================================================

  const failed = socketError || recentEvalsError;

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
