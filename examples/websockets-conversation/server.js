const WebSocket = require('ws');
const http = require('http');
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');

const server = http.createServer((req, res) => {
  // Handle POST request for new conversation
  if (req.method === 'POST' && req.url === '/conversation') {
    const sessionId = uuidv4();
    console.log('New conversation initiated:', sessionId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ sessionId }));
    return;
  }

  // Handle other routes
  res.writeHead(404);
  res.end();
});

const wss = new WebSocket.Server({ server });

// Store active conversations
const conversations = new Map();

// Forward chat request to red panda service
async function forwardChatRequest(message, sessionId, signal) {
  try {
    console.log('Forwarding request to Red Panda:', {
      input: message,
      sessionId,
    });

    const response = await fetch('https://redpanda-internal-rag-example.promptfoo.app/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId,
      },
      body: JSON.stringify({ input: message }),
      signal, // Use the passed signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Target server error: ${response.statusText} - ${errorText}`);
    }

    const responseData = await response.json();
    console.log('Red Panda response:', responseData);
    return responseData;
  } catch (error) {
    console.error('Error in forwardChatRequest:', error);
    if (error.name === 'AbortError') {
      throw new Error(
        error.message.includes('timeout')
          ? 'Request to Red Panda service timed out'
          : 'Request to Red Panda service was cancelled',
      );
    }
    throw new Error(`Error forwarding chat request: ${error.message}`);
  }
}

wss.on('connection', (ws) => {
  console.log('Client connected');

  // Track current request controller
  let currentRequestController = null;

  ws.on('close', () => {
    console.log('Client disconnected, aborting any pending requests');
    if (currentRequestController) {
      currentRequestController.abort();
      currentRequestController = null;
    }
    // Clean up conversation when client disconnects
    for (const [id, conv] of conversations.entries()) {
      if (conv.ws === ws) {
        conversations.delete(id);
        break;
      }
    }
    console.log('Client disconnected');
  });

  ws.on('message', async (message) => {
    console.log('Received WebSocket message:', message.toString());

    try {
      const data = JSON.parse(message);
      console.log('Parsed WebSocket data:', data);

      // Require session ID in the message
      if (!data.sessionId) {
        ws.send(
          JSON.stringify({
            error: 'Missing session ID',
          }),
        );
        return;
      }

      // Create session entry if it doesn't exist
      if (!conversations.has(data.sessionId)) {
        conversations.set(data.sessionId, {
          ws,
          history: [],
        });
      }

      const conversation = conversations.get(data.sessionId);

      // Add message to conversation history
      conversation.history.push({
        role: 'user',
        content: data.prompt,
      });

      try {
        // Forward request to red panda chat
        const controller = new AbortController();
        currentRequestController = controller;

        const timeout = setTimeout(() => {
          console.log('Red Panda request timing out...');
          controller.abort();
        }, 30000);

        const chatResponse = await forwardChatRequest(
          data.prompt,
          data.sessionId,
          controller.signal,
        );
        currentRequestController = null; // Clear the reference
        console.log('Chat response from Red Panda:', chatResponse);

        const response = {
          type: 'response',
          sessionId: data.sessionId,
          output: chatResponse.response || chatResponse.message,
          timestamp: new Date().toISOString(),
          history: conversation.history,
        };
        console.log('Sending WebSocket response:', response);

        // Add response to conversation history
        conversation.history.push({
          role: 'assistant',
          content: response.output,
        });

        ws.send(JSON.stringify(response));
      } catch (error) {
        currentRequestController = null; // Clear the reference
        console.error('Error from chat service:', error);
        ws.send(
          JSON.stringify({
            error: 'Error communicating with chat service',
            details: error.message,
          }),
        );
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT} and ws://localhost:${PORT}`);
});
