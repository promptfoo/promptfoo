// Quick test to verify the timeout functionality
// Run this with: node test-timeout.js

const http = require('http');

// Create a test server that delays response
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/redteam/generate-test') {
    console.log('Server: Received test generation request, delaying response...');

    // Delay for 15 seconds (longer than our 10-second timeout)
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        prompt: 'Test prompt',
        context: 'Test context'
      }));
      console.log('Server: Response sent (but client should have timed out)');
    }, 15000);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(3001, () => {
  console.log('Test server running on http://localhost:3001');
  console.log('To test the timeout:');
  console.log('1. Run the app with: npm run dev:app');
  console.log('2. Configure API to point to http://localhost:3001');
  console.log('3. Try to generate a test case - it should timeout after 10 seconds');
  console.log('');
  console.log('Press Ctrl+C to stop the test server');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down test server...');
  server.close();
  process.exit(0);
});