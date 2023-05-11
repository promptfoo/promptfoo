import * as React from 'react';

import { io as SocketIOClient } from 'socket.io-client';

import ResultsView from './ResultsView';

import type { ResultsViewTable } from './ResultsView';

import './App.css';

function App() {
  const [loaded, setLoaded] = React.useState<boolean>(false);
  const [table, setTable] = React.useState<ResultsViewTable | null>(null);
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
  }, [loaded]);

  if (!loaded || !table) {
    return <div>Loading...</div>;
  }

  return (
    <>
      <ResultsView table={table} />
    </>
  );
}

export default App;
