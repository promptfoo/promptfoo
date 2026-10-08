import { describe, expect, it } from 'vitest';
import { resolveContext } from '../../src/assertions/contextUtils';
import { runEval } from '../../src/evaluator';
import { type ApiProvider, ResultFailureReason } from '../../src/types/index';

// These tests intentionally use the real transform helper rather than evaluator/setup.
describe('null output through real transforms and assertions', () => {
  describe.each(['provider', 'test', 'assertion'] as const)('%s transform', (level) => {
    it.each([true, false])('validates the extracted output with present=%s', async (present) => {
      const expression = present ? 'JSON.parse(output).value' : 'JSON.parse(output).missing';
      const provider: ApiProvider = {
        id: () => 'json-fixture',
        callApi: async () => ({ output: '{"value":null}' }),
        ...(level === 'provider' ? { transform: expression } : {}),
      };
      const [result] = await runEval({
        provider,
        prompt: { raw: 'Return JSON', label: 'test' },
        test: {
          ...(level === 'test' ? { options: { transform: expression } } : {}),
          assert: [
            {
              type: 'javascript',
              value: 'output === null',
              ...(level === 'assertion' ? { transform: expression } : {}),
            },
          ],
        },
        delay: 0,
        testIdx: 0,
        promptIdx: 0,
        repeatIndex: 0,
        isRedteam: true,
      });

      expect(result.success).toBe(present);
      if (present) {
        expect(result.error).toBeUndefined();
        expect(result.response?.output).toBe(level === 'assertion' ? '{"value":null}' : null);
      } else {
        expect(result.failureReason).toBe(ResultFailureReason.ERROR);
        expect(result.error).toContain('Transform function did not return a value');
      }
    });
  });

  it.each(['is-refusal', 'not-is-refusal', 'is-valid-openai-tools-call'] as const)(
    'evaluates %s against null data without treating it as an integration error',
    async (type) => {
      const [result] = await runEval({
        provider: { id: () => 'null-fixture', callApi: async () => ({ output: null }) },
        prompt: { raw: 'Return JSON', label: 'test' },
        test: { assert: [{ type }] },
        delay: 0,
        testIdx: 0,
        promptIdx: 0,
        repeatIndex: 0,
        isRedteam: true,
      });

      const pass = type === 'not-is-refusal';
      expect(result.success).toBe(pass);
      expect(result.failureReason).toBe(
        pass ? ResultFailureReason.NONE : ResultFailureReason.ASSERT,
      );
      expect(result.response).toHaveProperty('output', null);
    },
  );

  it('extracts context from the provider-normalized null before the test transform', async () => {
    await expect(
      resolveContext(
        {
          type: 'context-recall',
          contextTransform: 'output === null ? "original context" : "wrong source"',
        },
        {},
        'post-test output',
        undefined,
        undefined,
        { output: 'post-test output', providerTransformedOutput: null },
      ),
    ).resolves.toBe('original context');
  });

  it('still rejects null context-transform results', async () => {
    await expect(
      resolveContext({ type: 'context-recall', contextTransform: 'null' }, {}, 'output'),
    ).rejects.toThrow('contextTransform must return a string or array of strings');
  });
});
