/**
 * Main Entry Point Utility Tests
 */

import { afterEach, describe, expect, it } from 'vitest';
import { buildCliArgs, toReviewComment } from '../../code-scan-action/src/mainUtils';

const originalEnv = { ...process.env };

describe('code-scan-action main utilities', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('buildCliArgs', () => {
    it('should include the provided base branch in CLI args', () => {
      process.env.GITHUB_WORKSPACE = '/test/workspace';

      const cliArgs = buildCliArgs({
        apiHost: '',
        baseBranch: 'feat/my-feature-branch',
        context: {
          owner: 'test-owner',
          repo: 'test-repo',
          number: 123,
          sha: 'abc123',
        },
        finalConfigPath: '/tmp/test-config.yaml',
      });

      const baseIndex = cliArgs.indexOf('--base');

      expect(baseIndex).toBeGreaterThan(-1);
      expect(cliArgs[baseIndex + 1]).toBe('feat/my-feature-branch');
    });

    it('should support stacked PR base branches', () => {
      process.env.GITHUB_WORKSPACE = '/test/workspace';

      const cliArgs = buildCliArgs({
        apiHost: '',
        baseBranch: 'feat/openai-sora-video-provider',
        context: {
          owner: 'test-owner',
          repo: 'test-repo',
          number: 123,
          sha: 'abc123',
        },
        finalConfigPath: '/tmp/test-config.yaml',
      });

      const baseIndex = cliArgs.indexOf('--base');

      expect(baseIndex).toBeGreaterThan(-1);
      expect(cliArgs[baseIndex + 1]).toBe('feat/openai-sora-video-provider');
    });
  });

  describe('toReviewComment', () => {
    it('should separate the severity label from the finding text', () => {
      expect(
        toReviewComment({
          file: 'src/auth.ts',
          line: 42,
          finding: 'Security issue',
          severity: 'high',
        }).body,
      ).toContain('High\n\nSecurity issue');
    });

    it('should treat startLine equal to line as a single-line review comment', () => {
      expect(
        toReviewComment({
          file: 'src/auth.ts',
          line: 42,
          startLine: 42,
          finding: 'Security issue',
          severity: 'high',
        }),
      ).toEqual({
        path: 'src/auth.ts',
        line: 42,
        start_line: undefined,
        side: 'RIGHT',
        start_side: undefined,
        body: expect.stringContaining('Security issue'),
      });
    });

    it('should include a range for multi-line review comments', () => {
      expect(
        toReviewComment({
          file: 'src/auth.ts',
          line: 45,
          startLine: 40,
          finding: 'Multi-line issue',
          severity: 'high',
        }),
      ).toEqual({
        path: 'src/auth.ts',
        line: 45,
        start_line: 40,
        side: 'RIGHT',
        start_side: 'RIGHT',
        body: expect.stringContaining('Multi-line issue'),
      });
    });
  });
});
