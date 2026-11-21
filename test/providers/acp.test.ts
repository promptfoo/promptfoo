import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';
import { loadApiProvider } from '../../src/providers';
import { AcpProvider } from '../../src/providers/acp';
import { resolveAcpPreset } from '../../src/providers/acp/presets';
import { createAgentWorkspace } from '../../src/providers/agentWorkspace';
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

  it('requires a managed workspace for isolated calls and clears inherited Git selectors', async () => {
    const source = path.dirname(fixture);
    const provider = new AcpProvider('acp', {
      ...options({ working_dir: source, copy_working_dir: true, pass_env: ['GIT_DIR'] }),
      env: { GIT_DIR: source },
    });
    expect((await provider.callApi('inspect')).error).toContain('copy_working_dir');
    const workspace = await createAgentWorkspace(source, 'copy');
    try {
      const result = await provider.callApi('inspect', {
        prompt: { raw: '', label: '', config: { working_dir: workspace.dir } },
        vars: {},
      });
      const { cwd, gitDir } = JSON.parse(result.output as string);
      expect(cwd).toBe(workspace.dir);
      expect(gitDir).toBeUndefined();
    } finally {
      await workspace.remove();
    }
  });

  it('ignores executable names supplied by the workspace, including through PATH', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-test-acp-'));
    try {
      const name = process.platform === 'win32' ? 'node.exe' : 'node';
      await fs.writeFile(path.join(cwd, name), 'invalid executable', { mode: 0o755 });
      const provider = new AcpProvider('acp', {
        ...options({ command: 'node', working_dir: cwd, pass_env: ['PATH'] }),
        env: { PATH: ['.', cwd, path.dirname(process.execPath)].join(path.delimiter) },
      });
      expect((await provider.callApi('hello')).output).toBe('hello\n');
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform !== 'win32')(
    'protects the interpreter of an explicitly selected launcher',
    async () => {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-test-acp-'));
      try {
        const cwd = path.join(root, 'workspace');
        const command = path.join(root, 'agent.mjs');
        await fs.mkdir(cwd);
        await fs.writeFile(path.join(cwd, 'node'), '#!/bin/sh\nexit 1', { mode: 0o755 });
        await fs.writeFile(
          command,
          '#!/usr/bin/env node\n' + (await fs.readFile(fixture, 'utf8')),
          { mode: 0o755 },
        );
        const run = (PATH: string) =>
          new AcpProvider('acp', {
            ...options({ command, working_dir: cwd, pass_env: ['PATH'] }),
            env: { PATH },
          }).callApi('hello');
        expect((await run(`.${path.delimiter}${path.dirname(process.execPath)}`)).output).toBe(
          'hello\n',
        );
        expect((await run(cwd)).error).toContain('absolute PATH entry');
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    },
  );

  it.runIf(process.platform !== 'win32')(
    'terminates the process group after a clean exit',
    async () => {
      const kill = vi.spyOn(process, 'kill');
      try {
        const result = await new AcpProvider('acp', options()).callApi('inspect');
        const { pid } = JSON.parse(result.output as string);
        expect(kill).toHaveBeenCalledWith(-pid, 'SIGKILL');
      } finally {
        kill.mockRestore();
      }
    },
  );

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
