const express = require('express');
const { providers } = require('promptfoo');

const app = express();
app.use(express.json());

console.info('OpenAI client initialized');

// System prompt is injected into every conversation.
const SYSTEM_PROMPT =
  `You are a helpful TurboTech Industries customer service assistant. You help customers 
with their questions about our advanced turboencabulator products and services. Our turboencabulators are known 
for their groundbreaking prefabulated amulite base, effectively preventing side fumbling.`.replace(
    /\n/g,
    ' ',
  );

app.post('/chat', async (req, res) => {
  try {
    console.info(`Incoming chat request from ${req.ip}`);

    // Check Dummy authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.warn('Request rejected: Missing authorization header');
      return res.status(401).json({ error: 'No authorization header' });
    }

    const { api_provider, chat_history } = req.body || {};

    // Example of a required field. We don't do any actual validation here.
    if (!api_provider) {
      console.warn('Request rejected: Missing api_provider field');
      return res.status(400).json({ error: 'Missing required field: api_provider' });
    }
    if (!chat_history || !Array.isArray(chat_history)) {
      console.warn('Request rejected: chat_history must be an array');
      return res.status(400).json({ error: 'Missing required field: chat_history' });
    }

    console.info(
      `Processing chat request with ${chat_history.length} messages using ${api_provider}`,
    );
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...chat_history];

    const client = await providers.loadApiProvider('openai:chat:gpt-4o-mini');
    const result = await client.callApi(JSON.stringify(messages));

    const { output: response } = result;

    console.info(`OpenAI response: ${response?.slice(0, 50) || JSON.stringify(result)}...`);

    messages.push({
      role: 'assistant',
      content: response,
    });

    return res.json({ chat_history: messages });
  } catch (error) {
    console.error('Error processing chat request:', error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 2345;
app.listen(PORT, () => {
  console.info(`Server is running on port ${PORT}`);
});
