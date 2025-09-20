// Example LiveKit Agent Definition
// This is a simple example of how to define a LiveKit agent for promptfoo testing

module.exports = {
  // Prewarm function - called once when the agent starts
  prewarm: async (proc) => {
    console.log('LiveKit agent prewarm started');

    // Initialize any resources needed by the agent
    proc.userData.startTime = Date.now();
    proc.userData.messageCount = 0;

    console.log('LiveKit agent prewarm completed');
  },

  // Entry function - called when a new session starts
  entry: async (ctx) => {
    console.log(`LiveKit agent session started: ${ctx.sessionId}`);

    // Set up session-specific configuration
    ctx.userData.sessionStartTime = Date.now();

    // Mock implementation of sendMessage for testing
    ctx.sendMessage = async (message) => {
      ctx.userData.messageCount = (ctx.userData.messageCount || 0) + 1;

      // Simple echo response with some processing
      const response = `Echo from LiveKit agent: ${message} (message #${ctx.userData.messageCount})`;

      return {
        response,
        metadata: {
          messageCount: ctx.userData.messageCount,
          sessionDuration: Date.now() - ctx.userData.sessionStartTime,
        },
      };
    };

    console.log('LiveKit agent session initialized');
  },

  // Agent configuration
  config: {
    name: 'Example LiveKit Agent',
    version: '1.0.0',
    description: 'A simple example agent for promptfoo testing',
    capabilities: ['text', 'audio', 'video'],
  },

  // Tools available to the agent (optional)
  tools: [
    {
      name: 'echo',
      description: 'Echo back the input message',
      function: (input) => `Echo: ${input}`,
    },
    {
      name: 'timestamp',
      description: 'Get current timestamp',
      function: () => new Date().toISOString(),
    },
  ],
};