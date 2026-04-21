import express from 'express';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const port = 8080;

app.use(express.json());

// In-memory storage for conversation histories
const conversationHistories = new Map();

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get('/session', (req, res) => {
  const sessionId = uuidv4();
  console.log(`Session started: ${sessionId}`);
  conversationHistories.set(sessionId, []);
  res.status(201).send(sessionId);
});

app.delete('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  console.log(`Session ended: ${sessionId}`);
  conversationHistories.delete(sessionId);
  res.status(204).send(sessionId);
});

// Inference endpoint
app.post('/inference', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    // Get or initialize conversation history for this session
    if (!conversationHistories.has(sessionId)) {
      conversationHistories.set(sessionId, []);
    }

    const history = conversationHistories.get(sessionId);

    // Add new messages to history
    const newMessages = Array.isArray(message) ? message : [{ role: 'user', content: message }];
    history.push(...newMessages);

    console.log(`New user message (${sessionId}: ${history.length} messages)`);

    // Make inference request with full conversation history
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-2024-08-06',
      messages: history,
    });

    const assistantMessage = {
      role: 'assistant',
      content: completion.choices[0].message.content,
    };

    // Add assistant response to history
    history.push(assistantMessage);

    // Update the stored history
    conversationHistories.set(sessionId, history);

    res.json({ output: completion.choices[0].message.content });
  } catch (error) {
    console.error('Inference error:', error);
    res.status(500).json({
      error: 'Inference failed',
      message: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
