import { Agent, tool, Usage } from '@openai/agents';
import type { Model, ModelResponse, StreamEvent } from '@openai/agents';

// Deterministic SDK loop: no API key, network, or tracing collector required.
const model: Model = {
  async getResponse(request): Promise<ModelResponse> {
    const input = JSON.stringify(request.input);
    if (input.includes('call the tool') && !input.includes('function_call_result')) {
      return {
        usage: new Usage(),
        output: [
          {
            type: 'function_call',
            callId: 'order_42',
            name: 'lookup_order',
            arguments: '{"orderId":"42"}',
          },
        ],
      };
    }
    return {
      usage: new Usage(),
      output: [
        {
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'lookup_order says shipped.' }],
        },
      ],
    };
  },
  async *getStreamedResponse(): AsyncIterable<StreamEvent> {
    throw new Error('Streaming is not used by this fixture');
  },
};

export default new Agent({
  name: 'Tool metadata fixture',
  model,
  tools: [
    tool({
      name: 'lookup_order',
      description: 'Look up an order',
      parameters: {
        type: 'object',
        properties: { orderId: { type: 'string' } },
        required: ['orderId'],
        additionalProperties: false,
      },
      execute: async () => ({ status: 'shipped' }),
    }),
  ],
});
