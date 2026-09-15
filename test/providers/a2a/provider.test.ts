import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/util/fetch/index', async () => {
  const actual = await vi.importActual<typeof import('../../../src/util/fetch/index')>(
    '../../../src/util/fetch/index',
  );
  return {
    ...actual,
    fetchWithProxy: vi.fn(),
    fetchWithTimeout: vi.fn(),
  };
});

vi.mock('../../../src/util/time', async () => {
  const actual =
    await vi.importActual<typeof import('../../../src/util/time')>('../../../src/util/time');
  return {
    ...actual,
    sleep: vi.fn().mockResolvedValue(undefined),
  };
});

import { loadApiProvider } from '../../../src/providers';
import { A2AProvider } from '../../../src/providers/a2a';
import { fetchWithProxy, fetchWithTimeout } from '../../../src/util/fetch/index';
import { sleep } from '../../../src/util/time';

import type { Inputs } from '../../../src/types/index';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/a2a+json' },
    status: 200,
    statusText: 'OK',
    ...init,
  });
}

function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
        controller.close();
      },
    }),
    {
      headers: { 'Content-Type': 'text/event-stream' },
      status: 200,
      statusText: 'OK',
    },
  );
}

function provider(config: Record<string, unknown> = {}) {
  return new A2AProvider('a2a:https://agent.example.com/a2a/v1', { config });
}

describe('A2AProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(sleep).mockResolvedValue(undefined);
  });

  it('loads from the provider registry with a bare id and shorthand url', async () => {
    await expect(loadApiProvider('a2a')).resolves.toBeInstanceOf(A2AProvider);
    const loaded = await loadApiProvider('a2a:https://agent.example.com/a2a/v1');
    expect(loaded).toBeInstanceOf(A2AProvider);
    expect(loaded.config.url).toBe('https://agent.example.com/a2a/v1');
  });

  it('uses the shorthand url when config.url is blank', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'blank url response' }],
        },
      }),
    );

    const result = await provider({ url: '' }).callApi('hi');

    expect(result.output).toBe('blank url response');
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://agent.example.com/a2a/v1/message:send',
      expect.objectContaining({ method: 'POST' }),
      expect.any(Number),
    );
  });

  it('sends a non-streaming message and extracts the direct message text', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'hello from a2a' }],
        },
      }),
    );

    const result = await provider({
      headers: { Authorization: 'Bearer {{token}}' },
      message: { role: 'ROLE_USER', parts: [{ text: 'Question: {{prompt}}' }] },
    }).callApi('hi', {
      prompt: { raw: '{{prompt}}', label: 'prompt' },
      vars: { token: 'secret-token', sessionId: 'session-1' },
      testCaseId: 'case-1',
    });

    expect(result.output).toBe('hello from a2a');
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://agent.example.com/a2a/v1/message:send',
      expect.objectContaining({
        body: expect.stringContaining('Question: hi'),
        headers: expect.objectContaining({
          Authorization: 'Bearer secret-token',
          'A2A-Version': '1.0',
          'Content-Type': 'application/a2a+json',
        }),
        method: 'POST',
      }),
      expect.any(Number),
    );
    const requestBody = JSON.parse(vi.mocked(fetchWithTimeout).mock.calls[0]?.[1]?.body as string);
    expect(requestBody.message.contextId).toBe('session-1');
    expect(requestBody.message.messageId).toMatch(/^promptfoo-/);
  });

  it('sends standards-compliant default A2A messages', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'ok' }],
        },
      }),
    );

    const result = await provider().callApi('hello');

    expect(result.output).toBe('ok');
    const requestBody = JSON.parse(vi.mocked(fetchWithTimeout).mock.calls[0]?.[1]?.body as string);
    expect(requestBody.message).toMatchObject({
      role: 'ROLE_USER',
      parts: [{ text: 'hello' }],
    });
  });

  it('returns sessionId from direct message contextId', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          contextId: 'a2a-context-1',
          role: 'ROLE_AGENT',
          parts: [{ text: 'context response' }],
        },
      }),
    );

    const result = await provider().callApi('hello');

    expect(result.output).toBe('context response');
    expect(result.sessionId).toBe('a2a-context-1');
    expect(result.metadata?.a2a).toMatchObject({ contextId: 'a2a-context-1' });
  });

  it('adds image strategy media to default A2A messages', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'image ok' }],
        },
      }),
    );

    const result = await provider().callApi('Please answer the question in the image.', {
      prompt: { raw: '{{prompt}}', label: 'prompt' },
      test: {
        metadata: {
          imageInjectVar: 'image',
          originalText: 'Hidden prompt from the generated image',
          strategyId: 'image',
        },
      },
      vars: {
        image: 'base64-image',
        question: 'Please answer the question in the image.',
      },
    });

    expect(result.output).toBe('image ok');
    const requestBody = JSON.parse(vi.mocked(fetchWithTimeout).mock.calls[0]?.[1]?.body as string);
    expect(requestBody.message).toMatchObject({
      role: 'ROLE_USER',
      parts: [
        { text: 'Please answer the question in the image.' },
        {
          filename: 'promptfoo-image.png',
          mediaType: 'image/png',
          raw: 'base64-image',
        },
      ],
    });
    expect(JSON.stringify(requestBody.message)).not.toContain(
      'Hidden prompt from the generated image',
    );
  });

  it('adds audio strategy media without echoing base64 as text', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'audio ok' }],
        },
      }),
    );

    const result = await provider().callApi('base64-audio', {
      prompt: { raw: '{{prompt}}', label: 'prompt' },
      test: {
        metadata: {
          audioInjectVar: 'audio',
          strategyId: 'audio',
        },
      },
      vars: {
        audio: 'base64-audio',
      },
    });

    expect(result.output).toBe('audio ok');
    const requestBody = JSON.parse(vi.mocked(fetchWithTimeout).mock.calls[0]?.[1]?.body as string);
    expect(requestBody.message).toMatchObject({
      role: 'ROLE_USER',
      parts: [
        {
          filename: 'promptfoo-audio.mp3',
          mediaType: 'audio/mpeg',
          raw: 'base64-audio',
        },
      ],
    });
  });

  it('uses legacy A2A file parts for multimodal default messages on 0.3 agent cards', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          preferredTransport: 'HTTP+JSON',
          protocolVersion: '0.3.0',
          url: 'https://agent.example.com/a2a/main',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          message: {
            role: 'agent',
            parts: [{ text: 'legacy image ok' }],
          },
        }),
      );

    const result = await new A2AProvider('a2a', {
      config: {
        agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
      },
    }).callApi('Please answer the question in the image.', {
      prompt: { raw: '{{prompt}}', label: 'prompt' },
      test: {
        metadata: {
          strategyId: 'image',
        },
      },
      vars: {
        image: 'data:image/jpeg;base64,base64-image',
        question: 'Please answer the question in the image.',
      },
    });

    expect(result.output).toBe('legacy image ok');
    const requestBody = JSON.parse(vi.mocked(fetchWithTimeout).mock.calls[1]?.[1]?.body as string);
    expect(requestBody.message).toMatchObject({
      role: 'user',
      parts: [
        { kind: 'text', text: 'Please answer the question in the image.' },
        {
          file: {
            fileWithBytes: 'base64-image',
            mimeType: 'image/jpeg',
            name: 'promptfoo-image.png',
          },
          kind: 'file',
        },
      ],
    });
  });

  it.each(['1.0', '0.3.0'])('delivers PDF inputs in default A2A %s messages', async (version) => {
    const raw = Buffer.from('%PDF-1.7\nPDF attachment bytes').toString('base64');
    for (const input of ['document', 'invoiceAttachment', 'prompt', 'question']) {
      vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
        jsonResponse({ message: { role: 'ROLE_AGENT', parts: [{ text: 'pdf ok' }] } }),
      );
      const result = await provider({ protocolVersion: version }).callApi('Read the invoice.', {
        prompt: { raw: '{{question}}', label: 'question' },
        test: {
          metadata: {
            strategyId: 'pdf',
            originalText: 'Hidden PDF instructions',
            pdf: input === 'document' ? undefined : { input },
          },
        },
        vars: {
          document: 'Wrong fallback document',
          question: 'Read the invoice.',
          [input]: `data:application/pdf;base64,${raw}`,
        },
      });
      expect(result.output).toBe('pdf ok');
      const body = JSON.parse(vi.mocked(fetchWithTimeout).mock.lastCall?.[1]?.body as string);
      expect(body.message.parts).toEqual(
        version === '0.3.0'
          ? [
              { kind: 'text', text: 'Read the invoice.' },
              {
                kind: 'file',
                file: {
                  fileWithBytes: raw,
                  mimeType: 'application/pdf',
                  name: 'promptfoo-document.pdf',
                },
              },
            ]
          : [
              { text: 'Read the invoice.' },
              { filename: 'promptfoo-document.pdf', mediaType: 'application/pdf', raw },
            ],
      );
      expect(JSON.stringify(body.message)).not.toContain('Hidden PDF instructions');
    }
  });

  it.each(['1.0', '0.3.0'])(
    'preserves declared PDF companion inputs in A2A %s without including auxiliary variables',
    async (version) => {
      const raw = Buffer.from('%PDF-1.7\nPDF attachment bytes').toString('base64');
      const companionCases: Record<string, string>[] = [
        { request: 'Read the invoice.' },
        { request: 'Read the invoice.', locale: 'en-US' },
        {},
      ];
      for (const companions of companionCases) {
        vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
          jsonResponse({ message: { role: 'ROLE_AGENT', parts: [{ text: 'pdf ok' }] } }),
        );
        const inputs: Inputs = {
          invoice: { type: 'pdf', description: 'An invoice' },
          photo: { type: 'image', description: 'A receipt' },
          ...Object.fromEntries(Object.keys(companions).map((key) => [key, 'A text input'])),
        };
        const vars = {
          invoice: `data:application/pdf;base64,${raw}`,
          photo: 'data:image/png;base64,UE5H',
          ...companions,
          question: 'Undeclared question',
          apiKey: 'Private provider credential',
          sessionContext: 'Private session context',
        };
        const prompt = JSON.stringify({
          invoice: vars.invoice,
          ...companions,
          optionalInput: '',
        });
        const result = await provider({ protocolVersion: version }).callApi(prompt, {
          prompt: { raw: prompt, label: 'auto-generated input prompt' },
          test: {
            metadata: {
              strategyId: 'pdf',
              pdf: { input: 'invoice' },
              pluginConfig: { inputs },
              originalText: 'Hidden PDF instructions',
            },
          },
          vars,
        });
        expect(result.output).toBe('pdf ok');
        const body = JSON.parse(vi.mocked(fetchWithTimeout).mock.lastCall?.[1]?.body as string);
        const textParts = body.message.parts.filter((part: { text?: string }) => part.text);
        const values = Object.values(companions);
        expect(textParts.map((part: { text: string }) => part.text)).toEqual(
          values.length === 0 ? [] : [values.length === 1 ? values[0] : JSON.stringify(companions)],
        );
        const filePart = body.message.parts.at(-1);
        expect(version === '0.3.0' ? filePart.file.fileWithBytes : filePart.raw).toBe(raw);
        for (const omitted of [
          vars.question,
          vars.apiKey,
          vars.sessionContext,
          vars.photo,
          'Hidden PDF instructions',
        ]) {
          expect(JSON.stringify(body.message)).not.toContain(omitted);
        }
      }
    },
  );

  it.each(['1.0', '0.3.0'])(
    'includes declared companions alongside a static PDF task in A2A %s',
    async (version) => {
      vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
        jsonResponse({ message: { role: 'ROLE_AGENT', parts: [{ text: 'pdf ok' }] } }),
      );
      const document = 'data:application/pdf;base64,JVBERi0x';
      await provider({ protocolVersion: version }).callApi(`Summarize ${document}`, {
        prompt: { raw: `Summarize ${document}`, label: 'PDF task' },
        vars: {
          document,
          question: 'What is the total?',
          locale: 'en',
          apiKey: 'Private credential',
        },
        test: {
          metadata: {
            strategyId: 'pdf',
            pdf: { input: 'document' },
            pluginConfig: {
              inputs: {
                document: { type: 'pdf', description: 'Invoice' },
                question: 'Question',
                locale: 'Language',
              },
            },
          },
        },
      });
      const body = JSON.parse(vi.mocked(fetchWithTimeout).mock.lastCall?.[1]?.body as string);
      const text = body.message.parts.find((part: { text?: string }) => part.text).text;
      expect(JSON.parse(text)).toEqual({
        task: 'Summarize [PDF attachment]',
        inputs: { question: 'What is the total?', locale: 'en' },
      });
      expect(text).not.toContain('Private credential');
    },
  );

  it.each(['1.0', '0.3.0'])(
    'preserves static instructions beside PDF attachments in A2A %s',
    async (version) => {
      const raw = Buffer.from('%PDF-1.7\nPDF attachment bytes').toString('base64');
      const document = `data:application/pdf;base64,${raw}`;
      const cases = [
        {
          prompt: `Summarize ${document} in Spanish.`,
          expected: 'Summarize [PDF attachment] in Spanish.',
        },
        {
          prompt: `Summarize ${raw} in Spanish.`,
          expected: 'Summarize [PDF attachment] in Spanish.',
        },
        {
          prompt: `Read ${document} and answer in Spanish: What is the total?`,
          expected: 'Read [PDF attachment] and answer in Spanish: What is the total?',
          request: 'What is the total?',
        },
        {
          prompt: JSON.stringify({ instruction: 'Summarize in Spanish.', document }),
          expected: JSON.stringify({
            instruction: 'Summarize in Spanish.',
            document: '[PDF attachment]',
          }),
          instruction: 'Summarize in Spanish.',
        },
        {
          prompt: JSON.stringify([{ role: 'user', content: `Summarize ${document}.` }]),
          expected: JSON.stringify([{ role: 'user', content: 'Summarize [PDF attachment].' }]),
        },
        { prompt: document, expected: undefined },
        { prompt: JSON.stringify(document), expected: undefined },
      ];
      for (const { prompt, expected, request, instruction } of cases) {
        for (const inputs of [
          undefined,
          {
            document: { type: 'pdf' as const, description: 'Invoice' },
            ...(request
              ? { request: { type: 'text' as const, description: 'Invoice question' } }
              : {}),
          },
        ]) {
          vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
            jsonResponse({ message: { role: 'ROLE_AGENT', parts: [{ text: 'pdf ok' }] } }),
          );
          await provider({ protocolVersion: version }).callApi(prompt, {
            prompt: { raw: prompt, label: 'PDF task' },
            vars: {
              document,
              ...(request ? { request } : {}),
              ...(instruction ? { instruction } : {}),
              apiKey: 'Private credential',
            },
            test: {
              metadata: { strategyId: 'pdf', pdf: { input: 'document' }, pluginConfig: { inputs } },
            },
          });
          const body = JSON.parse(vi.mocked(fetchWithTimeout).mock.lastCall?.[1]?.body as string);
          const textParts = body.message.parts.filter((part: { text?: string }) => part.text);
          expect(textParts.map((part: { text: string }) => part.text)).toEqual(
            expected
              ? [
                  inputs && request
                    ? JSON.stringify({ task: expected, inputs: { request } })
                    : expected,
                ]
              : [],
          );
          const filePart = body.message.parts.at(-1);
          expect(version === '0.3.0' ? filePart.file.fileWithBytes : filePart.raw).toBe(raw);
          expect(JSON.stringify(textParts)).not.toContain(raw);
          expect(JSON.stringify(textParts)).not.toContain('Private credential');
        }
      }
    },
  );

  it.each(['image', 'pdf'])(
    'keeps explicit messages unchanged for the %s strategy',
    async (strategyId) => {
      vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
        jsonResponse({
          message: {
            role: 'ROLE_AGENT',
            parts: [{ text: 'custom ok' }],
          },
        }),
      );

      const result = await provider({
        message: {
          parts: [{ text: 'Custom {{question}}' }],
          role: 'ROLE_USER',
        },
      }).callApi('Please answer the question in the image.', {
        prompt: { raw: '{{prompt}}', label: 'prompt' },
        test: {
          metadata: {
            strategyId,
            pdf: { input: 'document' },
          },
        },
        vars: {
          image: 'base64-image',
          document: 'data:application/pdf;base64,JVBERi0xLjc=',
          question: 'question text',
        },
      });

      expect(result.output).toBe('custom ok');
      const requestBody = JSON.parse(
        vi.mocked(fetchWithTimeout).mock.calls[0]?.[1]?.body as string,
      );
      expect(requestBody.message.parts).toEqual([{ text: 'Custom question text' }]);
    },
  );

  it('discovers an HTTP+JSON interface from the agent card', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          capabilities: { streaming: false },
          supportedInterfaces: [
            {
              protocolBinding: 'JSONRPC',
              url: 'https://agent.example.com/jsonrpc',
            },
            {
              protocolBinding: 'HTTP+JSON',
              protocolVersion: '1.0',
              tenant: 'tenant-a',
              url: 'https://agent.example.com/a2a/http',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          message: {
            role: 'ROLE_AGENT',
            parts: [{ text: 'card response' }],
          },
        }),
      );

    const result = await new A2AProvider('a2a', {
      config: {
        agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
      },
    }).callApi('hello');

    expect(result.output).toBe('card response');
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://agent.example.com/a2a/http/message:send',
      expect.objectContaining({
        body: expect.stringContaining('"tenant":"tenant-a"'),
        headers: expect.objectContaining({ 'A2A-Version': '1.0' }),
      }),
      expect.any(Number),
    );
  });

  it('discovers HTTP+JSON from legacy additionalInterfaces agent cards', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          preferredTransport: 'JSONRPC',
          url: 'https://agent.example.com/jsonrpc',
          additionalInterfaces: [
            {
              transport: 'HTTP+JSON',
              protocolVersion: '1.0',
              tenant: 'tenant-a',
              url: 'https://agent.example.com/a2a/http',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          message: {
            role: 'ROLE_AGENT',
            parts: [{ text: 'legacy card response' }],
          },
        }),
      );

    const result = await new A2AProvider('a2a', {
      config: {
        agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
      },
    }).callApi('hello');

    expect(result.output).toBe('legacy card response');
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://agent.example.com/a2a/http/message:send',
      expect.objectContaining({
        body: expect.stringContaining('"tenant":"tenant-a"'),
      }),
      expect.any(Number),
    );
  });

  it('fails fast when an agent card only advertises JSON-RPC', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        preferredTransport: 'JSONRPC',
        url: 'https://agent.example.com/jsonrpc',
      }),
    );

    const result = await new A2AProvider('a2a', {
      config: {
        agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
      },
    }).callApi('hello');

    expect(result.error).toContain('does not advertise a supported HTTP+JSON interface');
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not treat a legacy agent card URL without preferredTransport as HTTP+JSON', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        url: 'https://agent.example.com/jsonrpc',
      }),
    );

    const result = await new A2AProvider('a2a', {
      config: {
        agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
      },
    }).callApi('hello');

    expect(result.error).toContain('does not advertise a supported HTTP+JSON interface');
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it('uses the Agent Card protocol version when the main URL is HTTP+JSON', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          preferredTransport: 'HTTP+JSON',
          protocolVersion: '0.3.0',
          url: 'https://agent.example.com/a2a/main',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          message: {
            role: 'agent',
            parts: [{ text: 'main url response' }],
          },
        }),
      );

    const result = await new A2AProvider('a2a', {
      config: {
        agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
      },
    }).callApi('hello');

    expect(result.output).toBe('main url response');
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://agent.example.com/a2a/main/message:send',
      expect.objectContaining({
        headers: expect.objectContaining({ 'A2A-Version': '0.3.0' }),
      }),
      expect.any(Number),
    );
    const requestBody = JSON.parse(vi.mocked(fetchWithTimeout).mock.calls[1]?.[1]?.body as string);
    expect(requestBody.message).toMatchObject({
      role: 'user',
      parts: [{ kind: 'text', text: 'hello' }],
    });
  });

  it('does not inherit discovered tenant when config.url overrides Agent Card interface URL', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          supportedInterfaces: [
            {
              protocolBinding: 'HTTP+JSON',
              tenant: 'tenant-a',
              url: 'https://agent.example.com/a2a/tenant-a',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          message: {
            role: 'agent',
            parts: [{ text: 'explicit url response' }],
          },
        }),
      );

    const result = await new A2AProvider('a2a', {
      config: {
        agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
        url: 'https://agent.example.com/a2a/explicit',
      },
    }).callApi('hello');

    expect(result.output).toBe('explicit url response');
    const requestBody = JSON.parse(vi.mocked(fetchWithTimeout).mock.calls[1]?.[1]?.body as string);
    expect(requestBody).not.toHaveProperty('tenant');
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://agent.example.com/a2a/explicit/message:send',
      expect.any(Object),
      expect.any(Number),
    );
  });

  it('applies bearer auth to agent card and operation requests', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          supportedInterfaces: [
            {
              protocolBinding: 'HTTP+JSON',
              url: 'https://agent.example.com/a2a/http',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          message: {
            role: 'ROLE_AGENT',
            parts: [{ text: 'authenticated response' }],
          },
        }),
      );

    const result = await new A2AProvider('a2a', {
      config: {
        agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
        auth: { type: 'bearer', token: '{{A2A_TOKEN}}' },
      },
    }).callApi('hello', {
      prompt: { raw: '{{prompt}}', label: 'prompt' },
      vars: { A2A_TOKEN: 'secret-token' },
    });

    expect(result.output).toBe('authenticated response');
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(
      1,
      'https://agent.example.com/.well-known/agent-card.json',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
        method: 'GET',
      }),
      expect.any(Number),
    );
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://agent.example.com/a2a/http/message:send',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }),
        method: 'POST',
      }),
      expect.any(Number),
    );
  });

  it('supports basic auth headers', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'basic auth response' }],
        },
      }),
    );

    const result = await provider({
      auth: { type: 'basic', username: 'user', password: 'pass' },
    }).callApi('hi');

    expect(result.output).toBe('basic auth response');
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://agent.example.com/a2a/v1/message:send',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('user:pass').toString('base64')}`,
        }),
      }),
      expect.any(Number),
    );
  });

  it('supports api key auth in query parameters', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'query auth response' }],
        },
      }),
    );

    const result = await provider({
      auth: {
        keyName: 'api_key',
        placement: 'query',
        type: 'api_key',
        value: '{{A2A_API_KEY}}',
      },
    }).callApi('hi', {
      prompt: { raw: '{{prompt}}', label: 'prompt' },
      vars: { A2A_API_KEY: 'query-secret' },
    });

    expect(result.output).toBe('query auth response');
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://agent.example.com/a2a/v1/message:send?api_key=query-secret',
      expect.objectContaining({ method: 'POST' }),
      expect.any(Number),
    );
  });

  it('preserves endpoint query strings when appending operation paths', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'agent',
          parts: [{ text: 'query response' }],
        },
      }),
    );

    const result = await new A2AProvider('a2a:https://agent.example.com/a2a/v1?tenant=a', {
      config: {},
    }).callApi('hi');

    expect(result.output).toBe('query response');
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://agent.example.com/a2a/v1/message:send?tenant=a',
      expect.objectContaining({ method: 'POST' }),
      expect.any(Number),
    );
  });

  it('fetches OAuth client credentials tokens for operation requests', async () => {
    vi.mocked(fetchWithProxy).mockResolvedValueOnce(
      jsonResponse({
        access_token: 'oauth-token',
        expires_in: 3600,
      }),
    );
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'oauth response' }],
        },
      }),
    );

    const result = await provider({
      auth: {
        clientId: '{{clientId}}',
        clientSecret: '{{clientSecret}}',
        grantType: 'client_credentials',
        scopes: ['a2a.send'],
        tokenUrl: 'https://auth.example.com/oauth/token',
        type: 'oauth',
      },
    }).callApi('hi', {
      prompt: { raw: '{{prompt}}', label: 'prompt' },
      vars: { clientId: 'client-1', clientSecret: 'client-secret' },
    });

    expect(result.output).toBe('oauth response');
    expect(fetchWithProxy).toHaveBeenCalledWith(
      'https://auth.example.com/oauth/token',
      expect.objectContaining({
        body: expect.stringContaining('client_id=client-1'),
        headers: expect.objectContaining({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        method: 'POST',
      }),
    );
    expect(fetchWithProxy).toHaveBeenCalledWith(
      'https://auth.example.com/oauth/token',
      expect.objectContaining({
        body: expect.stringContaining('scope=a2a.send'),
      }),
    );
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://agent.example.com/a2a/v1/message:send',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer oauth-token' }),
      }),
      expect.any(Number),
    );
  });

  it('renders templated OAuth scope strings before splitting them', async () => {
    vi.mocked(fetchWithProxy).mockResolvedValueOnce(
      jsonResponse({
        access_token: 'oauth-token',
        expires_in: 3600,
      }),
    );
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'oauth scoped response' }],
        },
      }),
    );

    const result = await provider({
      auth: {
        clientId: 'client-1',
        clientSecret: 'client-secret',
        grantType: 'client_credentials',
        scopes: '{{ env.A2A_SCOPES }}',
        tokenUrl: 'https://auth.example.com/oauth/template-token',
        type: 'oauth',
      },
    }).callApi('hi', {
      prompt: { raw: '{{prompt}}', label: 'prompt' },
      vars: { env: { A2A_SCOPES: 'a2a.send a2a.read' } },
    });

    expect(result.output).toBe('oauth scoped response');
    expect(fetchWithProxy).toHaveBeenCalledWith(
      'https://auth.example.com/oauth/template-token',
      expect.objectContaining({
        body: expect.stringContaining('scope=a2a.send+a2a.read'),
        method: 'POST',
      }),
    );
  });

  it('extracts output from a completed task artifact', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ parts: [{ text: 'artifact text' }] }],
        },
      }),
    );

    const result = await provider().callApi('hi');

    expect(result.output).toBe('artifact text');
    expect(result.metadata?.a2a).toMatchObject({
      mode: 'send',
      taskId: 'task-1',
      taskState: 'TASK_STATE_COMPLETED',
    });
  });

  it('prefers completed task artifacts over status messages', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: {
            state: 'TASK_STATE_COMPLETED',
            message: { parts: [{ text: 'Completed lifecycle status' }] },
          },
          artifacts: [{ parts: [{ text: 'Final artifact text' }] }],
        },
      }),
    );

    const result = await provider().callApi('hi');

    expect(result.output).toBe('Final artifact text');
  });

  it('falls back to completed task status text when artifacts are absent', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: {
            state: 'TASK_STATE_COMPLETED',
            message: { parts: [{ text: 'Completed fallback text' }] },
          },
        },
      }),
    );

    const result = await provider().callApi('hi');

    expect(result.output).toBe('Completed fallback text');
  });

  it('accepts bare task responses from message:send', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        id: 'task-1',
        status: { state: 'TASK_STATE_COMPLETED' },
        artifacts: [{ parts: [{ text: 'bare task text' }] }],
      }),
    );

    const result = await provider().callApi('hi');

    expect(result.output).toBe('bare task text');
  });

  it('polls non-terminal tasks until completion', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          task: {
            id: 'task-1',
            status: { state: 'TASK_STATE_WORKING' },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-1',
          contextId: 'a2a-task-context',
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ parts: [{ text: 'done later' }] }],
        }),
      );

    const result = await provider({ polling: { intervalMs: 0, timeoutMs: 1000 } }).callApi('hi');

    expect(result.output).toBe('done later');
    expect(result.sessionId).toBe('a2a-task-context');
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://agent.example.com/a2a/v1/tasks/task-1',
      expect.objectContaining({ method: 'GET' }),
      expect.any(Number),
    );
  });

  it('uses the final polled task as raw output for async send responses', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          task: {
            id: 'task-1',
            status: { state: 'TASK_STATE_WORKING' },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-1',
          status: { state: 'TASK_STATE_COMPLETED' },
          metadata: { structured: true },
        }),
      );

    const result = await provider({ polling: { intervalMs: 0, timeoutMs: 1000 } }).callApi('hi');

    expect(result.output).toContain('"structured":true');
    expect(result.raw).toMatchObject({
      id: 'task-1',
      metadata: { structured: true },
      status: { state: 'TASK_STATE_COMPLETED' },
    });
  });

  it('includes tenant query parameter when polling tasks', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          task: {
            id: 'task-1',
            status: { state: 'TASK_STATE_WORKING' },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-1',
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ parts: [{ text: 'tenant done' }] }],
        }),
      );

    const result = await provider({
      polling: { intervalMs: 0, timeoutMs: 1000 },
      tenant: 'tenant-a',
    }).callApi('hi');

    expect(result.output).toBe('tenant done');
    expect(fetchWithTimeout).toHaveBeenNthCalledWith(
      2,
      'https://agent.example.com/a2a/v1/tasks/task-1?tenant=tenant-a',
      expect.objectContaining({ method: 'GET' }),
      expect.any(Number),
    );
  });

  it('recognizes standard completed task state spelling', async () => {
    vi.mocked(fetchWithTimeout)
      .mockResolvedValueOnce(
        jsonResponse({
          task: {
            id: 'task-1',
            status: { state: 'working' },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-1',
          status: { state: 'completed' },
          artifacts: [{ parts: [{ text: 'standard done' }] }],
        }),
      );

    const result = await provider({ polling: { intervalMs: 0, timeoutMs: 1000 } }).callApi('hi');

    expect(result.output).toBe('standard done');
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each([
    ['TASK_STATE_FAILED', 'failed'],
    ['TASK_STATE_CANCELED', 'canceled'],
    ['TASK_STATE_CANCELLED', 'canceled'],
    ['TASK_STATE_REJECTED', 'rejected'],
    ['TASK_STATE_INPUT_REQUIRED', 'requires additional input'],
    ['TASK_STATE_AUTH_REQUIRED', 'requires additional authentication'],
  ])('returns an error for %s tasks', async (state, expected) => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: {
            state,
            message: { parts: [{ text: 'state detail' }] },
          },
        },
      }),
    );

    const result = await provider().callApi('hi');

    expect(result.error).toContain(expected);
    expect(result.error).toContain('state detail');
  });

  it.each([
    ['failed', 'failed'],
    ['canceled', 'canceled'],
    ['rejected', 'rejected'],
    ['input-required', 'requires additional input'],
    ['auth-required', 'requires additional authentication'],
  ])('returns an error for standard %s tasks', async (state, expected) => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: {
            state,
            message: { parts: [{ text: 'state detail' }] },
          },
        },
      }),
    );

    const result = await provider().callApi('hi');

    expect(result.error).toContain(expected);
    expect(result.error).toContain('state detail');
  });

  it('filters user messages from history fallback output', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: { state: 'completed' },
          history: [
            { role: 'ROLE_USER', parts: [{ text: 'user prompt' }] },
            { role: 'ROLE_AGENT', parts: [{ text: 'agent answer' }] },
          ],
        },
      }),
    );

    const result = await provider().callApi('hi');

    expect(result.output).toBe('agent answer');
  });

  it('falls back to raw JSON when history only contains user messages', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: { state: 'completed' },
          history: [{ role: 'ROLE_USER', parts: [{ text: 'user prompt' }] }],
        },
      }),
    );

    const result = await provider().callApi('hi');

    expect(result.output).toContain('"history"');
    expect(result.output).toContain('"user prompt"');
  });

  it('consumes a message-only SSE stream', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      sseResponse([
        {
          message: {
            role: 'ROLE_AGENT',
            parts: [{ text: 'streamed text' }],
          },
        },
      ]),
    );

    const result = await provider({ mode: 'stream' }).callApi('hi');

    expect(result.output).toBe('streamed text');
    expect(fetchWithTimeout).toHaveBeenCalledWith(
      'https://agent.example.com/a2a/v1/message:stream',
      expect.objectContaining({
        headers: expect.objectContaining({ Accept: 'text/event-stream' }),
      }),
      expect.any(Number),
    );
  });

  it('accumulates task lifecycle SSE events', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      sseResponse([
        {
          task: {
            id: 'task-1',
            status: { state: 'TASK_STATE_WORKING' },
          },
        },
        {
          artifactUpdate: {
            taskId: 'task-1',
            artifact: { parts: [{ text: 'partial artifact' }] },
          },
        },
        {
          statusUpdate: {
            contextId: 'a2a-stream-context',
            taskId: 'task-1',
            status: { state: 'TASK_STATE_COMPLETED' },
          },
        },
      ]),
    );

    const result = await provider({ mode: 'stream' }).callApi('hi');

    expect(result.output).toBe('partial artifact');
    expect(result.sessionId).toBe('a2a-stream-context');
    expect(result.metadata?.a2a).toMatchObject({
      contextId: 'a2a-stream-context',
      mode: 'stream',
      taskId: 'task-1',
      taskState: 'TASK_STATE_COMPLETED',
    });
  });

  it('merges appended streaming artifact chunks for the same artifact', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      sseResponse([
        {
          task: {
            id: 'task-1',
            status: { state: 'TASK_STATE_WORKING' },
          },
        },
        {
          artifactUpdate: {
            append: false,
            taskId: 'task-1',
            artifact: { artifactId: 'artifact-1', parts: [{ text: 'hel' }] },
          },
        },
        {
          artifactUpdate: {
            append: true,
            taskId: 'task-1',
            artifact: { artifactId: 'artifact-1', parts: [{ text: 'lo' }] },
          },
        },
        {
          statusUpdate: {
            taskId: 'task-1',
            status: { state: 'TASK_STATE_COMPLETED' },
          },
        },
      ]),
    );

    const result = await provider({ mode: 'stream' }).callApi('hi');

    expect(result.output).toBe('hello');
    expect(result.raw).toHaveLength(4);
  });

  it('preserves streamed artifacts when a terminal task frame omits artifacts', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      sseResponse([
        {
          task: {
            id: 'task-1',
            status: { state: 'TASK_STATE_WORKING' },
          },
        },
        {
          artifactUpdate: {
            taskId: 'task-1',
            artifact: { artifactId: 'artifact-1', parts: [{ text: 'streamed artifact result' }] },
          },
        },
        {
          task: {
            id: 'task-1',
            status: { state: 'TASK_STATE_COMPLETED' },
          },
        },
      ]),
    );

    const result = await provider({ mode: 'stream' }).callApi('hi');

    expect(result.output).toBe('streamed artifact result');
    expect(result.metadata?.a2a).toMatchObject({
      taskId: 'task-1',
      taskState: 'TASK_STATE_COMPLETED',
    });
  });

  it('replaces existing streaming artifacts when append is false', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      sseResponse([
        {
          task: {
            id: 'task-1',
            status: { state: 'TASK_STATE_WORKING' },
          },
        },
        {
          artifactUpdate: {
            append: false,
            taskId: 'task-1',
            artifact: { artifactId: 'artifact-1', parts: [{ text: 'stale draft' }] },
          },
        },
        {
          artifactUpdate: {
            append: false,
            taskId: 'task-1',
            artifact: { artifactId: 'artifact-1', parts: [{ text: 'final answer' }] },
          },
        },
        {
          statusUpdate: {
            taskId: 'task-1',
            status: { state: 'TASK_STATE_COMPLETED' },
          },
        },
      ]),
    );

    const result = await provider({ mode: 'stream' }).callApi('hi');

    expect(result.output).toBe('final answer');
    expect(result.output).not.toContain('stale draft');
  });

  it('returns a provider error for malformed SSE events', async () => {
    const encoder = new TextEncoder();
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: {not-json}\n\n'));
            controller.close();
          },
        }),
        { status: 200, statusText: 'OK' },
      ),
    );

    const result = await provider({ mode: 'stream' }).callApi('hi');

    expect(result.error).toContain('A2A Provider error');
  });

  it('returns a provider error for SSE protocol error events instead of prior partial output', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      sseResponse([
        {
          message: {
            role: 'ROLE_AGENT',
            parts: [{ text: 'partial output' }],
          },
        },
        {
          error: {
            code: -32000,
            message: 'stream failed',
          },
        },
      ]),
    );

    const result = await provider({ mode: 'stream' }).callApi('hi');

    expect(result.output).toBeUndefined();
    expect(result.error).toContain('A2A stream error: stream failed (code: -32000)');
  });

  it('forwards abort signals to requests', async () => {
    const controller = new AbortController();
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'ok' }],
        },
      }),
    );

    await provider().callApi('hi', undefined, { abortSignal: controller.signal });

    expect(fetchWithTimeout).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
      expect.any(Number),
    );
  });

  it('applies a custom transformResponse', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        message: {
          role: 'ROLE_AGENT',
          parts: [{ text: 'original' }],
        },
      }),
    );

    const result = await provider({
      transformResponse: '(result, text, context) => ({ output: `${context.mode}:${text}` })',
    }).callApi('hi');

    expect(result.output).toBe('send:original');
  });

  it('supports HTTP-style json variable in string transformResponse', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ parts: [{ text: 'artifact text' }] }],
        },
      }),
    );

    const result = await provider({
      transformResponse: '({ output: `${json.task.id}:${text}` })',
    }).callApi('hi');

    expect(result.output).toBe('task-1:artifact text');
  });

  it('keeps result as an alias in string transformResponse', async () => {
    vi.mocked(fetchWithTimeout).mockResolvedValueOnce(
      jsonResponse({
        task: {
          id: 'task-1',
          status: { state: 'TASK_STATE_COMPLETED' },
          artifacts: [{ parts: [{ text: 'artifact text' }] }],
        },
      }),
    );

    const result = await provider({
      transformResponse: '({ output: result.task.id })',
    }).callApi('hi');

    expect(result.output).toBe('task-1');
  });
});
