'use client';

import * as React from 'react';
import CircularProgress from '@mui/material/CircularProgress';
import { io as SocketIOClient } from 'socket.io-client';

import ResultsView from './ResultsView';
import { API_BASE_URL } from '@/util/api';
import { useStore } from './store';
import './page.css';

function App() {
  const { table, setTable, setConfig } = useStore();
  const [loaded, setLoaded] = React.useState<boolean>(false);
  const loadedFromApi = React.useRef(false);
  const [recentFiles, setRecentFiles] = React.useState<string[]>([]);

  const fetchRecentFiles = async () => {
    if (!window.location.href.includes('localhost')) {
      return;
    }
    const resp = await fetch(`${API_BASE_URL}/results`);
    const body = await resp.json();
    setRecentFiles(body.data);
  };

  const handleRecentFileSelection = async (file: string) => {
    const resp = await fetch(`${API_BASE_URL}/results/${file}`);
    const body = await resp.json();
    setTable(body.data.results.table);
    setConfig(body.data.config);
  };

  React.useEffect(() => {
    const fetchPublicEvalData = async (id: string) => {
      if (loadedFromApi.current) {
        return;
      }
      loadedFromApi.current = true;
      const response = await fetch(`https://api.promptfoo.dev/eval/${id}`);
      const body = await response.json();
      setTable(
        body.data.results?.table ||
          // Backwards compatibility with <= 0.12.0
          body.data.table,
      );
      setConfig(body.data.config);
      setLoaded(true);
    };

    const socket = SocketIOClient(API_BASE_URL);

    const pathMatch = window.location.pathname.match(/\/eval\/([\w:-]+)/);
    if (pathMatch) {
      const id = pathMatch[1];
      fetchPublicEvalData(id);
    } else {
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
    }

    return () => {
      socket.disconnect();
    };
  }, [setTable, setConfig]);

  return loaded && table ? (
    <ResultsView recentFiles={recentFiles} onRecentFileSelected={handleRecentFileSelection} />
  ) : (
    <div className="loading">
      <div>
        <CircularProgress size={22} />
      </div>
      <div>Loading eval data</div>
    </div>
  );
}

export default App;
