require('dotenv').config();
const express = require('express');
const OpenAI = require('openai');
const logger = require('pino')(); // Using pino for logging

const app = express();
app.use(express.json());

// Initialize OpenAI client
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Constants
const SYSTEM_PROMPT = `You are a helpful TurboTech Industries customer service assistant. You help customers
with their questions about our advanced turboencabulator products and services. Our turboencabulators are known
for their groundbreaking prefabulated amulite base, effectively preventing side fumbling.`;

const API_TOKEN = process.env.API_TOKEN;

// Chat endpoint
app.post('/chat', async (req, res) => {
  try {
    logger.info(`Received chat request from ${req.ip}`);

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      logger.warn('Request rejected: Missing authorization header');
      return res.status(401).json({ error: 'No authorization header' });
    }

    // Validate token
    const token = authHeader.replace('Bearer ', '');
    if (token !== API_TOKEN) {
      logger.warn('Request rejected: Invalid token');
      return res.status(403).json({ error: 'Invalid token' });
    }

    const { api_provider, chat_history } = req.body;

    // Validate required fields
    if (!api_provider) {
      logger.warn('Request rejected: Missing api_provider field');
      return res.status(400).json({ error: 'Missing required field: api_provider' });
    }
    if (!chat_history) {
      logger.warn('Request rejected: Missing chat_history field');
      return res.status(400).json({ error: 'Missing required field: chat_history' });
    }

    logger.info(`Processing chat history with ${chat_history.length} messages`);

    // Prepare messages for OpenAI
    const messages = [{ role: 'system', content: SYSTEM_PROMPT }, ...chat_history];

    // Call OpenAI API
    logger.info('Calling OpenAI API with model: gpt-4o-mini');
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.7,
    });

    logger.info('Received response from OpenAI');
    logger.debug(`OpenAI response: ${response.choices[0].message.content.slice(0, 50)}...`);

    // Add assistant's response to chat history
    messages.push({
      role: 'assistant',
      content: response.choices[0].message.content,
    });

    logger.info('Sending response back to client');
    return res.json({ chat_history: messages });
  } catch (error) {
    logger.error('Error processing request:', error);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
});
