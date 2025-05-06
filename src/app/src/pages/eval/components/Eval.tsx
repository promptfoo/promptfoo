import React, { useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import EnterpriseBanner from '@app/components/EnterpriseBanner';
import { IS_RUNNING_LOCALLY } from '@app/constants';
import { ShiftKeyProvider } from '@app/contexts/ShiftKeyContext';
import useApiConfig from '@app/stores/apiConfig';
import { callApi } from '@app/utils/api';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';
import type { ResultLightweightWithLabel, ResultsFile } from '@promptfoo/types';
import { io as SocketIOClient } from 'socket.io-client';
import EmptyState from './EmptyState';
import ResultsView from './ResultsView';
import { useResultsViewSettingsStore, useStore } from './store';
import './Eval.css';

interface EvalOptions {
  fetchId: string | null;
}

async function fetchRecentFileEvals() {
  const resp = await callApi(`/results`, { cache: 'no-store' });
  if (!resp.ok) {
    return;
  }
  const body = (await resp.json()) as { data: ResultLightweightWithLabel[] };
  return body.data;
}

async function fetchEvalById(id: string) {
  const resp = await callApi(`/results/${id}`, { cache: 'no-store' });
  if (!resp.ok) {
    return;
  }
  const body = (await resp.json()) as { data: ResultsFile };
  return body;
}

export default function Eval({ fetchId }: EvalOptions) {
  const navigate = useNavigate();
  const { apiBaseUrl } = useApiConfig();

  const {
    table,
    setTable,
    setTableFromResultsFile,
    config,
    setConfig,
    evalId,
    setEvalId,
    setAuthor,
  } = useStore();

  const { setInComparisonMode } = useResultsViewSettingsStore();

  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [recentEvals, setRecentEvals] = React.useState<ResultLightweightWithLabel[]>([]);

  const [searchParams] = useSearchParams();

  const [defaultEvalId, setDefaultEvalId] = React.useState<string>('');

  const handleRecentEvalSelection = useCallback(
    async (id: string) => {
      navigate({
        pathname: `/eval/${encodeURIComponent(id)}`,
        search: searchParams.toString(),
      });
    },
    [searchParams, navigate],
  );

  const setPageState = useCallback(
    async (data: ResultsFile) => {
      if (!data?.id) {
        setFailed(true);
        throw new Error('Eval ID is missing in the data');
      }
      setEvalId(data.id);
      setDefaultEvalId(data.id);
      setTableFromResultsFile(data);
      setConfig(data?.config);
      setAuthor(data?.author || null);
    },
    [setDefaultEvalId, setInComparisonMode, setTable, setConfig, setAuthor],
  );

  React.useEffect(() => {
    if (fetchId) {
      console.log('Eval init: Fetching eval by id', { fetchId });
      fetchEvalById(fetchId).then(function (response) {
        if (response) {
          setPageState(response.data);
        } else {
          setFailed(true);
        }
      });
    }

    fetchRecentFileEvals().then(async (evals) => {
      if (evals) {
        setRecentEvals(evals);
      }
      if (!fetchId) {
        if (IS_RUNNING_LOCALLY) {
          const socket = SocketIOClient(apiBaseUrl || '');
          socket.on('update', (data) => {
            console.log('Received data update', data);
            setPageState(data);
          });

          socket.on('init', (data) => {
            if (!fetchId) {
              console.log('Received data update', data);
              setPageState(data);
              setLoaded(true);
            }
          });

          return () => {
            socket.disconnect();
          };
        } else {
          if (evals && evals.length > 0) {
            const resp = await callApi(`/results/${evals[0].evalId}`);
            if (resp.ok) {
              const body = await resp.json();
              setPageState(body.data);
              setLoaded(true);
            } else {
              setFailed(true);
            }
          }
        }
      }
    });
    setInComparisonMode(false);
  }, [apiBaseUrl, fetchId, setEvalId, fetchEvalById, setInComparisonMode, setPageState]);

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
