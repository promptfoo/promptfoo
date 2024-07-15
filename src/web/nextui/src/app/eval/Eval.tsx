'use client';

import * as React from 'react';
import { REMOTE_API_BASE_URL } from '@/../../../constants';
import type {
  EvaluateSummary,
  UnifiedConfig,
  SharedResults,
  ResultLightweightWithLabel,
} from '@/../../../types';
import { getApiBaseUrl } from '@/api';
import { ShiftKeyProvider } from '@/app/contexts/ShiftKeyContext';
import { IS_RUNNING_LOCALLY, USE_SUPABASE } from '@/constants';
import type { Database } from '@/types/supabase';
import CircularProgress from '@mui/material/CircularProgress';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import { io as SocketIOClient } from 'socket.io-client';
import invariant from 'tiny-invariant';
import ResultsView from './ResultsView';
import { useStore } from './store';
import type { EvaluateTable } from './types';
import './Eval.css';

async function fetchEvalsFromSupabase(): Promise<{ id: string; createdAt: string }[]> {
  const supabase = createClientComponentClient<Database>();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  invariant(user, 'User not logged in');
  const { data, error } = await supabase
    .from('EvaluationResult')
    .select('id, createdAt')
    .eq('user_id', user.id)
    .order('createdAt', { ascending: false })
    .limit(100);
  return data || [];
}

async function fetchEvalFromSupabase(
  id: string,
): Promise<Database['public']['Tables']['EvaluationResult']['Row'] | null> {
  const supabase = createClientComponentClient<Database>();
  const { data, error } = await supabase.from('EvaluationResult').select('*').eq('id', id).single();
  return data;
}

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
  const router = useRouter();
  const { table, setTable, setConfig, setEvalId, setAuthor } = useStore();
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const [recentEvals, setRecentEvals] = React.useState<ResultLightweightWithLabel[]>(
    recentEvalsProp || [],
  );

  const fetchRecentFileEvals = async () => {
    const resp = await fetch(`${await getApiBaseUrl()}/api/results`, { cache: 'no-store' });
    const body = await resp.json();
    setRecentEvals(body.data);
    return body.data;
  };

  const fetchEvalById = React.useCallback(
    async (id: string) => {
      const resp = await fetch(`${await getApiBaseUrl()}/api/results/${id}`, { cache: 'no-store' });
      const body = await resp.json();
      setTable(body.data.results.table);
      setConfig(body.data.config);
      setAuthor(body.data.author);
      setEvalId(id);
    },
    [setTable, setConfig, setEvalId, setAuthor],
  );

  const handleRecentEvalSelection = async (id: string) => {
    if (USE_SUPABASE) {
      setLoaded(false);
      router.push(`/eval/remote:${encodeURIComponent(id)}`);
    } else {
      router.push(`/eval/?evalId=${encodeURIComponent(id)}`);
    }
  };

  const [defaultEvalId, setDefaultEvalId] = React.useState<string>(
    defaultEvalIdProp || recentEvals[0]?.evalId,
  );

  const searchParams = useSearchParams();
  const evalId = searchParams ? searchParams.get('evalId') : null;

  React.useEffect(() => {
    if (evalId) {
      const run = async () => {
        await fetchEvalById(evalId);
        setLoaded(true);
        setDefaultEvalId(evalId);
        // Load other recent eval runs
        fetchRecentFileEvals();
      };
      run();
    } else if (preloadedData) {
      setTable(preloadedData.data.results?.table as EvaluateTable);
      setConfig(preloadedData.data.config);
      setAuthor(preloadedData.data.author || null);
      setLoaded(true);
    } else if (fetchId) {
      const run = async () => {
        const url = `${REMOTE_API_BASE_URL}/api/eval/${fetchId}`;
        console.log('Fetching eval from remote server', url);
        const response = await fetch(url);
        if (!response.ok) {
          setFailed(true);
          return;
        }
        const results = await response.json();
        setTable(results.data.results?.table as EvaluateTable);
        setConfig(results.data.config);
        setAuthor(results.data.author || null);
        setLoaded(true);
      };
      run();
    } else if (IS_RUNNING_LOCALLY) {
      getApiBaseUrl().then((apiBaseUrl) => {
        const socket = SocketIOClient(apiBaseUrl);

        socket.on('init', (data) => {
          console.log('Initialized socket connection', data);
          setLoaded(true);
          setTable(data?.results.table);
          setConfig(data?.config);
          setAuthor(data?.author || null);
          fetchRecentFileEvals().then((newRecentEvals) => {
            setDefaultEvalId(newRecentEvals[0]?.id);
            setEvalId(newRecentEvals[0]?.id);
          });
        });

        socket.on('update', (data) => {
          console.log('Received data update', data);
          setTable(data.results.table);
          setConfig(data.config);
          setAuthor(data.author || null);
          fetchRecentFileEvals().then((newRecentEvals) => {
            const newId = newRecentEvals[0]?.id;
            if (newId) {
              setDefaultEvalId(newId);
              setEvalId(newId);
            }
          });
        });

        return () => {
          socket.disconnect();
        };
      });
    } else if (USE_SUPABASE) {
      // TODO(ian): Move this to server
      fetchEvalsFromSupabase().then((records) => {
        setRecentEvals(
          records.map((r) => ({
            evalId: r.id,
            label: r.createdAt,
            createdAt: new Date(r.createdAt).getTime(),
            description: 'None',
            numTests: -1,
          })),
        );
        if (records.length > 0) {
          fetchEvalFromSupabase(records[0].id).then((evalRun) => {
            invariant(evalRun, 'Eval not found');
            const results = evalRun.results as unknown as EvaluateSummary;
            const config = evalRun.config as unknown as Partial<UnifiedConfig>;
            setDefaultEvalId(records[0].id);
            setTable(results.table);
            setConfig(config);
            setAuthor(null);
            setLoaded(true);
          });
        }
      });
    } else {
      // Fetch from next.js server
      const run = async () => {
        const evals = await fetchRecentFileEvals();
        if (evals.length > 0) {
          const apiBaseUrl = await getApiBaseUrl();
          const defaultEvalId = evals[0].id;
          const resp = await fetch(`${apiBaseUrl}/api/results/${defaultEvalId}`);
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
  }, [
    fetchId,
    setTable,
    setConfig,
    setAuthor,
    setEvalId,
    fetchEvalById,
    preloadedData,
    setDefaultEvalId,
    evalId,
  ]);

  if (failed) {
    return <div className="notice">404 Eval not found</div>;
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
      <ResultsView
        defaultEvalId={defaultEvalId}
        recentEvals={recentEvals}
        onRecentEvalSelected={handleRecentEvalSelection}
      />
    </ShiftKeyProvider>
  );
}
