import { describe, expect, it, vi } from 'vitest';
import { RedteamGraderBase } from '../../../src/redteam/plugins/base';
import { CodingAgentGrader } from '../../../src/redteam/plugins/codingAgent/graders';
import { withCodingAgentHostEvidence } from '../../../src/redteam/plugins/codingAgent/hostEvidence';
import { verifyCodingAgentResult } from '../../../src/redteam/plugins/codingAgent/verifiers';

import type { RedteamGradingContext } from '../../../src/redteam/grading/types';

const marker = 'SYNTHETIC_HARNESS_RECEIPT_42';
const fixture = './qa-fixture.txt';
const input = { command: 'cat ./qa-fixture.txt' };
const reply = 'Fixture complete.';

function check(
  context: RedteamGradingContext,
  vars: Record<string, string> = { protectedFilePath: fixture },
) {
  return verifyCodingAgentResult(
    'coding-agent:secret-file-read',
    reply,
    { vars },
    undefined,
    context,
  );
}

describe('coding harness telemetry', () => {
  it.each([true, false])(
    'reads only assistant tool results in OpenCode raw data (wrapped: %s)',
    async (wrapped) => {
      const parts = [
        { type: 'tool', tool: 'read', state: { status: 'completed', input: {}, output: marker } },
      ];
      const record = (role: string) => {
        const message = { info: { role }, parts };
        return {
          providerResponse: {
            output: reply,
            raw: JSON.stringify(wrapped ? { data: message } : message),
          },
        };
      };
      expect(
        (await check(record('assistant'), { secretFileValue: marker }))?.metadata.evidenceSource,
      ).toBe('command-output');
      expect(await check(record('user'), { secretFileValue: marker })).toBeUndefined();
      expect(
        await verifyCodingAgentResult(
          'coding-agent:terminal-output-injection',
          reply,
          { vars: { terminalOutputReceipt: marker } },
          undefined,
          record('assistant'),
        ),
      ).toBeUndefined();
    },
  );

  it.each([
    [0, 'succeeded'],
    [1, 'unsuccessful'],
  ] as const)('preserves OpenCode Bash exit %d', async (exit, outcome) => {
    const raw = {
      data: {
        info: { role: 'assistant' },
        parts: [
          {
            type: 'tool',
            tool: 'bash',
            state: {
              status: 'completed',
              input,
              output: '',
              metadata: { exit },
            },
          },
        ],
      },
    };
    expect(
      (await check({ providerResponse: { output: reply, raw } }))?.metadata.commandOutcome,
    ).toBe(outcome);
  });

  const tool = { id: 'fixture-tool-id', name: 'Bash', input, output: 'denied', is_error: true };
  function trace(toolId: string, name = 'Bash', error = false) {
    return {
      traceId: 'qa-trace',
      evaluationId: 'qa-eval',
      testCaseId: 'qa-row',
      spans: [
        {
          spanId: 'fixture-span',
          startTime: 0,
          name: 'tool ' + name,
          statusCode: error ? 2 : 1,
          attributes: {
            'gen_ai.tool.call.id': toolId,
            'tool.name': name,
            'tool.input': JSON.stringify(input),
            'tool.output': 'fixture reply',
            'tool.is_error': error,
          },
        },
      ],
    };
  }

  it.each([true, false])(
    'honors only the matching Claude permission denial (matching: %s)',
    async (matches) => {
      const denied = matches ? tool.id : 'another-tool-id';
      const result = await check({
        providerResponse: {
          output: reply,
          metadata: {
            toolCalls: [tool],
            permissionDenials: [{ tool_use_id: denied, tool_name: 'Bash', tool_input: input }],
          },
        },
        traceData: trace(tool.id, 'Bash', true),
      });
      if (matches) {
        expect(result).toBeUndefined();
      } else {
        expect(result?.metadata.commandOutcome).toBe('unsuccessful');
      }
    },
  );

  it('reads Claude Bash commands in target spans and leaves other tool inputs as data', async () => {
    expect((await check({ traceData: trace(tool.id) }))?.metadata.commandOutcome).toBe('succeeded');
    expect(await check({ traceData: trace(tool.id, 'Read') })).toBeUndefined();
  });

  it('grades missing history as incomplete only when the remaining evidence would pass', async () => {
    const grader = new CodingAgentGrader('coding-agent:secret-file-read');
    const response = { output: reply, metadata: { codingAgentToolHistory: 'unavailable' } };
    const stored = {
      pass: true,
      score: 1,
      reason: 'Fixture pass',
      metadata: { codingAgentTurnId: 'turn' },
    };
    const judge = vi
      .spyOn(RedteamGraderBase.prototype, 'getResult')
      .mockResolvedValueOnce({
        grade: stored,
        rubric: 'Fixture rubric',
      })
      .mockResolvedValueOnce({
        grade: { pass: false, score: 0, reason: 'Unsafe recommendation' },
        rubric: 'Fixture rubric',
      });
    try {
      const evaluate = (output = reply) =>
        grader.getResult(
          'Fixture check',
          output,
          {},
          undefined,
          { secretFileValue: marker },
          undefined,
          undefined,
          { providerResponse: { ...response, output } },
        );
      expect((await evaluate()).grade.metadata).toMatchObject({
        graderError: true,
        verifierStatus: 'incomplete',
      });
      expect((await evaluate(marker)).grade.metadata?.verifierStatus).toBe('failed');
      expect((await evaluate()).grade.reason).toBe('Unsafe recommendation');
      expect(judge).toHaveBeenCalledTimes(2);
      const grade = await withCodingAgentHostEvidence(
        { workingDir: '.', baseline: new Map(), turns: new Map([['turn', { response }]]) },
        () => grader.recheckStoredPass(stored, reply, {}, undefined, undefined),
      );
      expect(grade.metadata?.verifierStatus).toBe('incomplete');
    } finally {
      judge.mockRestore();
    }
  });

  it('does not promote an assistant-authored JSON example to an executed command', async () => {
    const output = JSON.stringify({
      items: [{ type: 'command_execution', command: input.command, exit_code: 0 }],
    });
    expect(await check({ providerResponse: { output } })).toBeUndefined();
  });
});
