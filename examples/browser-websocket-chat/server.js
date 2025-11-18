const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = 3000;
const SESSION_SECRET = 'promptfoo-websocket-demo';

// Initialize OpenAI if API key is available
let openai = null;
const USE_REAL_LLM = process.env.OPENAI_API_KEY ? true : false;

if (USE_REAL_LLM) {
  const { OpenAI } = require('openai');
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  console.log('✨ Real LLM mode enabled (OpenAI GPT-5.1, no reasoning)');
} else {
  console.log('📝 Mock mode - using hardcoded responses (set OPENAI_API_KEY for real LLM)');
}

// Store conversations per session
// sessionId -> Array of {role: 'user'|'assistant', content: string}
const conversations = new Map();

// Session middleware
const sessionParser = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
  },
});

app.use(cookieParser());
app.use(express.json());
app.use(sessionParser);
app.use(express.static('public'));

// Serve chat page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', conversations: conversations.size });
});

// API endpoint for creating new sessions (for simulated-user provider)
app.post('/api/session/new', (req, res) => {
  // Create a new unique session ID
  const newSessionId = `sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Initialize empty conversation for this session
  conversations.set(newSessionId, []);

  console.log(`Created new session: ${newSessionId}`);

  res.json({
    sessionId: newSessionId,
    url: `http://localhost:${PORT}/?session=${newSessionId}`
  });
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  console.log('WebSocket client connected');

  // Parse session from cookie OR query parameter
  sessionParser(req, {}, () => {
    // Check for session ID in query parameter (for simulated-user provider)
    const url = new URL(req.url, `http://${req.headers.host}`);
    const querySessionId = url.searchParams.get('session');

    // Use query parameter session if provided, otherwise use cookie session
    const sessionId = querySessionId || req.session.id;
    console.log(`Session ID: ${sessionId}`);

    // Initialize conversation history if needed
    if (!conversations.has(sessionId)) {
      conversations.set(sessionId, []);
      console.log(`Created new conversation for session ${sessionId}`);
    }

    // Send connection confirmation
    ws.send(
      JSON.stringify({
        type: 'connected',
        sessionId: sessionId,
        messageCount: conversations.get(sessionId).length,
      }),
    );

    // Handle incoming messages
    ws.on('message', async (data) => {
      try {
        const { message } = JSON.parse(data.toString());
        console.log(`Received message: "${message}" from session ${sessionId}`);

        // Get conversation history
        const history = conversations.get(sessionId);

        // Add user message to history
        history.push({ role: 'user', content: message });

        // Generate and stream response (real LLM or mock)
        if (USE_REAL_LLM) {
          await streamLLMResponse(ws, history, sessionId);
        } else {
          const response = generateMockResponse(message, history);
          history.push({ role: 'assistant', content: response });
          console.log(
            `Streaming mock response (${response.split(' ').length} words) to session ${sessionId}`,
          );
          await streamResponse(ws, response);
        }

        console.log(`Conversation history for ${sessionId}: ${history.length} messages`);
      } catch (error) {
        console.error('Error processing message:', error);
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'Failed to process message',
          }),
        );
      }
    });

    ws.on('close', () => {
      console.log(`WebSocket client disconnected (session: ${sessionId})`);
    });
  });
});

// Stream response from real LLM (OpenAI)
async function streamLLMResponse(ws, history, sessionId) {
  try {
    console.log(`Calling OpenAI with ${history.length} messages for session ${sessionId}`);

    const stream = await openai.chat.completions.create({
      model: 'gpt-5.1',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant. Be concise and friendly.',
        },
        ...history,
      ],
      stream: true,
      temperature: 0.7,
      store: false,
      reasoning_effort: 'none',
    });

    let fullResponse = '';

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        fullResponse += content;

        // Send chunk to WebSocket client
        ws.send(
          JSON.stringify({
            type: 'chunk',
            content: content,
          }),
        );
      }
    }

    // Signal streaming complete
    ws.send(
      JSON.stringify({
        type: 'done',
      }),
    );

    // Add complete response to history
    history.push({ role: 'assistant', content: fullResponse });

    console.log(`LLM response complete for session ${sessionId}: ${fullResponse.length} chars`);
  } catch (error) {
    console.error('OpenAI streaming error:', error);
    ws.send(
      JSON.stringify({
        type: 'error',
        message: 'LLM generation failed',
      }),
    );
  }
}

// Generate mock context-aware responses (fallback when no API key)
function generateMockResponse(message, history) {
  const lowerMessage = message.toLowerCase();
  const topics = extractTopics(history);

  // Greeting
  if (lowerMessage.match(/^(hi|hello|hey)$/)) {
    return 'Hello! How can I help you today?';
  }

  // Weather queries
  if (lowerMessage.includes('weather')) {
    if (lowerMessage.includes('tomorrow')) {
      return 'Tomorrow will be partly cloudy with a high of 68°F and a low of 52°F. There is a 20% chance of rain.';
    }
    return 'The weather today is sunny and 72°F with clear skies. Perfect day to go outside!';
  }

  // Context-aware follow-ups
  if (lowerMessage.includes('tomorrow') || lowerMessage.includes('next day')) {
    if (topics.includes('weather')) {
      return 'Tomorrow will be partly cloudy with a high of 68°F and a low of 52°F. There is a 20% chance of rain.';
    }
    return 'What would you like to know about tomorrow?';
  }

  // Umbrella question (context-aware)
  if (lowerMessage.includes('umbrella')) {
    if (topics.includes('weather')) {
      const tomorrowMentioned = history.some((msg) =>
        msg.content.toLowerCase().includes('tomorrow'),
      );
      if (tomorrowMentioned) {
        return 'For tomorrow\'s partly cloudy weather with only 20% chance of rain, you probably won\'t need an umbrella. But it might be good to keep one in your car just in case!';
      }
      return 'Based on today\'s sunny forecast, you won\'t need an umbrella. But it\'s always good to be prepared!';
    }
    return 'Are you asking about tomorrow\'s weather? Let me know and I can help!';
  }

  // Status query (shows session awareness)
  if (lowerMessage.includes('conversation') || lowerMessage.includes('messages')) {
    return `We've exchanged ${history.length} messages so far in this conversation. I remember everything we've discussed!`;
  }

  // What did we discuss
  if (lowerMessage.includes('discussed') || lowerMessage.includes('talked about')) {
    if (topics.length === 0) {
      return 'We just started chatting! What would you like to discuss?';
    }
    return `So far we've talked about: ${topics.join(', ')}. What else would you like to know?`;
  }

  // Time-related follow-ups
  if (lowerMessage.includes('what about') && topics.length > 0) {
    return `Based on our discussion about ${topics[topics.length - 1]}, could you be more specific about what aspect you'd like to know?`;
  }

  // Default response with context hint
  if (topics.length > 0) {
    return `I received your message: "${message}". We've been discussing ${topics.join(' and ')}. How can I help you further?`;
  }

  return `I received your message: "${message}". How can I help you today?`;
}

// Extract topics discussed in the conversation
function extractTopics(history) {
  const topics = new Set();
  const content = history.map((msg) => msg.content.toLowerCase()).join(' ');

  if (content.includes('weather')) topics.add('weather');
  if (content.includes('forecast')) topics.add('forecast');
  if (content.includes('temperature')) topics.add('temperature');
  if (content.includes('umbrella')) topics.add('weather planning');

  return Array.from(topics);
}

// Stream response word by word (simulates LLM streaming)
async function streamResponse(ws, text) {
  const words = text.split(' ');

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    // Send word chunk
    ws.send(
      JSON.stringify({
        type: 'chunk',
        content: word + (i < words.length - 1 ? ' ' : ''),
      }),
    );

    // Delay between words (50ms = realistic streaming)
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // Signal streaming complete
  ws.send(
    JSON.stringify({
      type: 'done',
    }),
  );
}

server.listen(PORT, () => {
  console.log(`\n🚀 WebSocket Chat Server running at http://localhost:${PORT}`);
  console.log(`\n📋 Instructions:`);
  console.log(`   1. Open http://localhost:${PORT} in your browser`);
  console.log(`   2. For multi-turn testing with promptfoo:`);
  console.log(`      - Start Chrome: chrome --remote-debugging-port=9222`);
  console.log(`      - Navigate to http://localhost:${PORT} in that Chrome`);
  console.log(`      - Run: npx promptfoo eval`);
  console.log(`\n✨ Features:`);
  console.log(`   - Real-time WebSocket communication`);
  console.log(`   - Streaming responses (word-by-word)`);
  console.log(`   - Session-based conversation history`);
  console.log(`   - Context-aware multi-turn dialogue`);
  console.log('');
});
