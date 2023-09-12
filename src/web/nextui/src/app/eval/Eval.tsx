'use client';

import * as React from 'react';
import invariant from 'tiny-invariant';
import CircularProgress from '@mui/material/CircularProgress';
import { io as SocketIOClient } from 'socket.io-client';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

import ResultsView from './ResultsView';
import { API_BASE_URL, IS_RUNNING_LOCALLY } from '@/constants';
import { useStore } from './store';

import type {EvaluateSummary, UnifiedConfig, SharedResults} from '@/../../../types';
import type {Database} from '@/types/supabase';
import type { EvalTable } from './types';

import './Eval.css';

interface EvalOptions {
  fetchId?: string;
  preloadedData?: SharedResults;
  recentFiles?: string[];
}

export default function Eval({
  fetchId,
  preloadedData,
  recentFiles: defaultRecentFiles,
}: EvalOptions) {
  const router = useRouter();
  const { table, setTable, setConfig } = useStore();
  const [loaded, setLoaded] = React.useState<boolean>(false);
  const [failed, setFailed] = React.useState<boolean>(false);
  const [recentFiles, setRecentFiles] = React.useState<string[]>(defaultRecentFiles || []);

  const fetchRecentFiles = async () => {
    invariant(IS_RUNNING_LOCALLY, 'Cannot fetch recent files when not running locally');
    const resp = await fetch(`${API_BASE_URL}/results`);
    const body = await resp.json();
    setRecentFiles(body.data);
  };

  const handleRecentFileSelection = async (file: string) => {
    const resp = await fetch(`${API_BASE_URL}/results/${file}`);
    const body = await resp.json();
    setTable(body.data.results.table);
    setConfig(body.data.config);
    // TODO(ian): This requires next.js standalone server
    // router.push(`/eval/local:${encodeURIComponent(file)}`);
  };

  React.useEffect(() => {
    if (preloadedData) {
      setTable(preloadedData.data.results?.table as EvalTable);
      setConfig(preloadedData.data.config);
      setLoaded(true);
      if (!IS_RUNNING_LOCALLY) {
        const doIt = async () => {
          const supabase = createClientComponentClient<Database>();
          const {data: {user}} = await supabase.auth.getUser();
          if (!user) {
            throw new Error('User not logged in');
          }
          const {data,error} = await supabase.from('EvaluationResult').select().eq('userId', user.id).limit(20);
          if (data) {
            setRecentFiles(data.map(r => `eval-${r.createdAt}.json`));
          }
        };
        doIt();
      }
    } else if (fetchId) {
      const doIt = async () => {
        const response = await fetch(`https://api.promptfoo.dev/eval/${fetchId}`);
        if (!response.ok) {
          setFailed(true);
          return;
        }
        const results = await response.json();
        setTable(results.data.results?.table as EvalTable);
        setConfig(results.data.config);
        setLoaded(true);
      };
      doIt();
    } else if (IS_RUNNING_LOCALLY) {
      const socket = SocketIOClient(API_BASE_URL);

      socket.on('init', (data) => {
        console.log('Initialized socket connection', data);
        setLoaded(true);
        setTable(data.results.table);
        setConfig(data.config);
        fetchRecentFiles();
      });

      socket.on('update', (data) => {
        console.log('Received data update', data);
        setTable(data.results.table);
        setConfig(data.config);
        fetchRecentFiles();
      });

      return () => {
        socket.disconnect();
      };
    } else {
      const doIt = async () => {
        const supabase = createClientComponentClient<Database>();
        const {data: {user}} = await supabase.auth.getUser();
        if (!user) {
          // TODO(ian): Logged out state
          throw new Error('User not logged in');
        }
        const {data,error} = await supabase.from('EvaluationResult').select().eq('userId', user.id).limit(20);
        if (data) {
          setRecentFiles(data.map(r => `eval-${r.createdAt}.json`));
          const results = data[0].results as unknown as EvaluateSummary;
          const config = data[0].config as unknown as Partial<UnifiedConfig>;
          setTable(results.table);
          setConfig(config);
          setLoaded(true);
        }
      };
      doIt();
    }
  }, [fetchId, setTable, setConfig, preloadedData]);

  if (failed) {
    return <div className="loading">404 Eval not found</div>;
  }

  if (!loaded || !table) {
    return (
      <div className="loading">
        <div>
          <CircularProgress size={22} />
        </div>
        <div>Loading eval data</div>
      </div>
    );
  }

  return <ResultsView recentFiles={recentFiles} onRecentFileSelected={handleRecentFileSelection} />;
}
