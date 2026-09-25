import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchesAgentRubric } from '../../src/matchers/agent';
import * as codexDefaults from '../../src/providers/openai/codexDefaults';

import type { ApiProvider, CallApiContextParams } from '../../src/types/index';

describe('agent-rubric copied workspace', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('passes each target copy to a shared grader without mutating its config', async () => {
    const seen: string[] = [];
    const grader: ApiProvider = {
      id: () => 'openai:codex-sdk',
      config: {},
      callApi: vi.fn(async (_prompt, context) => {
        seen.push(context?.prompt?.config?.working_dir as string);
        return { output: '{"pass":true,"score":1,"reason":"file found"}' };
      }),
    };
    const targetPaths = ['/tmp/first-target-copy', '/tmp/second-target-copy'];
    const results = await Promise.all(
      targetPaths.map((targetPath) =>
        matchesAgentRubric(
          'Inspect the target working directory',
          'done',
          { provider: grader },
          {},
          undefined,
          { vars: {}, prompt: { raw: 'target', label: 'target' } } as CallApiContextParams,
          targetPath,
        ),
      ),
    );
    expect(results.every((result) => result.pass)).toBe(true);
    expect(seen.sort()).toEqual(targetPaths);
    expect(grader.config).toEqual({});
  });

  it('uses the target copy for the implicit Codex grader despite its default workspace', async () => {
    const grader: ApiProvider = {
      id: () => 'openai:codex-sdk',
      config: { working_dir: '/tmp/implicit-default' },
      callApi: vi.fn(async (_prompt, context) => {
        expect(context?.prompt.config?.working_dir).toBe('/tmp/target-copy');
        return { output: '{"pass":true,"score":1}' };
      }),
    };
    vi.spyOn(codexDefaults, 'getCodexDefaultProviders').mockReturnValue({
      llmRubricProvider: grader,
    } as ReturnType<typeof codexDefaults.getCodexDefaultProviders>);
    const result = await matchesAgentRubric(
      'Inspect files',
      'done',
      {},
      {},
      undefined,
      undefined,
      '/tmp/target-copy',
    );
    expect(result.pass).toBe(true);
    expect(grader.config?.working_dir).toBe('/tmp/implicit-default');
  });

  it('respects an explicitly configured grader working_dir', async () => {
    const grader: ApiProvider = {
      id: () => 'openai:codex-sdk',
      config: { working_dir: '/tmp/independent-grader' },
      callApi: vi.fn(async (_prompt, context) => {
        expect(context?.prompt?.config?.working_dir).toBeUndefined();
        return { output: '{"pass":true,"score":1}' };
      }),
    };
    const result = await matchesAgentRubric(
      'Inspect files',
      'done',
      { provider: grader },
      {},
      undefined,
      undefined,
      '/tmp/target-copy',
    );
    expect(result.pass).toBe(true);
    expect(grader.config?.working_dir).toBe('/tmp/independent-grader');
  });
});
