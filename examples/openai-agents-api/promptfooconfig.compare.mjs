import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const model = 'gpt-6-astra';
const workspace = new URL('./comparison/workspace/', import.meta.url);
const receipt = readFileSync(new URL('receipt.txt', workspace));

// Codex signs in with the eval's API key. Keep its login and user configuration isolated.
const codexHome = mkdtempSync(join(tmpdir(), 'promptfoo-receipt-codex-'));
process.once('exit', () => rmSync(codexHome, { recursive: true, force: true }));

export default {
  description: 'Compare three agent runtimes on the same receipt',
  prompts: [
    'Read receipt.txt using read_receipt if available, otherwise run a sandbox command from the workspace root. Sum all line_amount_cents, including refunds. Return only a JSON object with the receipt_id and integer net_cents.',
  ],
  providers: [
    {
      id: `openai:agents-api:${model}`,
      label: 'Hosted Agents API',
      config: {
        agent: { reasoning: { effort: 'low' } },
        environment: {
          type: 'openai_hosted',
          network: { access: 'disabled' },
          files: [
            { type: 'inline', path: '/workspace/receipt.txt', data: receipt.toString('base64') },
          ],
        },
        hostedTrace: { includeToolArguments: true, timeoutMs: 30000 },
      },
    },
    {
      id: 'openai:agents:receipt-reader',
      label: 'TypeScript Agents SDK',
      delay: 1500,
      config: {
        agent: { name: 'Receipt reader' },
        tools: 'file://./comparison/receipt-tools.mjs',
        model,
        modelSettings: { reasoning: { effort: 'low' } },
        tracing: true,
        maxTurns: 4,
      },
    },
    {
      id: `openai:codex-app-server:${model}`,
      label: 'Codex app-server',
      config: {
        working_dir: fileURLToPath(workspace),
        model_reasoning_effort: 'low',
        sandbox_mode: 'read-only',
        approval_policy: 'never',
        skip_git_repo_check: true,
        turn_timeout_ms: 120000,
        cli_env: { CODEX_HOME: codexHome },
        cli_config: {
          mcp_servers: {
            receipt: {
              command: process.execPath,
              args: [fileURLToPath(new URL('./comparison/receipt-mcp.mjs', import.meta.url))],
              enabled_tools: ['read_receipt'],
              tools: { read_receipt: { approval_mode: 'approve' } },
            },
          },
        },
      },
    },
  ],
  tracing: { enabled: true, otlp: { http: { enabled: true } } },
  defaultTest: {
    assert: [
      {
        type: 'equals',
        metric: 'ReceiptAnswer',
        value: { receipt_id: 'PF-7Q2K', net_cents: 3316 },
      },
    ],
  },
  tests: [
    {
      description: 'Hosted sandbox command',
      providers: ['Hosted Agents API'],
      assert: [
        { type: 'trajectory:tool-used', value: 'command_execution' },
        {
          type: 'trajectory:tool-args-match',
          value: { name: 'command_execution', args: { cwd: '/workspace' } },
        },
      ],
    },
    {
      description: 'SDK receipt tool and filename',
      providers: ['TypeScript Agents SDK'],
      assert: [
        {
          type: 'trajectory:tool-args-match',
          value: { name: 'read_receipt', args: { filename: 'receipt.txt' } },
        },
      ],
    },
    {
      description: 'App-server receipt MCP tool',
      providers: ['Codex app-server'],
      assert: [
        { type: 'trajectory:tool-used', value: 'read_receipt' },
        { type: 'trace-error-spans', value: { pattern: 'mcp receipt/read_receipt', max_count: 0 } },
      ],
    },
  ],
};
