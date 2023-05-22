import * as React from 'react';

import useMediaQuery from '@mui/material/useMediaQuery';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { io as SocketIOClient } from 'socket.io-client';

import ResultsView from './ResultsView.js';
import NavBar from './NavBar.js';
import { useStore } from './store.js';

import './App.css';

function App() {
  const { table, setTable } = useStore();
  const [loaded, setLoaded] = React.useState<boolean>(false);

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
    //const socket = SocketIOClient(`http://${window.location.host}`);
    const socket = SocketIOClient(`http://localhost:15500`);

    socket.on('init', (data) => {
      console.log('Initialized socket connection');
      setLoaded(true);
      setTable(data.table);
    });

    socket.on('update', (data) => {
      console.log('Received data update');
      setTable(data.table);
    });

    return () => {
      socket.disconnect();
    };
  }, [loaded, setTable]);

  return (
    <ThemeProvider theme={theme}>
      <NavBar darkMode={darkMode} onToggleDarkMode={toggleDarkMode} />
      {loaded && table ? <ResultsView /> : <div>Loading...</div>}
    </ThemeProvider>
  );
}

export default App;
