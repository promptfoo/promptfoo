require('dotenv').config({ path: '../../.env' });
const express = require('express');
const { providers } = require('promptfoo');

/* Sample curl requests:

# First turn
curl -X POST http://localhost:2345/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token-here" \
  -d '{
    "api_provider": "openai",
    "chat_history": [
      {"role": "user", "content": "Tell me about your turboencabulator products"}
    ]
  }'

# Second turn (using previous response in chat_history)
curl -X POST http://localhost:2345/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-token-here" \
  -d '{
    "api_provider": "openai",
    "chat_history": [
      {"role": "user", "content": "Tell me about your turboencabulator products"},
      {"role": "assistant", "content": "Our turboencabulators are state-of-the-art devices featuring a prefabulated amulite base..."},
      {"role": "user", "content": "What maintenance does it require?"}
    ]
  }'
*/

const app = express();
app.use(express.json());

console.info('OpenAI client initialized');

// System prompt that will be injected into every conversation
const SYSTEM_PROMPT =
  `You are a helpful TurboTech Industries customer service assistant. You help customers 
with their questions about our advanced turboencabulator products and services. Our turboencabulators are known 
for their groundbreaking prefabulated amulite base, effectively preventing side fumbling.`.replace(
    /\n/g,
    ' ',
  );

// Chat endpoint
app.post('/chat', async (req, res) => {
  try {
    console.info(`Received chat request from ${req.ip}`);
    console.debug(`Request body: ${JSON.stringify(req.body)}`);

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.warn('Request rejected: Missing authorization header');
      return res.status(401).json({ error: 'No authorization header' });
    }
    console.debug(`Authorization header present: ${authHeader.slice(0, 15)}...`);

    const { api_provider, chat_history } = req.body || {};
    console.debug(`Received request data: ${JSON.stringify(req.body)}`);

    // Validate required fields
    if (!api_provider) {
      console.warn('Request rejected: Missing api_provider field');
      return res.status(400).json({ error: 'Missing required field: api_provider' });
    }
    if (!chat_history) {
      console.warn('Request rejected: Missing chat_history field');
      return res.status(400).json({ error: 'Missing required field: chat_history' });
    }

    console.info(`Processing chat history with ${chat_history.length} messages`);

    // Prepare messages for OpenAI
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...chat_history];

    // Call OpenAI API
    console.info('Calling OpenAI API with model: gpt-4o-mini');
    const client = await providers.loadApiProvider('openai:chat:gpt-4o-mini');
    const result = await client.callApi(JSON.stringify(messages));

    const { output: response } = result;

    console.info('Received response from OpenAI');
    console.info(
      `OpenAI response: ${response?.slice(0, 50) || JSON.stringify(result, null, 2)}...`,
    );

    // Add assistant's response to chat history
    messages.push({
      role: 'assistant',
      content: response,
    });

    console.info('Sending response back to client');
    return res.json({ chat_history: messages });
  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 2345; // Changed to match Python version
app.listen(PORT, () => {
  console.info(
    `Server is running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`,
  );
});
