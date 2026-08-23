/**
 * End-to-End tests for ACP Provider
 * These tests spawn a real ACP agent binary and validate the full protocol flow.
 *
 * Requirements:
 * - An ACP-compatible agent binary available in PATH (claude, kiro, cursor, or any ACP agent)
 * - The agent must be authenticated (signed in via its own auth flow)
 * - @agentclientprotocol/sdk package installed
 *
 * Run with:
 *   npx vitest run acp.e2e
 *
 * Agent configuration:
 *   Set ACP_E2E_COMMAND to override the default agent (claude).
 *   Example: ACP_E2E_COMMAND=codex npx vitest run acp.e2e
 *
 * Note: Tests will be skipped automatically if prerequisites are not met.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { describe, expect, it, vi } from 'vitest';

// Don't mock the ACP SDK - we want the real thing
vi.unmock('@agentclientprotocol/sdk');
vi.unmock('../../src/providers/agentic-utils');
vi.unmock('../../src/cliState');

const hasSdk = fs.existsSync(
  path.resolve(process.cwd(), 'node_modules/@agentclientprotocol/sdk/package.json'),
);

// Check if the agent binary is available
const DEFAULT_COMMAND = process.env.ACP_E2E_COMMAND || 'kiro-cli acp';

function isAgentAvailable(command: string): boolean {
  // Check if the first word (binary) exists in PATH
  try {
    execSync(`command -v ${command.split(' ')[0]}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const hasAgent = isAgentAvailable(DEFAULT_COMMAND);

import { AcpProvider } from '../../src/providers/acp';

describe('AcpProvider E2E', () => {
  const testTimeout = 120_000; // 120 seconds for real agent calls

  // Skip all tests if no agent or SDK not installed
  const describeOrSkip = hasAgent && hasSdk ? describe : describe.skip;

  if (!hasAgent) {
    it(`Skipped: '${DEFAULT_COMMAND}' not found in PATH`, () => {});
  }
  if (!hasSdk) {
    it('Skipped: @agentclientprotocol/sdk not installed', () => {});
  }

  describeOrSkip('Real ACP Agent Integration', () => {
    it(
      'should complete a simple single-turn prompt',
      async () => {
        const provider = new AcpProvider({
          config: {
            command: DEFAULT_COMMAND.split(' '),
            timeout: 60,
          },
        });

        const response = await provider.callApi(
          'What is 2 + 2? Reply with just the number, nothing else.',
        );

        expect(response.error).toBeUndefined();
        expect(response.output).toBeTruthy();
        expect(response.output).toContain('4');
        expect(response.metadata?.sessionId).toBeTruthy();
        expect(response.metadata?.durationMs).toBeGreaterThan(0);
      },
      testTimeout,
    );

    it(
      'should collect tool calls when agent uses tools',
      async () => {
        const provider = new AcpProvider({
          config: {
            command: DEFAULT_COMMAND.split(' '),
            working_dir: process.cwd(),
            timeout: 90,
          },
        });

        const response = await provider.callApi(
          'List the files in the current directory. Just show me the output.',
        );

        expect(response.error).toBeUndefined();
        expect(response.output).toBeTruthy();

        // Agent should have used at least one tool (LS, Bash, or similar)
        const toolCalls = response.metadata?.toolCalls || [];
        expect(toolCalls.length).toBeGreaterThan(0);

        // Each tool call should have the expected shape
        for (const tc of toolCalls) {
          expect(tc.id).toBeTruthy();
          expect(tc.name).toBeTruthy();
        }
      },
      testTimeout,
    );

    it(
      'should respect timeout',
      async () => {
        const provider = new AcpProvider({
          config: {
            command: DEFAULT_COMMAND.split(' '),
            timeout: 3, // Very short timeout
          },
        });

        const response = await provider.callApi(
          'Write a very long essay about the history of computing from the 1800s to present day. Include at least 5000 words.',
        );

        // Should either timeout or complete very quickly with partial result
        if (response.error) {
          expect(response.error).toContain('timed out');
          expect(response.metadata?.stopReason).toBe('timeout');
        }
        // If agent responds within 3s, that's fine too (fast models)
      },
      testTimeout,
    );

    it(
      'should auto-approve permissions',
      async () => {
        const provider = new AcpProvider({
          config: {
            command: DEFAULT_COMMAND.split(' '),
            working_dir: '/tmp',
            permission_mode: 'auto_approve',
            timeout: 60,
          },
        });

        const response = await provider.callApi('Run the command: echo "hello from acp test"');

        expect(response.error).toBeUndefined();
        expect(response.output).toBeTruthy();
        expect(response.output).toContain('hello from acp test');
      },
      testTimeout,
    );

    it(
      'should pass model config to agent',
      async () => {
        const provider = new AcpProvider({
          config: {
            command: DEFAULT_COMMAND.split(' '),
            model: 'claude-sonnet-4-5',
            timeout: 60,
          },
        });

        const response = await provider.callApi('What is 1 + 1? Reply with just the number.');

        // Should succeed regardless of whether agent supports model switching
        expect(response.error).toBeUndefined();
        expect(response.output).toBeTruthy();
        expect(response.output).toContain('2');
      },
      testTimeout,
    );
  });
});
