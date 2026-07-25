import { handleCorrectover } from './correctover';
import type { AssertionParams } from '../types/index';

// Mock child_process — implementation uses `exec`, not `execFile`
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

jest.mock('util', () => ({
  promisify: (fn: any) => fn,
}));

jest.mock('../logger', () => ({
  default: { warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const { exec } = require('child_process');
const mockExec = exec as jest.MockedFunction<typeof exec>;

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
    jest.clearAllMocks();
  });

  describe('basic scanning', () => {
    it('should pass when CCS reports no findings', async () => {
      mockExec.mockImplementation(((_cmd: any, _opts: any, cb: any) => {
        cb(null, { stdout: '[]', stderr: '' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        providerResponse: { output: 'safe output' } as any,
        output: 'safe output',
      }));
      expect(result.pass).toBe(true);
      expect(result.score).toBe(1);
    });

    it('should fail when CCS reports findings', async () => {
      const findings = JSON.stringify([
        { rule: 'RCE', detail: 'Detected subprocess call' },
      ]);
      mockExec.mockImplementation(((_cmd: any, _opts: any, cb: any) => {
        cb(null, { stdout: findings, stderr: '' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        providerResponse: { output: 'os.system("rm -rf /")' } as any,
        output: 'os.system("rm -rf /")',
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
      mockExec.mockImplementation(((_cmd: any, _opts: any, cb: any) => {
        cb(null, { stdout: findings, stderr: '' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        providerResponse: {
          output: 'Done',
          metadata: {
            toolCalls: [{ function: { name: 'http_request', arguments: JSON.stringify({ url: 'http://169.254.169.254' }) } }],
          },
        } as any,
      }));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('SSRF');
    });

    it('should scan MCP direct metadata fields (toolArgs)', async () => {
      const findings = JSON.stringify([
        { rule: 'SSRF', detail: 'Internal IP detected' },
      ]);
      mockExec.mockImplementation(((_cmd: any, _opts: any, cb: any) => {
        cb(null, { stdout: findings, stderr: '' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        providerResponse: {
          output: 'Done',
          metadata: {
            toolName: 'http_request',
            toolArgs: { url: 'http://169.254.169.254' },
          },
        } as any,
      }));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('SSRF');
    });
  });

  describe('post-transform output scanning', () => {
    it('should scan transformed output when different from raw', async () => {
      const findings = JSON.stringify([
        { rule: 'PATH_TRAVERSAL', detail: 'Dot-dot-slash detected' },
      ]);
      mockExec.mockImplementation(((_cmd: any, _opts: any, cb: any) => {
        // Only the transformed output contains the path traversal
        const input = typeof _opts === 'object' ? _opts.input : '';
        if (input.includes('../')) {
          cb(null, { stdout: findings, stderr: '' });
        } else {
          cb(null, { stdout: '[]', stderr: '' });
        }
      }) as any);

      const result = await handleCorrectover(makeParams({
        providerResponse: { output: 'encoded_data' } as any,
        output: '../../../etc/passwd',
      }));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('PATH_TRAVERSAL');
    });

    it('should not double-scan when transformed equals raw', async () => {
      mockExec.mockImplementation(((_cmd: any, _opts: any, cb: any) => {
        cb(null, { stdout: '[]', stderr: '' });
      }) as any);

      await handleCorrectover(makeParams({
        providerResponse: { output: 'same' } as any,
        output: 'same',
      }));
      // Should only be called once (for raw output), not twice
      expect(mockExec).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should fail (not pass) when CCS CLI is not found', async () => {
      mockExec.mockImplementation(((_cmd: any, _opts: any, cb: any) => {
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
      mockExec.mockImplementation(((_cmd: any, _opts: any, cb: any) => {
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
      mockExec.mockImplementation(((_cmd: any, _opts: any, cb: any) => {
        const err: any = new Error('timed out');
        err.killed = true;
        err.stderr = '';
        cb(err, { stdout: '', stderr: '' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        providerResponse: { output: 'test' } as any,
      }));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('could not complete');
    });
  });

  describe('inverse (not-correctover) mode', () => {
    it('should pass when inverse=true and findings exist', async () => {
      const findings = JSON.stringify([{ rule: 'RCE', detail: 'dangerous' }]);
      mockExec.mockImplementation(((_cmd: any, _opts: any, cb: any) => {
        cb(null, { stdout: findings, stderr: '' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        inverse: true,
        providerResponse: { output: 'malicious code' } as any,
      }));
      expect(result.pass).toBe(true);
    });

    it('should fail when inverse=true and no findings', async () => {
      mockExec.mockImplementation(((_cmd: any, _opts: any, cb: any) => {
        cb(null, { stdout: '[]', stderr: '' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        inverse: true,
        providerResponse: { output: 'safe output' } as any,
      }));
      expect(result.pass).toBe(false);
      expect(result.reason).toContain('Expected CCS violations');
    });
  });

  describe('redaction', () => {
    it('should redact credential-like patterns in findings', async () => {
      const findings = JSON.stringify([{
        rule: 'CREDENTIAL_LEAK',
        detail: 'Found key ghp_abc123def456ghi789jkl012mno345pqr678 in tool input',
      }]);
      mockExec.mockImplementation(((_cmd: any, _opts: any, cb: any) => {
        cb(null, { stdout: findings, stderr: '' });
      }) as any);

      const result = await handleCorrectover(makeParams({
        providerResponse: { output: 'test' } as any,
      }));
      expect(result.reason).not.toContain('ghp_abc123');
      expect(result.reason).toContain('<REDACTED>');
    });
  });

  describe('rules configuration', () => {
    it('should pass rules file path to CCS CLI', async () => {
      mockExec.mockImplementation(((_cmd: any, _opts: any, cb: any) => {
        expect(_cmd).toContain('--rules');
        expect(_cmd).toContain('/path/to/rules.yaml');
        cb(null, { stdout: '[]', stderr: '' });
      }) as any);

      await handleCorrectover(makeParams({
        assertion: { type: 'correctover' as any, value: '/path/to/rules.yaml' },
        providerResponse: { output: 'test' } as any,
      }));
    });
  });
});
