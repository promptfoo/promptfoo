// Simple LiveKit agent for testing
module.exports = {
  prewarm: async (proc) => {
    console.log('Simple agent prewarming...');
    proc.userData.startTime = Date.now();
  },

  entry: async (ctx) => {
    console.log(`Simple agent session started: ${ctx.sessionId}`);

    ctx.sendMessage = async (input) => {
      console.log(`Received: ${input}`);

      return {
        response: `Echo from simple agent: ${input}`,
        metadata: {
          sessionId: ctx.sessionId,
          timestamp: new Date().toISOString(),
          inputModalities: ['text'],
          responseModalities: ['text']
        }
      };
    };
  },

  config: {
    name: 'Simple Test Agent',
    version: '1.0.0',
    description: 'A simple agent for testing LiveKit provider'
  }
};