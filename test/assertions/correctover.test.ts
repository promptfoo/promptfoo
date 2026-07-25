import { handleCorrectover } from './correctover';
import type { AssertionParams } from '../types/index';

// Mock child_process
jest.mock('child_process', () => ({
  execFile: jest.fn(),
}));

jest.mock('util', () => ({
  promisify: (fn: any) => fn,
}));

jest.mock('../logger', () => ({
  default: { warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const { execFile } = require('child_process');
const mockExecFile = execFile as jest.MockedFunction<typeof execFile>;

function makeParams(overrides: Partial<AssertionParams> = {}): AssertionParams {
  return {
    assertion: { type: 'correctover' as any, value: '' },
    inverse: false,
    providerResponse: { output: '' },
    ...overrides,
  } as AssertionParams;
}

describe('handleCorrectover', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('basic scanning', () => {
    it('should pass when CCS reports no findings', async () => {
      mockExecFile.mockImplementation(((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, { stdout: '[]', stderr: '' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        providerResponse: { output: 'safe output' } as any,
      }));
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should fail when CCS reports findings', async () => {
      const findings = JSON.stringify([
        { rule: 'RCE', detail: 'Detected subprocess call' },
      ]);
      mockExecFile.mockImplementation(((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, { stdout: findings, stderr: '' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        providerResponse: { output: 'os.system("rm -rf /")' } as any,
      }));
      expect(result.pass).toBe(false);
      expect(result.score).toBe(0);
      expect(result.reason).toContain('RCE');
    });
  });

  describe('tool-call metadata scanning', () => {
    it('should scan metadata.toolCalls from agent providers', async () => {
      const findings = JSON.stringify([
        { rule: 'SSRF', detail: 'Internal IP detected' },
      ]);
      mockExecFile.mockImplementation(((_cmd: any, args: any, _opts: any, cb: any) => {
        // Verify the input includes tool call data
        const input = typeof _opts === 'object' ? _opts.input : '';
        expect(input).toContain('toolCalls');
        cb(null, { stdout: findings, stderr: '' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        providerResponse: {
          output: 'Done',
          metadata: {
            toolCalls: [{ name: 'http_request', args: { url: 'http://169.254.169.254' } }],
          },
        } as any,
      }));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('SSRF');
    });
  });

  describe('error handling', () => {
    it('should fail (not pass) when CCS CLI is not found', async () => {
      mockExecFile.mockImplementation(((_cmd: any, _args: any, _opts: any, cb: any) => {
        const err: any = new Error('spawn ccs ENOENT');
        err.code = 'ENOENT';
        err.stderr = 'command not found';
        cb(err, { stdout: '', stderr: 'command not found' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        providerResponse: { output: 'test' } as any,
      }));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('not found');
    });

    it('should fail (not pass) when CCS scanner crashes', async () => {
      mockExecFile.mockImplementation(((_cmd: any, _args: any, _opts: any, cb: any) => {
        const err: any = new Error('segfault');
        err.code = 139;
        err.stderr = 'Segmentation fault';
        cb(err, { stdout: '', stderr: 'Segmentation fault' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        providerResponse: { output: 'test' } as any,
      }));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('could not complete');
    });

    it('should fail when CCS scanner times out', async () => {
      mockExecFile.mockImplementation(((_cmd: any, _args: any, _opts: any, cb: any) => {
        const err: any = new Error('timeout');
        err.killed = true;
        err.stderr = '';
        cb(err, { stdout: '', stderr: '' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        providerResponse: { output: 'test' } as any,
      }));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('timed out');
    });
  });

  describe('inverse (not-correctover) mode', () => {
    it('should pass when inverse=true and findings exist', async () => {
      const findings = JSON.stringify([{ rule: 'RCE', detail: 'dangerous' }]);
      mockExecFile.mockImplementation(((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, { stdout: findings, stderr: '' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        inverse: true,
        providerResponse: { output: 'malicious code' } as any,
      }));
      expect(result.pass).toBe(true);
    });

    it('should fail when inverse=true and no findings', async () => {
      mockExecFile.mockImplementation(((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, { stdout: '[]', stderr: '' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        inverse: true,
        providerResponse: { output: 'safe output' } as any,
      }));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Expected CCS to find issues');
    });
  });

  describe('redaction', () => {
    it('should redact credential-like patterns in findings', async () => {
      const findings = JSON.stringify([{
        rule: 'CREDENTIAL_LEAK',
        detail: 'Found key ghp_abc123def456 in tool input',
      }]);
      mockExecFile.mockImplementation(((_cmd: any, _args: any, _opts: any, cb: any) => {
        cb(null, { stdout: findings, stderr: '' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        providerResponse: { output: 'test' } as any,
      }));
      expect(result.reason).not.toContain('ghp_abc123def456');
      expect(result.reason).toContain('[REDACTED]');
    });
  });

  describe('rules configuration', () => {
    it('should pass rules file path to CCS CLI', async () => {
      mockExecFile.mockImplementation(((_cmd: any, args: any, _opts: any, cb: any) => {
        expect(args).toContain('--rules');
        expect(args).toContain('/path/to/rules.yaml');
        cb(null, { stdout: '[]', stderr: '' });
      }) as any);

      await handleCorrectover(makeParams({
        assertion: { type: 'correctover' as any, value: '/path/to/rules.yaml' },
        providerResponse: { output: 'test' } as any,
      }));
    });
  });
});
