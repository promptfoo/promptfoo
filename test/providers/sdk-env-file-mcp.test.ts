import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerRunEvaluationTool } from '../../src/commands/mcp/tools/runEvaluation';
import { AzureFoundryAgentProvider } from '../../src/providers/azure/foundry-agent';
import { AwsBedrockCompletionProvider } from '../../src/providers/bedrock';
import { VertexChatProvider } from '../../src/providers/google/vertex';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import { mockProcessEnv } from '../util/utils';

let directory: string;
let restoreEnv: () => void;
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-sdk-env-mcp-'));
  restoreEnv = mockProcessEnv({
    PROMPTFOO_CONFIG_DIR: path.join(directory, 'state'),
    PROMPTFOO_DISABLE_TELEMETRY: 'true',
    PROMPTFOO_DISABLE_UPDATE: 'true',
    PROMPTFOO_CACHE_TYPE: 'memory',
    AWS_EC2_METADATA_DISABLED: 'true',
    AWS_ACCESS_KEY_ID: 'host-access',
    AWS_SECRET_ACCESS_KEY: 'host-secret',
    AWS_SESSION_TOKEN: undefined,
    AWS_PROFILE: undefined,
    AWS_BEARER_TOKEN_BEDROCK: undefined,
    GOOGLE_APPLICATION_CREDENTIALS: path.join(directory, 'host.json'),
    GOOGLE_API_KEY: undefined,
    VERTEX_API_KEY: undefined,
    GOOGLE_CLOUD_PROJECT: undefined,
    AZURE_AI_PROJECT_URL: 'https://host.services.ai.azure.com/api/projects/fixture',
    AZURE_CLIENT_ID: undefined,
    AZURE_CLIENT_SECRET: undefined,
    AZURE_TENANT_ID: undefined,
  });
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network access'));
  // Intercept only model requests. Native SDK construction and credential discovery remain real.
  vi.spyOn(AwsBedrockCompletionProvider.prototype, 'callApi').mockImplementation(async function (
    this: AwsBedrockCompletionProvider,
  ) {
    const client = await this.getBedrockInstance();
    const credentials = await client.config.credentials();
    return { output: credentials.accessKeyId.replace('-access', '') };
  });
  vi.spyOn(SageMakerCompletionProvider.prototype, 'callApi').mockImplementation(async function (
    this: SageMakerCompletionProvider,
  ) {
    const client = await this.getSageMakerRuntimeInstance();
    const credentials = await client.config.credentials();
    return { output: credentials.accessKeyId.replace('-access', '') };
  });
  vi.spyOn(VertexChatProvider.prototype, 'callApi').mockImplementation(async function (
    this: VertexChatProvider,
  ) {
    const client = await this.getClientWithCredentials();
    return { output: client.email.split('@')[0] };
  });
  vi.spyOn(AzureFoundryAgentProvider.prototype, 'callApi').mockImplementation(async function (
    this: AzureFoundryAgentProvider,
  ) {
    const client = await Reflect.get(this, 'initializeClient').call(this);
    expect(Reflect.get(client, '_credential').constructor.name).toBe('ClientSecretCredential');
    const project = Reflect.get(this, 'getProjectUrl').call(this);
    return { output: new URL(project).hostname.split('.')[0] };
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  restoreEnv();
  fs.rmSync(directory, { recursive: true, force: true });
});

function fixture(label: string): string {
  const adc = path.join(directory, `${label}.json`);
  fs.writeFileSync(
    adc,
    JSON.stringify({
      type: 'service_account',
      project_id: `fixture-${label}`,
      private_key: 'unused-fixture-key',
      client_email: `${label}@fixture.invalid`,
      private_key_id: label,
    }),
  );
  const envPath = path.join(directory, `${label}.env`);
  fs.writeFileSync(
    envPath,
    [
      `AWS_ACCESS_KEY_ID=${label}-access`,
      `AWS_SECRET_ACCESS_KEY=${label}-secret`,
      `GOOGLE_APPLICATION_CREDENTIALS=${adc}`,
      `AZURE_AI_PROJECT_URL=https://${label}.services.ai.azure.com/api/projects/fixture`,
      'AZURE_CLIENT_ID=00000000-0000-0000-0000-000000000001',
      'AZURE_TENANT_ID=00000000-0000-0000-0000-000000000002',
      'AZURE_CLIENT_SECRET=fixture-secret',
    ].join('\n'),
  );
  const configPath = path.join(directory, `${label}.yaml`);
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      prompts: ['hello'],
      providers: [
        'bedrock:completion:anthropic.claude-v2',
        { id: 'sagemaker:custom:fixture', config: { region: 'us-east-1' } },
        { id: 'vertex:gemini-2.5-flash', config: { expressMode: false } },
        'azure:foundry-agent:fixture',
      ],
      tests: [{ assert: [{ type: 'equals', value: label }] }],
      commandLineOptions: { envPath: [envPath] },
    }),
  );
  return configPath;
}

describe('MCP config env-file SDK authentication', () => {
  it('keeps concurrent AWS, Google and Azure evaluations on their selected file identity', async () => {
    let handler: (args: Record<string, unknown>) => Promise<any>;
    registerRunEvaluationTool({
      tool(_name: string, _schema: unknown, callback: typeof handler) {
        handler = callback;
      },
    } as never);
    const host = { ...process.env };
    const responses = await Promise.all(
      ['first', 'second'].map((label) =>
        handler!({
          configPath: fixture(label),
          cache: false,
          write: false,
          share: false,
          maxConcurrency: 1,
        }),
      ),
    );
    for (const response of responses) {
      expect(response.isError).not.toBe(true);
      const result = JSON.parse(response.content[0].text);
      expect(result.data.results.stats).toMatchObject({ successes: 4, failures: 0, errors: 0 });
    }
    expect(process.env).toEqual(host);
  });
});
