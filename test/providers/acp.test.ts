import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { loadApiProvider } from '../../src/providers';
import { AcpProvider } from '../../src/providers/acp';
import { resolveAcpPreset } from '../../src/providers/acp/presets';
import { providerRegistry } from '../../src/providers/providerRegistry';

const fixture = path.resolve(import.meta.dirname, '../fixtures/acp/agent.mjs');

function options(config = {}) {
  return { config: { command: process.execPath, args: [fixture], ...config } };
}

describe('Agent Client Protocol', () => {
  it.each([
    ['copilot', 'copilot', ['--acp', '--stdio']],
    ['antigravity', 'agy', ['acp']],
    ['cursor', 'agent', ['acp']],
    ['hermes', 'hermes', ['acp']],
    ['deepseek', 'dsh', ['--profile', 'acp']],
  ] as const)('loads the %s preset', async (name, command, args) => {
    const id = `acp:${name}`;
    expect(resolveAcpPreset(id)).toMatchObject({ command, args });
    const agent = await loadApiProvider(id);
    expect(agent.id()).toBe(id);
  });

  it('collects only assistant text from the active session and rejects permission requests', async () => {
    const provider = await loadApiProvider('acp', { options: options() });
    const prompt = 'Summarize this:\n--model example';
    expect(await provider.callApi(prompt)).toMatchObject({
      output: prompt + '\n',
      metadata: { acp: { stopReason: 'end_turn', toolCalls: 1, permissionRequests: 1 } },
    });
  });

  it('isolates concurrent sessions and workspaces and forwards only the preset credentials', async () => {
    const provider = new AcpProvider('acp:cursor', {
      ...options({ model: 'one', mode: 'ask', auth_method: 'cursor_login' }),
      env: { CURSOR_API_KEY: 'fixture', OPENAI_API_KEY: 'unrelated' },
    });
    const results = await Promise.all([provider.callApi('inspect'), provider.callApi('inspect')]);
    const [one, two] = results.map((result) => JSON.parse(result.output as string));
    expect(one).toMatchObject({
      args: [],
      model: 'one',
      mode: 'ask',
      authMethod: 'cursor_login',
      cursorKeyPresent: true,
      unrelatedKeyPresent: false,
    });
    expect(one.cwd).not.toEqual(two.cwd);
    expect(results[0].metadata?.acp.sessionId).not.toEqual(results[1].metadata?.acp.sessionId);
    for (const { cwd } of [one, two]) {
      await expect(fs.access(cwd)).rejects.toMatchObject({ code: 'ENOENT' });
    }
  });

  it('supports a config-relative working directory without letting row options change the process', async () => {
    const provider = new AcpProvider('acp', {
      ...options({ basePath: import.meta.dirname, pass_env: ['OPENAI_API_KEY'] }),
      env: { OPENAI_API_KEY: 'fixture' },
    });
    const result = await provider.callApi('inspect', {
      vars: { workspace: '../fixtures/acp' },
      prompt: {
        raw: 'inspect',
        label: 'fixture',
        config: {
          working_dir: '{{workspace}}',
          mode: 'ask',
          command: 'untrusted-row-command',
          args: ['ignored'],
        },
      },
    });
    expect(JSON.parse(result.output as string)).toMatchObject({
      cwd: await fs.realpath(path.dirname(fixture)),
      mode: 'ask',
      args: [],
      unrelatedKeyPresent: true,
    });
  });

  it.each([
    ['fail', 'Example agent error'],
    ['signed-out', 'Sign in with the agent CLI'],
    ['exit', 'connection closed'],
    ['empty', 'no assistant text'],
    ['cancelled', 'cancelled'],
  ])('surfaces %s as a provider error', async (prompt, expected) => {
    const result = await new AcpProvider('acp', options()).callApi(prompt);
    expect(result.error).toContain(expected);
    expect(result.output).toBeUndefined();
  });

  it('terminates an unresponsive subprocess on deadline', async () => {
    const result = await new AcpProvider('acp', options({ timeout_ms: 250 })).callApi('hang');
    expect(result.error).toContain('timed out');
  });

  it('honors caller cancellation', async () => {
    const controller = new AbortController();
    const result = new AcpProvider('acp', options()).callApi('hang', undefined, {
      abortSignal: controller.signal,
    });
    controller.abort(new Error('eval stopped'));
    await expect(result).rejects.toThrow('eval stopped');
  });

  it('closes active agent processes on registry shutdown', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-test-acp-'));
    try {
      const provider = new AcpProvider('acp', options({ working_dir: cwd }));
      const result = provider.callApi('wait-for-shutdown');
      await expect
        .poll(() => fs.readFile(path.join(cwd, 'ready'), 'utf8').catch(() => ''))
        .toBeTruthy();
      await providerRegistry.shutdownAll();
      expect((await result).error).toMatch(/aborted|connection closed/i);
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('reports missing commands and rejects unknown presets', async () => {
    expect(() => new AcpProvider('acp')).toThrow('requires config.command');
    expect(() => new AcpProvider('acp:constructor')).toThrow('Unknown ACP preset');
    const result = await new AcpProvider('acp', {
      config: { command: 'nonexistent-promptfoo-acp-executable' },
    }).callApi('hello');
    expect(result.error).toContain('Could not start');
  });
});
