const express = require('express');
const cors = require('cors');
const { agent } = require('./agent');
const { HumanMessage } = require('@langchain/core/messages');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
const router = express.Router();

router.post('/chat', async (req, res) => {
  const { message } = req.body;
  const sessionId = req.headers['x-promptfoo-session'];

  const agentState = await agent.invoke(
    { messages: [new HumanMessage(message)] },
    { configurable: { thread_id: sessionId } },
  );

  const agentMessage = agentState.messages[agentState.messages.length - 1].content;

  console.debug({ sessionId, message, agentMessage });

  res.send({ message: agentMessage });
});

app.use('/api', router);

app.listen(5000, () => {
  console.log('Travel agent API is running on port 5000');
});

module.exports = app;
