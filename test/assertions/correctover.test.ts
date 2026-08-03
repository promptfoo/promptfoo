import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleCorrectover } from '../../src/assertions/correctover';

import type { AssertionParams } from '../../src/types/index';

vi.mock('child_process', () => {
  return {
    spawn: vi.fn(),
    execFile: vi.fn(),
    exec: vi.fn(),
    execFileSync: vi.fn(),
  };
});

vi.mock('../../src/logger', () => ({
  default: { warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { spawn } = await import('child_process');
const mockSpawn = spawn as ReturnType<typeof vi.fn>;

function createMockChild(opts: {
  stdoutChunks?: string[];
  stderrChunks?: string[];
  exitCode?: number | null;
  errorEvent?: { code?: string; message?: string } | null;
}) {
  const EventEmitter = require('events');
  const child = new EventEmitter();
  child.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();

  setImmediate(() => {
    if (opts.errorEvent) {
      const err = new Error(opts.errorEvent.message || 'spawn error');
      (err as Error & { code?: string }).code = opts.errorEvent.code;
      child.emit('error', err);
    } else {
      for (const chunk of opts.stdoutChunks || []) {
        child.stdout.emit('data', Buffer.from(chunk));
      }
      for (const chunk of opts.stderrChunks || []) {
        child.stderr.emit('data', Buffer.from(chunk));
      }
      child.emit('close', opts.exitCode ?? 0);
    }
  });

  return child;
}

function makeParams(overrides: Partial<AssertionParams> = {}): AssertionParams {
  return {
    assertion: { type: 'correctover' as any, value: '' },
    inverse: false,
    output: '',
    outputString: '',
    providerResponse: { output: '' },
    ...overrides,
  } as AssertionParams;
}

describe('handleCorrectover', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('basic scanning', () => {
    it('should pass when CCS reports no findings', async () => {
      mockSpawn.mockImplementation(() => createMockChild({ stdoutChunks: ['[]'], exitCode: 0 }));

      const result = await handleCorrectover(
        makeParams({
          providerResponse: { output: 'safe output' } as any,
          output: 'safe output',
        }),
      );
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should fail when CCS reports findings', async () => {
      const findings = JSON.stringify([{ rule: 'RCE', detail: 'Detected subprocess call' }]);
      mockSpawn.mockImplementation(() =>
        createMockChild({ stdoutChunks: [findings], exitCode: 0 }),
      );

      const result = await handleCorrectover(
        makeParams({
          providerResponse: { output: 'os.system("rm -rf /")' } as any,
          output: 'os.system("rm -rf /")',
        }),
      );
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toContain('RCE');
    });

    it('should pass rules path as argument (not shell-interpolated)', async () => {
      mockSpawn.mockImplementation(() => createMockChild({ stdoutChunks: ['[]'], exitCode: 0 }));

      await handleCorrectover(
        makeParams({
          assertion: { type: 'correctover' as any, value: '/path/to/rules.yaml' },
          providerResponse: { output: 'test' } as any,
        }),
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        'ccs',
        expect.arrayContaining(['--rules', '/path/to/rules.yaml']),
        expect.any(Object),
      );
    });

    it('should use renderedValue over raw value for rules path', async () => {
      mockSpawn.mockImplementation(() => createMockChild({ stdoutChunks: ['[]'], exitCode: 0 }));

      await handleCorrectover(
        makeParams({
          assertion: {
            type: 'correctover' as any,
            value: '{{rulesFile}}',
          } as any,
          renderedValue: '/resolved/path/rules.yaml',
          providerResponse: { output: 'test' } as any,
        }),
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        'ccs',
        expect.arrayContaining(['--rules', '/resolved/path/rules.yaml']),
        expect.any(Object),
      );
    });
  });

  describe('tool-call metadata scanning', () => {
    it('should scan metadata.toolCalls from agent providers (OpenAI format)', async () => {
      const findings = JSON.stringify([{ rule: 'SSRF', detail: 'Internal IP detected' }]);
      mockSpawn.mockImplementation(() =>
        createMockChild({ stdoutChunks: [findings], exitCode: 0 }),
      );

      const result = await handleCorrectover(
        makeParams({
          providerResponse: {
            output: 'Done',
            metadata: {
              toolCalls: [
                {
                  function: {
                    name: 'http_request',
                    arguments: JSON.stringify({ url: 'http://169.254.169.254' }),
                  },
                },
              ],
            },
          } as any,
        }),
      );
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('SSRF');
    });

    it('should scan metadata.tool_calls (n8n snake_case format)', async () => {
      const findings = JSON.stringify([
        { rule: 'CMD_INJECTION', detail: 'Shell injection detected' },
      ]);
      mockSpawn.mockImplementation(() =>
        createMockChild({ stdoutChunks: [findings], exitCode: 0 }),
      );

      const result = await handleCorrectover(
        makeParams({
          providerResponse: {
            output: 'Done',
            metadata: {
              tool_calls: [{ name: 'execute', arguments: { cmd: 'rm -rf /' } }],
            },
          } as any,
        }),
      );
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('CMD_INJECTION');
    });

    it('should scan metadata.actions array', async () => {
      const findings = JSON.stringify([{ rule: 'RCE', detail: 'Dangerous action' }]);
      mockSpawn.mockImplementation(() =>
        createMockChild({ stdoutChunks: [findings], exitCode: 0 }),
      );

      const result = await handleCorrectover(
        makeParams({
          providerResponse: {
            output: 'Done',
            metadata: {
              actions: [{ tool: 'shell', command: 'rm -rf /' }],
            },
          } as any,
        }),
      );
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('RCE');
    });

    it('should scan MCP direct metadata fields (toolArgs)', async () => {
      const findings = JSON.stringify([{ rule: 'SSRF', detail: 'Internal IP detected' }]);
      mockSpawn.mockImplementation(() =>
        createMockChild({ stdoutChunks: [findings], exitCode: 0 }),
      );

      const result = await handleCorrectover(
        makeParams({
          providerResponse: {
            output: 'Done',
            metadata: {
              toolName: 'http_request',
              toolArgs: { url: 'http://169.254.169.254' },
            },
          } as any,
        }),
      );
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('SSRF');
    });
  });

  describe('post-transform output scanning', () => {
    it('should scan transformed output when different from raw', async () => {
      const findings = JSON.stringify([
        { rule: 'PATH_TRAVERSAL', detail: 'Dot-dot-slash detected' },
      ]);
      // Use mockImplementation to create a fresh child for each spawn call
      let callCount = 0;
      mockSpawn.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: raw output 'encoded_data' -> clean
          return createMockChild({ stdoutChunks: ['[]'], exitCode: 0 });
        }
        // Second call: transformed '../../../etc/passwd' -> findings
        return createMockChild({ stdoutChunks: [findings], exitCode: 0 });
      });

      const result = await handleCorrectover(
        makeParams({
          providerResponse: { output: 'encoded_data' } as any,
          output: '../../../etc/passwd',
        }),
      );
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('PATH_TRAVERSAL');
    });

    it('should not double-scan when transformed equals raw', async () => {
      mockSpawn.mockImplementation(() => createMockChild({ stdoutChunks: ['[]'], exitCode: 0 }));

      await handleCorrectover(
        makeParams({
          providerResponse: { output: 'same' } as any,
          output: 'same',
        }),
      );
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should fail (not pass) when CCS CLI is not found', async () => {
      mockSpawn.mockImplementation(() =>
        createMockChild({ errorEvent: { code: 'ENOENT', message: 'spawn ccs ENOENT' } }),
      );

      const result = await handleCorrectover(
        makeParams({
          providerResponse: { output: 'test' } as any,
        }),
      );
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should fail when CCS scanner produces empty output', async () => {
      mockSpawn.mockImplementation(() => createMockChild({ stdoutChunks: [''], exitCode: 1 }));

      const result = await handleCorrectover(
        makeParams({
          providerResponse: { output: 'test' } as any,
        }),
      );
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('could not complete');
    });

    it('should fail when CCS returns non-JSON output', async () => {
      mockSpawn.mockImplementation(() =>
        createMockChild({ stdoutChunks: ['not valid json at all'], exitCode: 0 }),
      );

      const result = await handleCorrectover(
        makeParams({
          providerResponse: { output: 'test' } as any,
        }),
      );
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('could not complete');
    });

    it('should fail when CCS scanner times out', async () => {
      const EventEmitter = require('events');
      const child = new EventEmitter();
      child.stdin = { write: vi.fn(), end: vi.fn() };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = vi.fn(() => {
        child.emit('close', null);
      });
      mockSpawn.mockReturnValue(child);

      vi.useFakeTimers();
      const promise = handleCorrectover(
        makeParams({ providerResponse: { output: 'test' } as any }),
      );
      vi.advanceTimersByTime(31_000);
      const result = await promise;
      vi.useRealTimers();

      expect(result.pass).toBe(false);
      expect(result.reason).toContain('could not complete');
    });
  });

  describe('inverse (not-correctover) mode', () => {
    it('should pass when inverse=true and findings exist', async () => {
      const findings = JSON.stringify([{ rule: 'RCE', detail: 'dangerous' }]);
      mockSpawn.mockImplementation(() =>
        createMockChild({ stdoutChunks: [findings], exitCode: 0 }),
      );

      const result = await handleCorrectover(
        makeParams({
          inverse: true,
          providerResponse: { output: 'malicious code' } as any,
        }),
      );
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should fail when inverse=true and no findings', async () => {
      mockSpawn.mockImplementation(() => createMockChild({ stdoutChunks: ['[]'], exitCode: 0 }));

      const result = await handleCorrectover(
        makeParams({
          inverse: true,
          providerResponse: { output: 'safe output' } as any,
        }),
      );
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toContain('Expected CCS violations');
    });

    it('should fail when inverse=true and CLI not found', async () => {
      mockSpawn.mockImplementation(() =>
        createMockChild({ errorEvent: { code: 'ENOENT', message: 'spawn ccs ENOENT' } }),
      );

      const result = await handleCorrectover(
        makeParams({
          inverse: true,
          providerResponse: { output: 'test' } as any,
        }),
      );
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
    });
  });

  describe('redaction', () => {
    it('should redact GitHub PATs (ghp_ prefix)', async () => {
      const findings = JSON.stringify([
        { rule: 'CREDENTIAL_LEAK', detail: 'Found key ghp_abc123def456ghi789jkl0 in tool input' },
      ]);
      mockSpawn.mockImplementation(() =>
        createMockChild({ stdoutChunks: [findings], exitCode: 0 }),
      );

      const result = await handleCorrectover(
        makeParams({ providerResponse: { output: 'test' } as any }),
      );
      expect(result.reason).not.toContain('ghp_abc123');
      expect(result.reason).toContain('<REDACTED>');
    });

    it('should redact sk- prefixed tokens', async () => {
      const findings = JSON.stringify([
        { rule: 'CREDENTIAL_LEAK', detail: 'Found sk-abc123def456ghi789jkl0mnop in output' },
      ]);
      mockSpawn.mockImplementation(() =>
        createMockChild({ stdoutChunks: [findings], exitCode: 0 }),
      );

      const result = await handleCorrectover(
        makeParams({ providerResponse: { output: 'test' } as any }),
      );
      expect(result.reason).not.toContain('sk-abc123');
      expect(result.reason).toContain('<REDACTED>');
    });

    it('should redact password= patterns', async () => {
      const findings = JSON.stringify([
        { rule: 'CREDENTIAL_LEAK', detail: 'Found password=supersecret123 in config' },
      ]);
      mockSpawn.mockImplementation(() =>
        createMockChild({ stdoutChunks: [findings], exitCode: 0 }),
      );

      const result = await handleCorrectover(
        makeParams({ providerResponse: { output: 'test' } as any }),
      );
      expect(result.reason).not.toContain('supersecret123');
    });

    it('should redact AWS access key IDs', async () => {
      const findings = JSON.stringify([
        { rule: 'CREDENTIAL_LEAK', detail: 'Found AWS key AKIAIOSFODNN7EXAMPLE in output' },
      ]);
      mockSpawn.mockImplementation(() =>
        createMockChild({ stdoutChunks: [findings], exitCode: 0 }),
      );

      const result = await handleCorrectover(
        makeParams({ providerResponse: { output: 'test' } as any }),
      );
      expect(result.reason).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(result.reason).toContain('<REDACTED>');
    });
  });

  describe('stdin piping', () => {
    it('should write payload to child process stdin', async () => {
      mockSpawn.mockImplementation(() => createMockChild({ stdoutChunks: ['[]'], exitCode: 0 }));

      await handleCorrectover(makeParams({ providerResponse: { output: 'test payload' } as any }));

      expect(mockSpawn).toHaveBeenCalledWith(
        'ccs',
        expect.arrayContaining(['--input', '-']),
        expect.objectContaining({ stdio: ['pipe', 'pipe', 'pipe'] }),
      );
      const child = mockSpawn.mock.results[0].value;
      expect(child.stdin.write).toHaveBeenCalledWith('test payload');
      expect(child.stdin.end).toHaveBeenCalled();
    });
  });

  describe('additional branch coverage', () => {
    it('should fail when CCS scanner error is not ENOENT', async () => {
      mockSpawn.mockImplementation(() =>
        createMockChild({ errorEvent: { code: 'EACCES', message: 'Permission denied' } }),
      );

      const result = await handleCorrectover(
        makeParams({ providerResponse: { output: 'test' } as any }),
      );
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('CCS scanner failed to start');
    });

    it('should resolve null when stderr contains command not found', async () => {
      mockSpawn.mockImplementation(() =>
        createMockChild({ stdoutChunks: [''], stderrChunks: ['ccs: command not found'], exitCode: 127 }),
      );

      const result = await handleCorrectover(
        makeParams({ providerResponse: { output: 'test' } as any }),
      );
      // resolve(null) -> handler returns CCS_CLI_NOT_FOUND -> pass: false
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should return no-output message when provider has no output and no metadata', async () => {
      mockSpawn.mockImplementation(() =>
        createMockChild({ stdoutChunks: ['[]'], exitCode: 0 }),
      );

      const result = await handleCorrectover(
        makeParams({ providerResponse: {} as any }),
      );
      expect(result.pass).toBe(true);
      expect(result.reason).toContain('No output to scan');
    });

    it('should use assertion.value as rulesPath when renderedValue is empty', async () => {
      const rulesFile = '/tmp/rules-from-value.yaml';

      mockSpawn.mockImplementation(() =>
        createMockChild({ stdoutChunks: [JSON.stringify([])], exitCode: 0 }),
      );

      await handleCorrectover(
        makeParams({
          providerResponse: { output: 'test' } as any,
          assertion: { type: 'correctover', value: rulesFile } as any,
        }),
      );

      expect(mockSpawn).toHaveBeenCalledWith(
        'ccs',
        expect.arrayContaining(['--rules', rulesFile]),
        expect.any(Object),
      );
    });

    it('should handle metadata extraction error gracefully', async () => {
      const badMeta: any = {};
      Object.defineProperty(badMeta, 'toolCalls', {
        get() { throw new Error('bad getter'); },
      });
      mockSpawn.mockImplementation(() =>
        createMockChild({ stdoutChunks: ['[]'], exitCode: 0 }),
      );

      const result = await handleCorrectover(
        makeParams({
          providerResponse: { output: 'test', metadata: badMeta } as any,
        }),
      );
      // Should not throw, just continue with empty tool call payloads
      expect(result.pass).toBe(true);
    });

    it('should handle non-object metadata gracefully', async () => {
      mockSpawn.mockImplementation(() =>
        createMockChild({ stdoutChunks: ['[]'], exitCode: 0 }),
      );

      const result = await handleCorrectover(
        makeParams({
          providerResponse: { output: 'test', metadata: 'not-an-object' } as any,
        }),
      );
      expect(result.pass).toBe(true);
    });
  });
});
