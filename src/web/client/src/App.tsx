import * as React from 'react';

import useMediaQuery from '@mui/material/useMediaQuery';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { io as SocketIOClient } from 'socket.io-client';

import ResultsView from './ResultsView.js';
import NavBar from './NavBar.js';
import { useStore } from './store.js';

import './App.css';

function App() {
  const { table, setTable, setConfig } = useStore();
  const [loaded, setLoaded] = React.useState<boolean>(false);
  const loadedFromApi = React.useRef(false);

  const prefersDarkMode = useMediaQuery('(prefers-color-scheme: dark)');
  const [darkMode, setDarkMode] = React.useState(prefersDarkMode);

  const theme = React.useMemo(
    () =>
      createTheme({
        palette: {
          mode: darkMode ? 'dark' : 'light',
        },
      }),
    [darkMode],
  );

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    if (!darkMode) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  };

  React.useEffect(() => {
    const fetchEvalData = async (id: string) => {
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

    const socket = SocketIOClient(`http://localhost:15500`);

    const pathMatch = window.location.pathname.match(/\/eval\/([\w:-]+)/);
    if (pathMatch) {
      const id = pathMatch[1];
      fetchEvalData(id);
    } else {
      socket.on('init', (data) => {
        console.log('Initialized socket connection', data);
        setLoaded(true);
        setTable(data.results.table);
        setConfig(data.config);
      });

      socket.on('update', (data) => {
        console.log('Received data update', data);
        setTable(data.results.table);
        setConfig(data.config);
      });
    }

    return () => {
      socket.disconnect();
    };
  }, [setTable, setConfig]);

  return (
    <ThemeProvider theme={theme}>
      <NavBar darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />
      {loaded && table ? <ResultsView /> : <div>Loading...</div>}
    </ThemeProvider>
  );
}

export default App;
