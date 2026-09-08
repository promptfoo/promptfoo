import { BedrockAgentRuntimeClient } from '@aws-sdk/client-bedrock-agent-runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AwsBedrockAgentsProvider } from '../../../src/providers/bedrock/agents';
import { AwsBedrockKnowledgeBaseProvider } from '../../../src/providers/bedrock/knowledgeBase';

vi.mock('../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/cache')>()),
  isCacheEnabled: () => false,
  getCache: async () => ({}),
}));

describe('Bedrock agent-runtime SDK serialization', () => {
  const clients: BedrockAgentRuntimeClient[] = [];

  afterEach(() => {
    clients.forEach((client) => client.destroy());
    clients.length = 0;
    vi.restoreAllMocks();
  });

  function captureRequest() {
    const handle = vi.fn(async (_request: { body?: unknown }) => {
      throw new Error('Local serialization fixture');
    });
    const client = new BedrockAgentRuntimeClient({
      region: 'us-east-1',
      credentials: { accessKeyId: 'LOCAL_FIXTURE', secretAccessKey: 'LOCAL_FIXTURE' },
      maxAttempts: 1,
      requestHandler: { handle },
    });
    clients.push(client);
    return { client, handle };
  }

  it('serializes agent knowledge-base overrides with existing session state', async () => {
    const knowledgeBaseConfigurations = [
      {
        knowledgeBaseId: 'KB12345678',
        retrievalConfiguration: { vectorSearchConfiguration: { numberOfResults: 3 } },
      },
    ];
    const provider = new AwsBedrockAgentsProvider('AGENT12345', {
      config: {
        agentId: 'AGENT12345',
        agentAliasId: 'ALIAS12345',
        sessionId: 'local-fixture-session',
        region: 'us-east-1',
        sessionState: { sessionAttributes: { topic: 'garden' } },
        knowledgeBaseConfigurations,
      },
    });
    const { client, handle } = captureRequest();
    vi.spyOn(provider, 'getAgentRuntimeClient').mockResolvedValue(client);

    const result = await provider.callApi('Describe a quiet garden');

    expect(result.error).toContain('Local serialization fixture');
    expect(handle).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(handle.mock.calls[0][0].body));
    expect(request.sessionState).toEqual({
      sessionAttributes: { topic: 'garden' },
      knowledgeBaseConfigurations,
    });
    expect(request).not.toHaveProperty('knowledgeBaseConfigurations');
  });

  it('serializes knowledge-base generation settings in the AWS request', async () => {
    const provider = new AwsBedrockKnowledgeBaseProvider('custom-model', {
      config: {
        knowledgeBaseId: 'KB12345678',
        modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/custom-model',
        temperature: 0,
        max_tokens: 128,
        top_p: 0.75,
        top_k: 20,
      },
    });
    const { client, handle } = captureRequest();
    vi.spyOn(provider, 'getKnowledgeBaseClient').mockResolvedValue(client);

    const result = await provider.callApi('Describe a quiet garden');

    expect(result.error).toContain('Local serialization fixture');
    expect(handle).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(handle.mock.calls[0][0].body));
    expect(
      request.retrieveAndGenerateConfiguration.knowledgeBaseConfiguration.generationConfiguration,
    ).toEqual({
      inferenceConfig: { textInferenceConfig: { temperature: 0, maxTokens: 128, topP: 0.75 } },
      additionalModelRequestFields: { top_k: 20 },
    });
  });
});
