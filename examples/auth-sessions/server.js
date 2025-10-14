const express = require('express');
const app = express();
const PORT = 8000;
const uuid = require('uuid');

// Middleware to parse JSON bodies
app.use(express.json());

// In-memory session storage (for demo purposes)
const sessions = new Map();

/**
 * Create a new session
 */
app.post('/session', (req, res) => {
  const { userId, data } = req.body;

  // Generate a simple session ID
  const sessionId = uuid.v4();

  const session = {
    sessionId,
    userId: userId || null,
    data: data || {},
    createdAt: new Date().toISOString(),
  };

  sessions.set(sessionId, session);

  console.log(`Created session: ${sessionId}`);
  res.status(201).json(session);
});

/**
 * Delete a session
 */
app.delete('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId is required' });
  }

  if (sessions.has(sessionId)) {
    sessions.delete(sessionId);
    console.log(`Deleted session: ${sessionId}`);
    res.sendStatus(204);
  } else {
    res.sendStatus(404);
  }
});

/**
 * Echoes a request back to the client. Stand-in for a real provider e.g. an LLM API.
 */
app.post('/echo', (req, res) => {
  // Validate the session ID is present
  const sessionId = req.headers['x-session-id'];
  if (!sessionId) {
    return res.status(400).json({ error: 'x-session-id is required' });
  }

  // Validate the session
  if (!sessions.has(sessionId)) {
    return res.status(400).json({ error: 'sessionId is not valid' });
  }

  console.log(`Echo request received for session: ${sessionId}`);
  console.log(req.body);

  // Validate the session
  res.json({ output: req.body.prompt });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Session server running on http://localhost:${PORT}`);
});
