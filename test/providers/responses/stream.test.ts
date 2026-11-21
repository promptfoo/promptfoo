import { describe, expect, it } from 'vitest';
import {
  getResponsesOutputText,
  IncompleteResponsesStreamError,
  readResponsesStream,
} from '../../../src/providers/responses/stream';

const logger = { debug: () => undefined };

function stream(...events: object[]) {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''));
}

describe('multi-agent Responses streams', () => {
  it.each(['completed', 'incomplete', 'failed'])(
    'uses attributed output from the %s snapshot',
    async (status) => {
      const message = (agent_name: string, phase: string, text: string) => ({
        type: 'message',
        role: 'assistant',
        agent: { agent_name },
        phase,
        content: [{ type: 'output_text', text }],
      });
      const snapshot = {
        status,
        output_text: 'unattributed text',
        output: [
          message('/root/worker', 'final_answer', 'child answer'),
          message('/root', 'commentary', 'progress update'),
          message('/root', 'final_answer', 'root answer'),
        ],
      };
      const response = await readResponsesStream(
        stream(
          { type: 'response.output_text.delta', delta: 'unattributed delta' },
          { type: `response.${status}`, response: snapshot },
        ),
        'OpenAI',
        logger,
        undefined,
        { multiAgent: true, preserveFailedOutput: true },
      );
      expect(response).toEqual(snapshot);
      expect(getResponsesOutputText(response, true)).toBe('root answer');
    },
  );

  it('rejects unattributed deltas when the stream ends before the terminal snapshot', async () => {
    await expect(
      readResponsesStream(
        stream({ type: 'response.output_text.delta', delta: 'unattributed delta' }),
        'OpenAI',
        logger,
        undefined,
        { multiAgent: true },
      ),
    ).rejects.toThrow(IncompleteResponsesStreamError);
  });
});
