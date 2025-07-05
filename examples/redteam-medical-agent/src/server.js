/**
 * Express server for the medical agent
 */

const express = require('express');
const cors = require('cors');
const { handleMessage } = require('./agent');
const fs = require('fs');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Routes
const router = express.Router();

router.post('/chat', async (req, res) => {
  const { message } = req.body;
  const sessionId = req.headers['x-promptfoo-session'];

  console.debug({ type: 'request', sessionId, message });

  try {
    const response = await handleMessage(sessionId, message);
    res.json({ message: response });
  } catch (error) {
    console.error('Error processing message:', error);
    res.status(500).json({ error: 'An error occurred while processing your message' });
  }
});

app.use('/api', router);

// Create public directory if it doesn't exist
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
}

// Create a simple HTML chat interface
const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MediAssist - Medical Assistant</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
    }
    .header {
      background-color: #1976D2;
      color: white;
      padding: 20px;
      border-radius: 10px 10px 0 0;
      margin-bottom: 20px;
    }
    .chat-container {
      border: 1px solid #ddd;
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .messages {
      padding: 20px;
      max-height: 400px;
      overflow-y: auto;
      background-color: #f9f9f9;
    }
    .message {
      margin-bottom: 15px;
      padding: 10px 15px;
      border-radius: 20px;
      max-width: 80%;
    }
    .user-message {
      background-color: #E3F2FD;
      margin-left: auto;
      border-bottom-right-radius: 0;
    }
    .agent-message {
      background-color: #FFFFFF;
      margin-right: auto;
      border-bottom-left-radius: 0;
      box-shadow: 0 1px 2px rgba(0,0,0,0.1);
    }
    .input-container {
      display: flex;
      padding: 10px;
      background-color: #fff;
      border-top: 1px solid #ddd;
    }
    #message-input {
      flex-grow: 1;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 20px;
      margin-right: 10px;
    }
    button {
      background-color: #1976D2;
      color: white;
      border: none;
      padding: 10px 15px;
      border-radius: 20px;
      cursor: pointer;
    }
    button:hover {
      background-color: #1565C0;
    }
    .status {
      font-size: 0.8em;
      color: #666;
      margin-top: 5px;
    }
  </style>
</head>
<body>
  <div class="chat-container">
    <div class="header">
      <h1>MediAssist</h1>
      <p>Your AI Healthcare Assistant</p>
    </div>
    <div class="messages" id="messages"></div>
    <div class="input-container">
      <input type="text" id="message-input" placeholder="Type your message here...">
      <button id="send-button">Send</button>
    </div>
    <div class="status" id="status">Ready</div>
  </div>

  <script>
    const messagesContainer = document.getElementById('messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const statusElement = document.getElementById('status');

    // Generate a simple session ID
    const sessionId = Math.random().toString(36).substring(2, 15);
    statusElement.textContent = 'Connected - Session: ' + sessionId;

    // Add initial system message
    addMessage('Hello! I am MediAssist, your AI healthcare assistant. How can I help you today?', 'agent');

    // Send a message to the agent
    async function sendMessage() {
      const message = messageInput.value.trim();
      if (!message) return;

      // Add user message to the UI
      addMessage(message, 'user');
      messageInput.value = '';

      // Send to the server
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-promptfoo-session': sessionId
          },
          body: JSON.stringify({ message })
        });
        const data = await response.json();
        
        // Add agent response to the UI
        addMessage(data.message, 'agent');
      } catch (error) {
        console.error('Error sending message:', error);
        addMessage('Sorry, there was an error processing your request.', 'agent');
      }
    }

    // Add a message to the UI
    function addMessage(text, sender) {
      const messageElement = document.createElement('div');
      messageElement.classList.add('message');
      messageElement.classList.add(sender + '-message');
      messageElement.textContent = text;
      messagesContainer.appendChild(messageElement);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Event listeners
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendMessage();
    });
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(publicDir, 'index.html'), htmlContent);

// Serve the chat interface at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 3090;

app.listen(port, (error) => {
  if (error) {
    console.error(`Failed to start server: ${error.message}`);
    process.exit(1);
    return;
  }
  console.log(`Medical agent API is running on port ${port}`);
});

module.exports = app;
