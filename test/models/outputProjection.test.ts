import { describe, expect, it } from 'vitest';
import {
  getStripFlags,
  projectTracesForOutput,
  sanitizePromptForArtifact,
  sanitizeResultForJsonlArtifact,
} from '../../src/models/evalResult';
import { sanitizeConfigForOutput } from '../../src/util/sanitizer';

import type { TraceData } from '../../src/types';

const flags = (values = {}) => ({
  ...getStripFlags({
    PROMPTFOO_STRIP_PROMPT_TEXT: 'false',
    PROMPTFOO_STRIP_RESPONSE_OUTPUT: 'false',
    PROMPTFOO_STRIP_TEST_VARS: 'false',
    PROMPTFOO_STRIP_GRADING_RESULT: 'false',
    PROMPTFOO_STRIP_METADATA: 'false',
  }),
  ...values,
});

describe('artifact projection compatibility', () => {
  it.each([false, true])(
    'returns a safe prompt when nested config cannot be read (strip=%s)',
    (strip) => {
      const prompt = {
        id: 'a'.repeat(64),
        raw: 'original prompt',
        label: 'original label',
        config: {
          get unreadable() {
            throw new Error('fixture unavailable');
          },
        },
      };
      expect(sanitizePromptForArtifact(prompt, strip)).toEqual({
        id: prompt.id,
        raw: strip ? '[prompt stripped]' : '[REDACTED]',
        label: strip ? '[prompt stripped]' : '[REDACTED]',
      });
      expect(prompt.raw).toBe('original prompt');
    },
  );

  it('omits config that cannot be read without exposing original fields', () => {
    const config = {
      basePath: '/fixture',
      get prompts(): string {
        throw new Error('fixture unavailable');
      },
    };
    expect(sanitizeConfigForOutput(config)).toEqual({});
  });

  it.each(['old response', 7, false])(
    'preserves primitive responses unless output stripping is requested: %s',
    (response) => {
      const row = { response, testCase: 'legacy test', score: 1 };
      expect(
        sanitizeResultForJsonlArtifact(
          row,
          flags({
            shouldStripPromptText: true,
            shouldStripTestVars: true,
            shouldStripGradingResult: true,
          }),
        ),
      ).toMatchObject(row);
      expect(
        sanitizeResultForJsonlArtifact(row, flags({ shouldStripResponseOutput: true })),
      ).toMatchObject({
        response: { output: '[output stripped]' },
        testCase: 'legacy test',
        score: 1,
      });
    },
  );

  it.each(['id', 'raw', 'label', 'ordinary prompt'])(
    'omits config prompt-map text even when a raw prompt is named %s',
    (key) => {
      const config = { prompts: { [key]: 'friendly label' } };
      expect(
        sanitizeConfigForOutput(config, flags({ shouldStripPromptText: true })),
      ).not.toHaveProperty('prompts');
      expect(config.prompts[key]).toBe('friendly label');
    },
  );

  it('handles legacy scenario config objects and keeps vendor prompt options opaque', () => {
    const config = {
      providers: [{ echo: { prompts: ['selector'], config: { prompts: ['vendor option'] } } }],
      scenarios: [
        {
          config: {
            vars: { value: 'source variable' },
            providerOutput: 'stored output',
            options: { prefix: 'prefix', suffix: 'suffix', temperature: 0.2 },
          },
          tests: ['legacy test'],
        },
      ],
    };
    const original = structuredClone(config);
    const result = sanitizeConfigForOutput(
      config as never,
      flags({
        shouldStripPromptText: true,
        shouldStripTestVars: true,
        shouldStripResponseOutput: true,
      }),
    );
    expect(result).toMatchObject({
      providers: [
        { echo: { prompts: ['[prompt stripped]'], config: { prompts: ['vendor option'] } } },
      ],
      scenarios: [{ config: { options: { temperature: 0.2 } }, tests: ['legacy test'] }],
    });
    expect(JSON.stringify(result)).not.toContain('stored output');
    expect(JSON.stringify(result)).not.toContain('source variable');
    expect(config).toEqual(original);
  });

  it('projects known trace output fields and event copies while preserving accounting', () => {
    const trace = {
      traceId: 'trace',
      evaluationId: 'eval',
      testCaseId: 'test',
      metadata: 'legacy metadata',
      spans: [
        {
          spanId: 'span',
          name: 'exec fixture command',
          startTime: 1,
          endTime: 2,
          attributes: {
            'codex.command': 'fixture command',
            'codex.output': 'result text',
            'codex.message': 'message text',
            'codex.reasoning': 'reasoning text',
            'tool.arguments': { value: 'argument' },
            'gen_ai.usage.output_tokens': 3,
            'promptfoo.request.body': 'input text',
          },
          events: [
            {
              name: 'codex.message',
              timestamp: 1.5,
              attributes: { 'codex.message.text': 'event text', sequence: 2 },
            },
          ],
        },
      ],
    };
    const original = structuredClone(trace);
    const [projected] = projectTracesForOutput(
      [trace as unknown as TraceData],
      flags({ shouldStripResponseOutput: true, shouldStripTestVars: true }),
    );
    expect(projected).toMatchObject({
      metadata: 'legacy metadata',
      spans: [
        {
          name: 'exec [output stripped]',
          startTime: 1,
          endTime: 2,
          attributes: { 'gen_ai.usage.output_tokens': 3, 'promptfoo.request.body': 'input text' },
          events: [{ name: 'codex.message', timestamp: 1.5, attributes: { sequence: 2 } }],
        },
      ],
    });
    expect(JSON.stringify(projected)).not.toContain('result text');
    expect(JSON.stringify(projected)).not.toContain('message text');
    expect(JSON.stringify(projected)).not.toContain('reasoning text');
    expect(JSON.stringify(projected)).not.toContain('event text');
    expect(trace).toEqual(original);
  });

  it('removes agent tool payloads and duplicated audio only with response-output stripping', () => {
    const metadata = {
      toolCalls: [{ input: 'tool input', output: 'tool output' }],
      skillCalls: [{ input: 'skill input' }],
      permissionDenials: ['denied call'],
      structuredOutput: { answer: 'structured output' },
      audio: { data: 'audio data' },
      sessionId: 'session',
      count: 2,
    };
    const row = {
      response: { output: 'text', metadata, tokenUsage: { total: 3 } },
      metadata,
      score: 1,
    };
    const projected = sanitizeResultForJsonlArtifact(
      row,
      flags({ shouldStripResponseOutput: true }),
    );
    expect(projected.response).toEqual({
      output: '[output stripped]',
      metadata: { sessionId: 'session', count: 2 },
      tokenUsage: { total: 3 },
    });
    expect(projected.metadata).toEqual({ sessionId: 'session', count: 2 });
    expect(sanitizeResultForJsonlArtifact(row, flags()).response).toEqual(row.response);
    expect(row.metadata).toBe(metadata);
  });
});
