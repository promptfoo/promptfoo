// Real LiveKit Agent using the LiveKit Agents SDK
// This agent connects to a LiveKit room and responds to data messages

// Import real LiveKit constants for Node.js
const { RoomEvent, DataPacketKind } = require('@livekit/rtc-node');

module.exports = {
  // Prewarm function - initialize any resources
  prewarm: async (proc) => {
    console.log('Real LiveKit agent prewarming...');
    proc.userData.startTime = Date.now();
    proc.userData.messageCount = 0;
    console.log('Agent prewarm completed');
  },

  // Entry function - called when agent joins a room
  entry: async (ctx) => {
    console.log(`Real LiveKit agent session started: ${ctx.sessionId}`);

    // Store the room reference from context
    const { room } = ctx;

    if (!room) {
      throw new Error('No room provided in context');
    }

    ctx.userData.sessionStartTime = Date.now();

    /**
     * LiveKit Agent Communication Patterns:
     *
     * This agent demonstrates both communication patterns supported by the LiveKit provider:
     *
     * 1. Direct sendMessage (lines 85-98): Preferred for testing
     *    - Attached to the context for immediate, synchronous communication
     *    - Used when agent provides a sendMessage function on the context
     *
     * 2. Data Channel (lines 29-68): Realistic production simulation
     *    - Uses room.on('dataReceived') and room.localParticipant.publishData()
     *    - Simulates real LiveKit agent WebRTC communication
     */

    // Set up data message handler for the room using real LiveKit events
    room.on(RoomEvent.DataReceived, async (payload, participant, kind) => {
      // Check if this is a reliable data packet
      try {
        const data = JSON.parse(new TextDecoder().decode(payload));

        if (data.type === 'prompt') {
          console.log(`Received prompt: ${data.content}`);

          // Process the prompt
          const response = {
            response: `Real LiveKit agent response: ${data.content}`,
            metadata: {
              sessionId: ctx.sessionId,
              timestamp: new Date().toISOString(),
              inputModalities: ['text'],
              responseModalities: ['text'],
              messageCount: ++ctx.userData.messageCount,
              processingTime: Date.now() - new Date(data.timestamp).getTime(),
            }
          };

          // Send response back via data channel
          const responseData = {
            type: 'agent_response',
            response,
            timestamp: new Date().toISOString(),
          };

          room.localParticipant.publishData(
            new TextEncoder().encode(JSON.stringify(responseData)),
            { reliable: true }
          );

          console.log(`Sent response for prompt: ${data.content}`);
        }
      } catch (error) {
        console.error('Error processing data message:', error);
      }
    });

    /**
     * Direct sendMessage Function (Preferred for Testing):
     *
     * This function is attached to the context to enable direct, synchronous communication
     * with the agent. When the LiveKit provider detects this function, it will use it
     * instead of the data channel for faster, more reliable testing.
     *
     * This pattern is recommended for agent testing because:
     * - Immediate responses without WebRTC complexity
     * - Easier debugging and error handling
     * - More predictable for unit testing scenarios
     */
    ctx.sendMessage = async (input) => {
      console.log(`Direct message received: ${input}`);

      return {
        response: `Real LiveKit agent direct response: ${input}`,
        metadata: {
          sessionId: ctx.sessionId,
          timestamp: new Date().toISOString(),
          inputModalities: ['text'],
          responseModalities: ['text'],
          messageCount: ++ctx.userData.messageCount,
          isDirect: true,
        }
      };
    };

    console.log('Real LiveKit agent initialized and listening for messages');
  },

  // Agent configuration
  config: {
    name: 'Real LiveKit Agent',
    version: '1.0.0',
    description: 'A real LiveKit agent that connects to rooms and processes data messages',
    capabilities: ['text', 'data_channel'],
    framework: 'livekit-agents',
  },

  // Optional tools for the agent
  tools: [
    {
      name: 'echo',
      description: 'Echo back the input message with LiveKit context',
      function: async (args) => {
        return {
          echo: args.input,
          timestamp: new Date().toISOString(),
          framework: 'livekit-agents',
        };
      }
    },
    {
      name: 'room_info',
      description: 'Get information about the current LiveKit room',
      function: async (args, context) => {
        const { room } = context;
        return {
          roomName: room?.name || 'unknown',
          participants: room?.participants?.size || 0,
          isConnected: room?.state === 'connected',
          connectionState: room?.state,
        };
      }
    }
  ]
};