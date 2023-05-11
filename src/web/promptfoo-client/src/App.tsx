import * as React from 'react';

import { io as SocketIOClient } from 'socket.io-client';

import ResultsView from './ResultsView.js';
import NavBar from './NavBar.js';
import { useStore } from './store.js';

import './App.css';

function App() {
  const { table, setTable } = useStore();
  const [loaded, setLoaded] = React.useState<boolean>(false);

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
    <>
      <NavBar />
      {loaded && table ? <ResultsView /> : <div>Loading...</div>}
    </>
  );
}

export default App;
