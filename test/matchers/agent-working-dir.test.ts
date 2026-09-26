import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { matchesAgentRubric } from '../../src/matchers/agent';
import * as codexDefaults from '../../src/providers/openai/codexDefaults';
import {
  copyWorkingDirectory,
  releaseWorkingDirectoryCopies,
} from '../../src/providers/workingDirectoryCopies';

import type { ApiProvider, CallApiContextParams } from '../../src/types/index';

const owner = 'agent-working-dir-test';

describe('agent-rubric copied workspace', () => {
  let fixtureDir: string;

  // Grading uses a target workspace only when this process created it as a copy.
  const createCopy = async () => {
    const copy = await copyWorkingDirectory(fixtureDir, owner);
    await copy.settle(true);
    return copy.workingDir;
  };

  beforeEach(async () => {
    fixtureDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-agent-working-dir-test-'));
    await fs.writeFile(path.join(fixtureDir, 'README.md'), 'fixture');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    await releaseWorkingDirectoryCopies(owner);
    await fs.rm(fixtureDir, { recursive: true, force: true });
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
    const targetPaths = [await createCopy(), await createCopy()];
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
    expect(seen.sort()).toEqual([...targetPaths].sort());
    expect(grader.config).toEqual({});
  });

  it('uses the target copy for the implicit Codex grader despite its default workspace', async () => {
    const targetPath = await createCopy();
    const grader: ApiProvider = {
      id: () => 'openai:codex-sdk',
      config: { working_dir: '/tmp/implicit-default' },
      callApi: vi.fn(async (_prompt, context) => {
        expect(context?.prompt.config?.working_dir).toBe(targetPath);
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
      targetPath,
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
      await createCopy(),
    );
    expect(result.pass).toBe(true);
    expect(grader.config?.working_dir).toBe('/tmp/independent-grader');
  });

  it('ignores a target working directory that is not a live copy', async () => {
    const releasedCopy = await createCopy();
    await releaseWorkingDirectoryCopies(owner);
    const seen: unknown[] = [];
    const grader: ApiProvider = {
      id: () => 'openai:codex-sdk',
      config: {},
      callApi: vi.fn(async (_prompt, context) => {
        seen.push(context?.prompt?.config?.working_dir);
        return { output: '{"pass":true,"score":1}' };
      }),
    };

    // The path comes from the target's response metadata, which the target controls.
    for (const targetPath of ['/etc', fixtureDir, releasedCopy]) {
      await matchesAgentRubric(
        'Inspect files',
        'done',
        { provider: grader },
        {},
        undefined,
        undefined,
        targetPath,
      );
    }
    expect(seen).toEqual([undefined, undefined, undefined]);
  });
});
