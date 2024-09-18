const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', (message) => {
    console.log('Received:', message.toString());

    try {
      const data = JSON.parse(message);

      // Simulate some processing time
      setTimeout(() => {
        const response = {
          output: `Processed: ${data.prompt} at ${new Date().toISOString()}`,
          model: data.model || 'default',
          timestamp: new Date().toISOString(),
        };

        ws.send(JSON.stringify(response));
      }, 1000);
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`WebSocket server is running on ws://localhost:${PORT}`);
});
