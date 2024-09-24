'use client';

import * as React from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import { ShiftKeyProvider } from '@app/contexts/ShiftKeyContext';
import { ToastProvider } from '@app/contexts/ToastContext';
import useApiConfig from '@app/stores/apiConfig';
import { callApi } from '@app/utils/api';
import CircularProgress from '@mui/material/CircularProgress';
import type { SharedResults, ResultLightweightWithLabel, ResultsFile } from '@promptfoo/types';
import type { EvaluateTable } from '@promptfoo/types';
import { io as SocketIOClient } from 'socket.io-client';
import EmptyState from './EmptyState';
import ResultsView from './ResultsView';
import { useStore } from './store';
import './Eval.css';

interface EvalOptions {
  fetchId?: string;
  preloadedData?: SharedResults;
  recentEvals?: ResultLightweightWithLabel[];
  defaultEvalId?: string;
}

export default function Eval({
  fetchId,
  preloadedData,
  recentEvals: recentEvalsProp,
  defaultEvalId: defaultEvalIdProp,
}: EvalOptions) {
  const navigate = useNavigate();
  const { apiBaseUrl } = useApiConfig();

  const { table, setTable, config, setConfig, evalId, setEvalId, setAuthor, setInComparisonMode } =
    useStore();
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [recentEvals, setRecentEvals] = React.useState<ResultLightweightWithLabel[]>(
    recentEvalsProp || [],
  );

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

  const fetchEvalById = React.useCallback(
    async (id: string) => {
      const resp = await callApi(`/results/${id}`, { cache: 'no-store' });
      const body = (await resp.json()) as { data: ResultsFile };
      setTable(body.data.results.table);
      setConfig(body.data.config);
      setAuthor(body.data.author);
      setEvalId(id);
    },
    [setTable, setConfig, setEvalId, setAuthor],
  );

  const handleRecentEvalSelection = async (id: string) => {
    navigate(`/eval/?evalId=${encodeURIComponent(id)}`);
  };

  const [defaultEvalId, setDefaultEvalId] = React.useState<string>(
    defaultEvalIdProp || recentEvals[0]?.evalId,
  );

  const [searchParams] = useSearchParams();
  const searchEvalId = searchParams.get('evalId');

  React.useEffect(() => {
    const evalId = searchEvalId || fetchId;
    if (evalId) {
      console.log('Eval init: Fetching eval by id', { searchEvalId, fetchId });
      const run = async () => {
        await fetchEvalById(evalId);
        setLoaded(true);
        setDefaultEvalId(evalId);
        // Load other recent eval runs
        fetchRecentFileEvals();
      };
      run();
    } else if (preloadedData) {
      console.log('Eval init: Using preloaded data');
      setTable(preloadedData.data.results?.table as EvaluateTable);
      setConfig(preloadedData.data.config);
      setAuthor(preloadedData.data.author || null);
      setLoaded(true);
    } else if (IS_RUNNING_LOCALLY) {
      console.log('Eval init: Using local server websocket');

      const socket = SocketIOClient(apiBaseUrl || '');

      socket.on('init', (data) => {
        console.log('Initialized socket connection', data);
        setLoaded(true);
        setTable(data?.results.table);
        setConfig(data?.config);
        setAuthor(data?.author || null);
        fetchRecentFileEvals().then((newRecentEvals) => {
          if (newRecentEvals && newRecentEvals.length > 0) {
            setDefaultEvalId(newRecentEvals[0]?.evalId);
            setEvalId(newRecentEvals[0]?.evalId);
            console.log('setting default eval id', newRecentEvals[0]?.evalId);
          }
        });
      });

      socket.on('update', (data) => {
        console.log('Received data update', data);
        setTable(data.results.table);
        setConfig(data.config);
        setAuthor(data.author || null);
        fetchRecentFileEvals().then((newRecentEvals) => {
          if (newRecentEvals && newRecentEvals.length > 0) {
            const newId = newRecentEvals[0]?.evalId;
            if (newId) {
              setDefaultEvalId(newId);
              setEvalId(newId);
            }
          }
        });
      });

      return () => {
        socket.disconnect();
      };
    } else {
      console.log('Eval init: Fetching eval via recent');
      // Fetch from server
      const run = async () => {
        const evals = await fetchRecentFileEvals();
        if (evals && evals.length > 0) {
          const defaultEvalId = evals[0].evalId;
          const resp = await callApi(`/results/${defaultEvalId}`);
          const body = await resp.json();
          setTable(body.data.results.table);
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
    preloadedData,
    setDefaultEvalId,
    searchEvalId,
    setInComparisonMode,
  ]);

  React.useEffect(() => {
    document.title = `${config?.description || evalId || 'Eval'} | promptfoo`;
  }, [config, evalId]);

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
    <ToastProvider>
      <ShiftKeyProvider>
        <ResultsView
          defaultEvalId={defaultEvalId}
          recentEvals={recentEvals}
          onRecentEvalSelected={handleRecentEvalSelection}
        />
      </ShiftKeyProvider>
    </ToastProvider>
  );
}
