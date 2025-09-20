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

    // Enhanced sendMessage implementation with multi-modal support
    ctx.sendMessage = async (messageData) => {
      ctx.userData.messageCount = (ctx.userData.messageCount || 0) + 1;

      // Handle both string input (backward compatibility) and multi-modal input
      const input = typeof messageData === 'string' ? { text: messageData } : messageData;

      // Process multi-modal input
      const responseParts = [];
      if (input.text) {
        responseParts.push(`text: "${input.text}"`);
      }
      if (input.audio) {
        responseParts.push(`audio: ${input.audio.format} (${input.audio.sampleRate}Hz, ${input.audio.channels}ch)`);
      }
      if (input.video) {
        responseParts.push(`video: ${input.video.format} (${input.video.width}x${input.video.height})`);
      }

      const response = `Echo from LiveKit agent: ${responseParts.join(', ')} (message #${ctx.userData.messageCount})`;

      // Generate mock audio response if audio was provided
      let audioResponse;
      if (input.audio) {
        audioResponse = {
          format: 'opus',
          sampleRate: input.audio.sampleRate || 48000,
          channels: input.audio.channels || 1,
          duration: 2.5, // Mock 2.5 second response
          url: `https://example.com/audio-response-${ctx.userData.messageCount}.opus`,
        };
      }

      // Generate mock video response if video was provided
      let videoResponse;
      if (input.video) {
        videoResponse = {
          format: 'mp4',
          width: input.video.width || 1280,
          height: input.video.height || 720,
          framerate: input.video.framerate || 30,
          duration: 3.0, // Mock 3 second response
          url: `https://example.com/video-response-${ctx.userData.messageCount}.mp4`,
        };
      }

      // Simulate tool calls based on input
      let toolCalls;
      if (input.text && input.text.includes('timestamp')) {
        toolCalls = [{
          id: `tool_${Date.now()}`,
          name: 'timestamp',
          arguments: {},
        }];
      } else if (input.text && input.text.includes('echo')) {
        toolCalls = [{
          id: `tool_${Date.now()}`,
          name: 'echo',
          arguments: { input: input.text },
        }];
      }

      return {
        response,
        audio: audioResponse,
        video: videoResponse,
        toolCalls,
        metadata: {
          messageCount: ctx.userData.messageCount,
          sessionDuration: Date.now() - ctx.userData.sessionStartTime,
          inputModalities: Object.keys(input).filter(key => input[key]),
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