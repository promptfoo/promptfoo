import {
  BedrockAgentRuntimeClient,
  type KnowledgeBaseVectorSearchConfiguration,
  type RetrievalFilter,
} from '@aws-sdk/client-bedrock-agent-runtime';
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

  function captureRequest(responseBody?: Record<string, unknown>) {
    const handle = vi.fn(async (_request: { body?: unknown }) => {
      if (responseBody) {
        return {
          response: {
            statusCode: 200,
            headers: { 'content-type': 'application/json' },
            body: new TextEncoder().encode(JSON.stringify(responseBody)),
          },
        };
      }
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
        knowledgeBaseConfigurations: [
          ...knowledgeBaseConfigurations,
          { knowledgeBaseId: 'KB98765432' },
        ],
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

  it.each([undefined, { sessionAttributes: { topic: 'garden' } }])(
    'omits ID-only knowledge-base overrides while preserving session state %j',
    async (sessionState) => {
      const provider = new AwsBedrockAgentsProvider('AGENT12345', {
        config: {
          agentId: 'AGENT12345',
          agentAliasId: 'ALIAS12345',
          sessionId: 'local-fixture-session',
          region: 'us-east-1',
          sessionState,
          knowledgeBaseConfigurations: [{ knowledgeBaseId: 'KB12345678' }],
        },
      });
      const { client, handle } = captureRequest();
      vi.spyOn(provider, 'getAgentRuntimeClient').mockResolvedValue(client);

      const result = await provider.callApi('Describe a quiet garden');

      expect(result.error).toContain('Local serialization fixture');
      expect(handle).toHaveBeenCalledTimes(1);
      const request = JSON.parse(String(handle.mock.calls[0][0].body));
      expect(request.sessionState).toEqual(sessionState);
    },
  );

  it.each([
    { equals: { key: 'category', value: 'technical' } },
    {
      andAll: [
        { equals: { key: 'documentType', value: 'manual' } },
        { equals: { key: 'product', value: 'widget-pro' } },
      ],
    },
    {
      orAll: [
        { equals: { key: 'category', value: 'technical' } },
        { equals: { key: 'category', value: 'reference' } },
      ],
    },
    { notEquals: { key: 'archived', value: false } },
    { greaterThan: { key: 'revision', value: 0 } },
    { greaterThanOrEquals: { key: 'revision', value: 0 } },
    { lessThan: { key: 'revision', value: 10 } },
    { lessThanOrEquals: { key: 'revision', value: 10 } },
    { in: { key: 'category', value: ['technical', 'reference'] } },
    { notIn: { key: 'category', value: ['obsolete'] } },
    { startsWith: { key: 'product', value: 'widget' } },
    { listContains: { key: 'products', value: 'widget-pro' } },
    { stringContains: { key: 'product', value: 'widget' } },
  ] satisfies RetrievalFilter[])(
    'preserves the SDK retrieval filter %j and other search options',
    async (filter) => {
      const vectorSearchConfiguration: KnowledgeBaseVectorSearchConfiguration = {
        numberOfResults: 10,
        overrideSearchType: 'HYBRID',
        filter,
        implicitFilterConfiguration: {
          modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/local-filter-model',
          metadataAttributes: [
            { key: 'category', type: 'STRING', description: 'Document category' },
          ],
        },
        rerankingConfiguration: {
          type: 'BEDROCK_RERANKING_MODEL',
          bedrockRerankingConfiguration: {
            modelConfiguration: {
              modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/local-reranker',
              additionalModelRequestFields: { localFixture: true },
            },
            numberOfRerankedResults: 2,
          },
        },
      };
      const provider = new AwsBedrockAgentsProvider('AGENT12345', {
        config: {
          agentId: 'AGENT12345',
          agentAliasId: 'ALIAS12345',
          sessionId: 'local-fixture-session',
          sessionState: { sessionAttributes: { topic: 'garden' } },
          knowledgeBaseConfigurations: [
            {
              knowledgeBaseId: 'KB12345678',
              retrievalConfiguration: { vectorSearchConfiguration },
            },
          ],
        },
      });
      const { client, handle } = captureRequest();
      vi.spyOn(provider, 'getAgentRuntimeClient').mockResolvedValue(client);

      const result = await provider.callApi('Describe a quiet garden');

      expect(result.error).toContain('Local serialization fixture');
      expect(handle).toHaveBeenCalledTimes(1);
      const request = JSON.parse(String(handle.mock.calls[0][0].body));
      expect(request.sessionState.sessionAttributes).toEqual({ topic: 'garden' });
      expect(
        request.sessionState.knowledgeBaseConfigurations[0].retrievalConfiguration
          .vectorSearchConfiguration,
      ).toEqual(vectorSearchConfiguration);
      expect(vectorSearchConfiguration.filter).toEqual(filter);
    },
  );

  it.each([
    {
      filter: { equals: { key: 'category', value: 'technical' }, notEquals: undefined },
      expected: { equals: { key: 'category', value: 'technical' } },
    },
    {
      filter: { $unknown: ['futureOperator', { key: 'category', value: 'technical' }] },
      expected: { futureOperator: { key: 'category', value: 'technical' } },
    },
  ] satisfies { filter: RetrievalFilter; expected: unknown }[])(
    'preserves SDK union compatibility for $filter',
    async ({ filter, expected }) => {
      const provider = new AwsBedrockAgentsProvider('AGENT12345', {
        config: {
          agentId: 'AGENT12345',
          agentAliasId: 'ALIAS12345',
          sessionId: 'local-fixture-session',
          knowledgeBaseConfigurations: [
            {
              knowledgeBaseId: 'KB12345678',
              retrievalConfiguration: { vectorSearchConfiguration: { filter } },
            },
          ],
        },
      });
      const { client, handle } = captureRequest();
      vi.spyOn(provider, 'getAgentRuntimeClient').mockResolvedValue(client);

      const result = await provider.callApi('Describe a quiet garden');

      expect(result.error).toContain('Local serialization fixture');
      expect(handle).toHaveBeenCalledTimes(1);
      const request = JSON.parse(String(handle.mock.calls[0][0].body));
      expect(
        request.sessionState.knowledgeBaseConfigurations[0].retrievalConfiguration
          .vectorSearchConfiguration.filter,
      ).toEqual(expected);
    },
  );

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

  it.each([
    ['anthropic.claude-opus-4-7', undefined],
    ['us.anthropic.claude-opus-4-7', undefined],
    ['arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-opus-4-7', undefined],
    [
      'custom-model',
      'arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-opus-4-7',
    ],
  ] as const)(
    'filters unsupported sampling for effective model %s / %s',
    async (modelName, modelArn) => {
      const provider = new AwsBedrockKnowledgeBaseProvider(modelName, {
        config: {
          knowledgeBaseId: 'KB12345678',
          modelArn,
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
      ).toEqual({ inferenceConfig: { textInferenceConfig: { maxTokens: 128 } } });
    },
  );

  it('preserves sampling for a supported modelArn override', async () => {
    const provider = new AwsBedrockKnowledgeBaseProvider('anthropic.claude-opus-4-7', {
      config: {
        knowledgeBaseId: 'KB12345678',
        modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0',
        temperature: 0,
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
      inferenceConfig: { textInferenceConfig: { temperature: 0, topP: 0.75 } },
      additionalModelRequestFields: { inferenceConfig: { topK: 20 } },
    });
  });

  it.each([
    ['amazon.nova-lite-v1:0', undefined],
    ['amazon.nova-pro-v1:0', undefined],
    ['amazon.nova-micro-v1:0', undefined],
    ['us.amazon.nova-premier-v1:0', undefined],
    ['arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0', undefined],
    ['custom-model', 'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-pro-v1:0'],
  ] as const)(
    'serializes Nova top-k in native inferenceConfig for %s / %s',
    async (modelName, modelArn) => {
      const provider = new AwsBedrockKnowledgeBaseProvider(modelName, {
        config: { knowledgeBaseId: 'KB12345678', modelArn, top_k: 0 },
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
        additionalModelRequestFields: { inferenceConfig: { topK: 0 } },
      });
    },
  );

  it.each([
    ['cohere.command-r-v1:0', undefined, 0],
    ['cohere.command-r-plus-v1:0', undefined, 20],
    ['arn:aws:bedrock:us-east-1::foundation-model/cohere.command-r-v1:0', undefined, 20],
    [
      'amazon.nova-lite-v1:0',
      'arn:aws:bedrock:us-west-2::foundation-model/cohere.command-r-plus-v1:0',
      0,
    ],
  ] as const)(
    'serializes Cohere top-k as k and preserves responses for %s / %s',
    async (modelName, modelArn, top_k) => {
      const provider = new AwsBedrockKnowledgeBaseProvider(modelName, {
        config: {
          knowledgeBaseId: 'KB12345678',
          modelArn,
          temperature: 0,
          top_p: 0.75,
          top_k,
          max_tokens: 128,
        },
      });
      const citations = [{ retrievedReferences: [{ content: { text: 'Garden fixture' } }] }];
      const { client, handle } = captureRequest({
        output: { text: 'A quiet garden' },
        citations,
      });
      vi.spyOn(provider, 'getKnowledgeBaseClient').mockResolvedValue(client);

      const result = await provider.callApi('Describe a quiet garden');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('A quiet garden');
      expect(result.metadata?.citations).toEqual(citations);
      expect(result.tokenUsage?.numRequests).toBe(1);
      expect(handle).toHaveBeenCalledTimes(1);
      const request = JSON.parse(String(handle.mock.calls[0][0].body));
      expect(
        request.retrieveAndGenerateConfiguration.knowledgeBaseConfiguration.generationConfiguration,
      ).toEqual({
        inferenceConfig: { textInferenceConfig: { temperature: 0, topP: 0.75, maxTokens: 128 } },
        additionalModelRequestFields: { k: top_k },
      });
    },
  );

  it.each([
    ['anthropic.claude-sonnet-4-5-20250929-v1:0', undefined],
    ['anthropic.claude-haiku-4-5-20251001-v1:0', undefined],
    ['us.anthropic.claude-sonnet-4-5-20250929-v1:0', undefined],
    [
      'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
      undefined,
    ],
    [
      'amazon.nova-lite-v1:0',
      'arn:aws:bedrock:us-east-1:123456789012:inference-profile/global.anthropic.claude-sonnet-4-5-20250929-v1:0',
    ],
    ['anthropic.claude-sonnet-4-6', undefined],
    ['global.anthropic.claude-sonnet-4-6', undefined],
    ['arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-4-6', undefined],
    [
      'cohere.command-r-v1:0',
      'arn:aws:bedrock:us-east-1:123456789012:inference-profile/us.anthropic.claude-sonnet-4-6',
    ],
  ] as const)(
    'prefers top_p over temperature for affected Claude model %s / %s',
    async (modelName, modelArn) => {
      const provider = new AwsBedrockKnowledgeBaseProvider(modelName, {
        config: {
          knowledgeBaseId: 'KB12345678',
          modelArn,
          temperature: 0.5,
          top_p: 0,
          top_k: 20,
          max_tokens: 128,
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
        inferenceConfig: { textInferenceConfig: { topP: 0, maxTokens: 128 } },
        additionalModelRequestFields: { top_k: 20 },
      });
    },
  );

  it.each([
    {
      modelName: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
      sampling: { temperature: 0 },
      expected: { temperature: 0 },
    },
    {
      modelName: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
      sampling: { top_p: 0.75 },
      expected: { topP: 0.75 },
    },
    {
      modelName: 'anthropic.claude-sonnet-4-6',
      sampling: { temperature: 0 },
      expected: { temperature: 0 },
    },
    {
      modelName: 'anthropic.claude-sonnet-4-6',
      sampling: { top_p: 0.75 },
      expected: { topP: 0.75 },
    },
  ])(
    'preserves individual sampling option $sampling for $modelName',
    async ({ modelName, sampling, expected }) => {
      const provider = new AwsBedrockKnowledgeBaseProvider(modelName, {
        config: { knowledgeBaseId: 'KB12345678', ...sampling },
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
        inferenceConfig: { textInferenceConfig: expected },
      });
    },
  );

  it.each([
    ['anthropic.claude-3-5-sonnet-20241022-v2:0', undefined],
    ['custom-model', undefined],
    ['custom-amazon.nova-model', undefined],
    ['custom-cohere.command-r-v1:0', undefined],
    ['cohere.command-r-custom', undefined],
    ['anthropic.claude-sonnet-4-50', undefined],
    ['anthropic.claude-sonnet-4-60', undefined],
    [
      'arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/claude-prod-5',
      undefined,
    ],
    [
      'amazon.nova-lite-v1:0',
      'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0',
    ],
    ['anthropic.claude-sonnet-4-5-20250929-v1:0', 'custom-model'],
    ['anthropic.claude-sonnet-4-6', 'custom-model'],
    ['cohere.command-r-v1:0', 'custom-model'],
  ] as const)(
    'preserves other model sampling and top-k shapes for %s / %s',
    async (modelName, modelArn) => {
      const provider = new AwsBedrockKnowledgeBaseProvider(modelName, {
        config: { knowledgeBaseId: 'KB12345678', modelArn, temperature: 0, top_p: 0.75, top_k: 20 },
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
        inferenceConfig: { textInferenceConfig: { temperature: 0, topP: 0.75 } },
        additionalModelRequestFields: { top_k: 20 },
      });
    },
  );

  it('omits generationConfiguration when all configured fields are unsupported', async () => {
    const provider = new AwsBedrockKnowledgeBaseProvider('anthropic.claude-opus-4-7', {
      config: { knowledgeBaseId: 'KB12345678', temperature: 0, top_p: 0.75, top_k: 20 },
    });
    const { client, handle } = captureRequest();
    vi.spyOn(provider, 'getKnowledgeBaseClient').mockResolvedValue(client);

    const result = await provider.callApi('Describe a quiet garden');

    expect(result.error).toContain('Local serialization fixture');
    expect(handle).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(handle.mock.calls[0][0].body));
    expect(request.retrieveAndGenerateConfiguration.knowledgeBaseConfiguration).not.toHaveProperty(
      'generationConfiguration',
    );
  });

  it.each([
    'us.anthropic.claude-opus-4-7',
    'eu.anthropic.claude-opus-4-7',
    'apac.anthropic.claude-sonnet-4-20250514-v1:0',
    'global.anthropic.claude-opus-4-7',
    'jp.anthropic.claude-opus-4-7',
    'au.anthropic.claude-opus-4-7',
    'arn:aws:bedrock:us-east-1::foundation-model/amazon.nova-lite-v1:0',
    'arn:aws-us-gov:bedrock:us-gov-west-1:123456789012:application-inference-profile/localfixture',
    'arn:aws-cn:bedrock:cn-north-1:123456789012:inference-profile/localfixture',
  ])(
    'preserves the selected model/profile identifier %s in SDK serialization',
    async (modelName) => {
      const provider = new AwsBedrockKnowledgeBaseProvider(modelName, {
        config: { knowledgeBaseId: 'KB12345678' },
      });
      const { client, handle } = captureRequest();
      vi.spyOn(provider, 'getKnowledgeBaseClient').mockResolvedValue(client);

      const result = await provider.callApi('Describe a quiet garden');

      expect(result.error).toContain('Local serialization fixture');
      expect(handle).toHaveBeenCalledTimes(1);
      const request = JSON.parse(String(handle.mock.calls[0][0].body));
      expect(request.retrieveAndGenerateConfiguration.knowledgeBaseConfiguration.modelArn).toBe(
        modelName,
      );
    },
  );

  it.each([
    'amazon.nova-lite-v1:0',
    'custom-model',
    'global-custom-model',
    'custom-arn:aws:bedrock:us-east-1::foundation-model/local-model',
    'arn:aws:bedrock-invalid:us-east-1::foundation-model/local-model',
  ])('keeps foundation-model construction for nonmatching identifier %s', async (modelName) => {
    const provider = new AwsBedrockKnowledgeBaseProvider(modelName, {
      config: { knowledgeBaseId: 'KB12345678', region: 'us-east-1' },
    });
    const { client, handle } = captureRequest();
    vi.spyOn(provider, 'getKnowledgeBaseClient').mockResolvedValue(client);

    const result = await provider.callApi('Describe a quiet garden');

    expect(result.error).toContain('Local serialization fixture');
    expect(handle).toHaveBeenCalledTimes(1);
    const request = JSON.parse(String(handle.mock.calls[0][0].body));
    expect(request.retrieveAndGenerateConfiguration.knowledgeBaseConfiguration.modelArn).toBe(
      `arn:aws:bedrock:us-east-1::foundation-model/${modelName}`,
    );
  });
});
