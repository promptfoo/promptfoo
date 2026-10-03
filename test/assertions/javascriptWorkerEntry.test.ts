import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { JavascriptWorkerRequest } from '../../src/assertions/javascriptWorkerProtocol';

const transport = vi.hoisted(() => ({
  request: undefined as JavascriptWorkerRequest | undefined,
  on: vi.fn(),
  postMessage: vi.fn(),
}));
vi.mock('node:worker_threads', () => ({
  parentPort: { on: transport.on, postMessage: transport.postMessage },
  get workerData() {
    return transport.request;
  },
}));

// Real execution and module loading with only the cross-thread transport replaced.
describe('JavaScript worker entry transport', () => {
  let basePath: string;

  beforeEach(async () => {
    vi.resetModules();
    transport.on.mockReset();
    transport.postMessage.mockReset();
    basePath = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-worker-entry-'));
    await fs.writeFile(path.join(basePath, 'package.json'), '{"type":"module"}');
  });

  afterEach(async () => {
    await fs.rm(basePath, { recursive: true, force: true });
  });

  async function start(value: string, withProvider = false) {
    transport.request = {
      value,
      functionBody: `return ${value}`,
      output: 'fixture',
      context: {
        prompt: 'fixture',
        vars: { expected: 'fixture' },
        test: {},
        logProbs: undefined,
        providerResponse: { output: 'fixture' },
        provider: withProvider ? { id: 'echo', label: 'Fixture', config: {} } : undefined,
      },
      basePath,
    };
    await import('../../src/assertions/javascriptWorkerEntry');
  }

  async function expectMessage(message: unknown) {
    await vi.waitFor(() => expect(transport.postMessage).toHaveBeenCalledWith(message));
  }

  function reply(message: unknown) {
    const listener = transport.on.mock.calls.find(([event]) => event === 'message')?.[1];
    expect(listener).toBeTypeOf('function');
    listener(message);
  }

  it('returns a plain result from an inline expression', async () => {
    await start('({ pass: output === context.vars.expected, score: 1 })');
    await expectMessage({ type: 'result', result: { pass: true, score: 1 } });
  });

  it('loads a named file assertion from the configuration directory', async () => {
    await fs.writeFile(
      path.join(basePath, 'check.mjs'),
      'export const check = output => output === "fixture";',
    );
    await start('file://check.mjs:check');
    await expectMessage({ type: 'result', result: true });
  });

  it.each([
    ['(output) => output === "fixture"', true],
    ['42', false],
  ])('loads package exports and rejects non-functions', async (exported, callable) => {
    const packagePath = path.join(basePath, 'node_modules', 'fixture-assertion');
    await fs.mkdir(packagePath, { recursive: true });
    await fs.writeFile(
      path.join(packagePath, 'package.json'),
      '{"name":"fixture-assertion","main":"index.cjs"}',
    );
    await fs.writeFile(path.join(packagePath, 'index.cjs'), `exports.check = ${exported};`);
    await start('package:fixture-assertion:check');
    await expectMessage(
      callable
        ? { type: 'result', result: true }
        : {
            type: 'error',
            message: 'Package JavaScript assertion must export a function',
          },
    );
  });

  it('reports an uncopyable result instead of leaving the parent waiting', async () => {
    await start('({ callback: () => true })');
    await expectMessage({
      type: 'error',
      message: expect.stringContaining('functions and symbols'),
    });
  });

  it.each([true, false])(
    'settles provider callbacks for success=%s and ignores late replies',
    async (ok) => {
      await start(
        'context.provider.callApi(context.provider.id(), { vars: context.vars }, { includeLogProbs: true })',
        true,
      );
      await expectMessage({
        type: 'callApi',
        callId: 1,
        args: ['echo', { vars: { expected: 'fixture' } }, { includeLogProbs: true }],
      });
      const message = ok
        ? { callId: 1, ok: true, result: { output: 'reply' } }
        : { callId: 1, ok: false, message: 'Provider unavailable' };
      reply(message);
      await expectMessage(
        ok
          ? { type: 'result', result: { output: 'reply' } }
          : { type: 'error', message: 'Provider unavailable' },
      );
      const sent = transport.postMessage.mock.calls.length;
      reply(message);
      expect(transport.postMessage).toHaveBeenCalledTimes(sent);
    },
  );

  it('reports a transport failure while sending a provider call', async () => {
    transport.postMessage.mockImplementationOnce(() => {
      throw new Error('Port closed');
    });
    await start("context.provider.callApi('fixture')", true);
    await expectMessage({ type: 'error', message: 'Port closed' });
  });

  it('bounds pending provider callbacks before sending another request', async () => {
    await start(
      "Promise.all(Array.from({ length: 9 }, () => context.provider.callApi('fixture')))",
      true,
    );
    await expectMessage({
      type: 'error',
      message: 'Worker assertions support at most eight pending provider calls',
    });
    expect(
      transport.postMessage.mock.calls.filter(([message]) => message.type === 'callApi'),
    ).toHaveLength(8);
  });
});
