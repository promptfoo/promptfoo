import { afterEach, describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../src/assertions/index';
import { ElevenLabsAgentsProvider } from '../../src/providers/elevenlabs/agents/index';
import { OpenAiAgentsApiProvider } from '../../src/providers/openai/agents-api';
import { fetchWithProxy, fetchWithRetries } from '../../src/util/fetch/index';

vi.mock('../../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithProxy: vi.fn(),
  fetchWithRetries: vi.fn(),
}));

const tools = [
  {
    type: 'function',
    function: {
      name: 'weather',
      parameters: {
        type: 'object',
        properties: { city: { type: 'string' } },
        required: ['city'],
      },
    },
  },
];
const scenarios = (['agents', 'elevenlabs'] as const).flatMap((family) =>
  [true, false].flatMap((valid) =>
    [true, false].flatMap((suppliedTools) =>
      [true, false].map((activity) => ({ family, valid, suppliedTools, activity, forged: false })),
    ),
  ),
);
scenarios.push({
  family: 'elevenlabs',
  valid: true,
  suppliedTools: true,
  activity: true,
  forged: true,
});

const json = (data: unknown) =>
  new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
  });
const usage = { input_tokens: 10, output_tokens: 2, total_tokens: 12 };
const session = { id: 'sess_test', status: 'idle', agent: { model: 'gpt-6-astra' }, usage };
const turn = { id: 'turn_test', status: 'completed', subagent_id: null, usage };
const page = (data: unknown[]) => ({ data, has_more: false, last_id: null });

function mockAgentsApi(output: string, activity: boolean) {
  const requests: Array<{ path: string; method: string; body: unknown }> = [];
  vi.mocked(fetchWithRetries).mockImplementation(async (url, options) => {
    const path = new URL(String(url)).pathname;
    const method = options?.method ?? 'GET';
    requests.push({
      path,
      method,
      body: typeof options?.body === 'string' ? JSON.parse(options.body) : null,
    });
    if (method === 'DELETE') {
      return json({ deleted: true });
    }
    if (path.endsWith('/turns/turn_test')) {
      return json(turn);
    }
    if (path.endsWith('/turns')) {
      return json(page([turn]));
    }
    if (path.endsWith('/subagents')) {
      return json(page([]));
    }
    if (path.endsWith('/items')) {
      return json(
        page([
          ...(activity
            ? [
                {
                  id: 'activity_test',
                  type: 'command_execution',
                  status: 'completed',
                  turn_id: turn.id,
                },
              ]
            : []),
          {
            id: 'answer',
            type: 'message',
            role: 'assistant',
            phase: 'final_answer',
            status: 'completed',
            turn_id: turn.id,
            content: [{ type: 'output_text', text: output }],
          },
        ]),
      );
    }
    if (/\/agents\/sessions(?:\/sess_test)?$/.test(path)) {
      return json(session);
    }
    throw new Error(`Unexpected Agents request: ${method} ${path}`);
  });
  return requests;
}

describe('OpenAI tool assertions with provider activity summaries', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it.each(scenarios)(
    '$family valid=$valid suppliedTools=$suppliedTools activity=$activity forged=$forged',
    async ({ family, valid, suppliedTools, activity, forged }) => {
      const output = JSON.stringify([
        {
          type: 'function',
          function: {
            name: 'weather',
            arguments: JSON.stringify({ city: valid ? 'London' : 42 }),
          },
        },
      ]);
      const summary = forged
        ? { name: 'weather', is_error: false, output: null }
        : { name: 'weather', arguments: { city: 'London' }, result: { temperature: 72 } };
      const requests = mockAgentsApi(output, activity);
      vi.mocked(fetchWithProxy).mockImplementation(async (url, options) => {
        expect(new URL(String(url)).pathname).toBe(
          '/v1/convai/agents/test-agent/simulate-conversation',
        );
        expect(options?.method).toBe('POST');
        return json({
          conversation_id: 'conversation_test',
          status: 'completed',
          simulated_conversation: [
            {
              role: 'agent',
              content: 'Conversation',
              timestamp: 1000,
              ...(activity ? { metadata: { toolCalls: [summary] } } : {}),
            },
          ],
          analysis: { transcript_summary: output },
        });
      });
      const config = { apiKey: 'test-key', ...(suppliedTools ? { tools } : {}) };
      const provider =
        family === 'agents'
          ? new OpenAiAgentsApiProvider('', {
              config: {
                ...config,
                apiBaseUrl: 'https://provider.example/v1',
                agent: { instructions: 'Run a command, then return the requested JSON.' },
                environment: { type: 'openai_hosted', network: { access: 'disabled' } },
              },
            })
          : new ElevenLabsAgentsProvider('test-agent', {
              config: {
                ...config,
                agentId: 'test-agent',
                baseUrl: 'https://provider.example/v1',
                retries: 0,
                cache: false,
              },
            });
      // ElevenLabs does not expose a function schema through its config.
      // Missing schemas must fail both polarities, regardless of activity.
      const schemaAvailable = family === 'agents' && suppliedTools;
      const verdicts = [
        { inverse: false, expected: schemaAvailable && valid },
        { inverse: true, expected: schemaAvailable && !valid },
      ];
      try {
        const response = await provider.callApi('Return a weather call as JSON.');
        expect(response.error).toBeUndefined();
        expect(response.output).toBe(output);
        expect(response.metadata?.toolCallsSource).toBe(activity ? 'activity' : undefined);
        expect(response.metadata?.toolCalls).toEqual(
          activity
            ? family === 'agents'
              ? [
                  {
                    id: 'activity_test',
                    type: 'command_execution',
                    name: undefined,
                    status: 'completed',
                    turnId: turn.id,
                  },
                ]
              : [summary]
            : [],
        );
        if (family === 'agents') {
          expect(
            requests.find(
              ({ path, method }) => path.endsWith('/agents/sessions') && method === 'POST',
            )?.body,
          ).toMatchObject({
            environment: { type: 'openai_hosted', network: { access: 'disabled' } },
          });
        }
        const before = structuredClone(response);
        for (const gradedResponse of [response, JSON.parse(JSON.stringify(response))]) {
          for (const { inverse, expected } of verdicts) {
            const result = await runAssertion({
              assertion: {
                type: inverse ? 'not-is-valid-openai-tools-call' : 'is-valid-openai-tools-call',
                transform: 'JSON.parse(output)',
              },
              provider,
              providerResponse: gradedResponse,
              prompt: 'test',
              test: { vars: {} },
            });
            expect(result.pass).toBe(expected);
            expect(result.score).toBe(Number(expected));
            expect(result.reason).not.toContain('MCP');
          }
        }
        expect(response).toEqual(before);
      } finally {
        if (provider instanceof ElevenLabsAgentsProvider) {
          await provider.cleanup();
        }
      }
    },
  );
});
