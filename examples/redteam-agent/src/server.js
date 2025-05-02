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

  console.debug({ type: 'request', sessionId, message });

  const agentState = await agent.invoke(
    { messages: [new HumanMessage(message)] },
    { configurable: { thread_id: sessionId } },
  );

  const agentMessage = agentState.messages[agentState.messages.length - 1].content;

  res.send({ message: agentMessage });
});

app.use('/api', router);

const port = process.env.PORT || 3090;

app.listen(port, () => {
  console.log(`Travel agent API is running on port ${port}`);
});

module.exports = app;
