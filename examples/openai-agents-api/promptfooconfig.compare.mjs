import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const model = 'gpt-6-astra';
const workspace = new URL('./comparison/workspace/', import.meta.url);
const receipt = readFileSync(new URL('receipt.txt', workspace));

// Replays load the saved provider config in a fresh process, so the private home must outlive this run.
const codexHome = resolve(
  process.env.PROMPTFOO_CONFIG_DIR || join(homedir(), '.promptfoo'),
  'receipt-comparison-codex',
);
mkdirSync(codexHome, { recursive: true, mode: 0o700 });

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
        environment_access: false,
        approval_policy: 'never',
        skip_git_repo_check: true,
        turn_timeout_ms: 120000,
        cli_env: { CODEX_HOME: codexHome },
        cli_config: {
          cli_auth_credentials_store: 'ephemeral',
          features: {
            apps: false,
            plugins: false,
            multi_agent: false,
            skip_host_skill_discovery: true,
          },
          web_search: 'disabled',
          project_doc_max_bytes: 0,
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
