import React, { useEffect, useRef, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import {
  type BedrockApiMode,
  getBedrockTextRoute,
  isBedrockAnthropicMessagesModel,
  isBedrockGptOssResponsesModel,
  isBedrockMantleResponsesModel,
  isBedrockOpenAiResponsesModel,
  isRejectedPrefixedGrokId,
  isRejectedPrefixedMythosId,
  requiresBedrockAnthropicMessagesModel,
} from '@promptfoo/providers/bedrock/routing';
import {
  DEFAULT_BEDROCK_TARGET_ID,
  DEFAULT_GOOGLE_TARGET_ID,
  DEFAULT_OPENAI_TARGET_ID,
  DEFAULT_VERTEX_TARGET_ID,
  OPENAI_TARGET_PLACEHOLDER,
} from '../constants';
import { SetupSection } from '../SetupSection';
import BedrockAuthentication from './BedrockAuthentication';

import type { ProviderOptions } from '../../types';

interface FoundationModelConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
  providerType: string;
}

const BEDROCK_API_OPTIONS: { value: BedrockApiMode; label: string }[] = [
  { value: 'responses', label: 'Responses API (OpenAI Models)' },
  { value: 'invoke', label: 'InvokeModel' },
  { value: 'converse', label: 'Converse' },
  { value: 'chat', label: 'Chat Completions' },
  { value: 'messages', label: 'Anthropic Messages' },
];

const BEDROCK_API_HELP: Record<BedrockApiMode, string> = {
  invoke: 'Uses the model-specific InvokeModel API on Bedrock Runtime.',
  converse:
    'Uses the Bedrock Converse API on Bedrock Runtime, with native tool calling and MCP support.',
  responses: 'Uses the OpenAI-compatible Responses API.',
  chat: 'Uses the OpenAI-compatible Chat Completions API.',
  messages: 'Uses the Anthropic Messages API.',
};

interface MCPServerConfig {
  name: string;
  command?: string;
  args?: string[];
  path?: string;
  url?: string;
}

const getBedrockModelFromId = (id?: string): string => {
  return getBedrockTextRoute(id || 'bedrock:')?.modelId ?? id ?? '';
};

const buildBedrockProviderId = (apiMode: BedrockApiMode, modelId: string): string => {
  // Accept familiar GPT names in the editor; persist Bedrock's canonical namespace.
  // Do not guess namespaces for custom IDs, inference profiles, or ARNs.
  if (/^gpt-(?:\d|oss-)/.test(modelId)) {
    modelId = `openai.${modelId}`;
  }
  if (apiMode === 'responses' || apiMode === 'chat') {
    const prefix = apiMode === 'chat' ? 'mantle' : 'responses';
    return `bedrock:${prefix}:${modelId.replace(/^(openai\.gpt-oss-(?:20b|120b))-1:0$/, '$1')}`;
  }
  if (apiMode === 'messages') {
    return `bedrock:messages:${modelId}`;
  }
  modelId = modelId.replace(/^(openai\.gpt-oss-(?:20b|120b))$/, '$1-1:0');
  return apiMode === 'converse' ? `bedrock:converse:${modelId}` : `bedrock:${modelId}`;
};

// Match the backend's model-family checks, not a regional availability catalog.
const getBedrockApiError = (apiMode: BedrockApiMode, modelId: string): string | undefined => {
  if (!modelId) {
    return 'Enter a model ID.';
  }
  if (apiMode !== 'chat' && isRejectedPrefixedMythosId(modelId)) {
    return 'Mythos 5 requires the bare anthropic.claude-mythos-5 ID and Anthropic Messages API.';
  }
  if (
    (apiMode === 'invoke' || apiMode === 'converse' || apiMode === 'chat') &&
    isRejectedPrefixedGrokId(modelId, apiMode === 'chat')
  ) {
    return 'This Grok inference-profile ID is not supported by the selected API.';
  }
  if (
    apiMode === 'responses' &&
    !isBedrockMantleResponsesModel(modelId) &&
    !isBedrockGptOssResponsesModel(modelId)
  ) {
    return 'Responses requires a bare OpenAI frontier or Grok ID, or a GPT OSS ID without -1:0.';
  }
  if (apiMode === 'messages' && !isBedrockAnthropicMessagesModel(modelId)) {
    return 'This model ID is not supported by the Bedrock Anthropic Messages adapter.';
  }
  if (apiMode === 'invoke' || apiMode === 'converse') {
    if (isBedrockMantleResponsesModel(modelId)) {
      return 'This model uses the Responses API. Select Responses or enter a model for the selected API.';
    }
    if (requiresBedrockAnthropicMessagesModel(modelId)) {
      return 'This model requires the Anthropic Messages API.';
    }
  }
  if (apiMode === 'chat' && isBedrockOpenAiResponsesModel(modelId)) {
    return 'This OpenAI model requires the Responses API.';
  }
  return undefined;
};

const isServerConfigured = (server: MCPServerConfig): boolean =>
  Boolean(server.command || server.path || server.url);

const createDefaultMCPServer = (index: number): MCPServerConfig => ({
  name: `server-${index + 1}`,
  args: [],
});

const FoundationModelConfiguration = ({
  selectedTarget,
  updateCustomTarget,
  providerType,
}: FoundationModelConfigurationProps) => {
  const isBedrock = providerType === 'bedrock';
  const bedrockRoute = isBedrock ? getBedrockTextRoute(selectedTarget.id || 'bedrock:') : undefined;
  const [bedrockApiMode, setBedrockApiMode] = useState(bedrockRoute?.apiMode);
  const lastEditedTarget = useRef<{ id: string; providerType: string } | undefined>(undefined);
  const isBedrockHttpApi =
    bedrockApiMode === 'responses' || bedrockApiMode === 'chat' || bedrockApiMode === 'messages';
  const isBedrockNativeApi = bedrockApiMode === 'invoke' || bedrockApiMode === 'converse';
  const [modelId, setModelId] = useState(
    isBedrock ? getBedrockModelFromId(selectedTarget.id) : selectedTarget.id || '',
  );
  const bedrockApiError =
    isBedrock && bedrockApiMode
      ? getBedrockApiError(bedrockApiMode, bedrockRoute?.modelId ?? modelId)
      : undefined;
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isMcpOpen, setIsMcpOpen] = useState(Boolean(selectedTarget.config?.mcp?.servers?.length));
  const [isBedrockSettingsOpen, setIsBedrockSettingsOpen] = useState(
    isBedrock &&
      Boolean(
        selectedTarget.config?.region ||
          selectedTarget.config?.profile ||
          selectedTarget.config?.apiKey ||
          selectedTarget.config?.accessKeyId ||
          selectedTarget.config?.secretAccessKey ||
          selectedTarget.config?.sessionToken ||
          selectedTarget.config?.apiKeyRequired === false,
      ),
  );

  useEffect(() => {
    // Parent echoes of our own edits must not replace the draft or re-infer the API
    // from a partially typed model ID. External target changes still rehydrate both.
    if (
      lastEditedTarget.current?.id === selectedTarget.id &&
      lastEditedTarget.current?.providerType === providerType
    ) {
      return;
    }
    lastEditedTarget.current = undefined;
    const route =
      providerType === 'bedrock' ? getBedrockTextRoute(selectedTarget.id || 'bedrock:') : undefined;
    setBedrockApiMode(route?.apiMode);
    setModelId(
      providerType === 'bedrock'
        ? getBedrockModelFromId(selectedTarget.id)
        : selectedTarget.id || '',
    );
  }, [providerType, selectedTarget.id]);

  const handleModelIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newId = e.target.value;
    setModelId(newId);
    updateProviderId(
      isBedrock && bedrockApiMode ? buildBedrockProviderId(bedrockApiMode, newId) : newId,
    );
  };

  const updateProviderId = (id: string, apiMode = bedrockApiMode) => {
    const source = bedrockApiMode === 'responses' ? 'max_output_tokens' : 'max_tokens';
    const destination = apiMode === 'responses' ? 'max_output_tokens' : 'max_tokens';
    if (source !== destination && selectedTarget.config?.[source] !== undefined) {
      const { [source]: limit, ...config } = selectedTarget.config;
      updateCustomTarget('config', { ...config, [destination]: limit });
    }
    lastEditedTarget.current = { id, providerType };
    updateCustomTarget('id', id);
  };

  const handleBedrockApiChange = (apiMode: BedrockApiMode) => {
    const id = buildBedrockProviderId(apiMode, modelId);
    const convertedModel = getBedrockModelFromId(id);
    setBedrockApiMode(apiMode);
    setModelId(
      modelId.startsWith('gpt-') ? convertedModel.replace(/^openai\./, '') : convertedModel,
    );
    updateProviderId(id, apiMode);
  };

  const updateMCPServers = (servers: MCPServerConfig[]) => {
    const { mcp: _mcp, ...configWithoutMcp } = selectedTarget.config || {};

    if (servers.length === 0) {
      updateCustomTarget('config', configWithoutMcp);
      return;
    }

    // Only enable MCP once at least one server has a usable transport. An empty
    // `command` / `path` / `url` would cause `MCPClient.initialize()` to throw at
    // eval time; defer enabling until the user actually fills the fields in.
    const enabled = servers.some(isServerConfigured);

    updateCustomTarget('config', {
      ...selectedTarget.config,
      mcp: {
        ...selectedTarget.config?.mcp,
        enabled,
        servers,
      },
    });
  };

  const addMCPServer = () => {
    const servers = selectedTarget.config?.mcp?.servers || [];
    // Don't seed `command: ''`; an empty string would be persisted and later
    // fail validation. Leave the field undefined and let the input render empty.
    updateMCPServers([...servers, createDefaultMCPServer(servers.length)]);
    setIsMcpOpen(true);
  };

  const updateMCPServer = (
    index: number,
    field: keyof MCPServerConfig,
    value: string | string[] | undefined,
  ) => {
    const servers: MCPServerConfig[] = [...(selectedTarget.config?.mcp?.servers || [])];
    servers[index] = {
      ...servers[index],
      [field]: value,
    };
    updateMCPServers(servers);
  };

  const removeMCPServer = (index: number) => {
    const servers = (selectedTarget.config?.mcp?.servers || []).filter(
      (_server: MCPServerConfig, serverIndex: number) => serverIndex !== index,
    );
    updateMCPServers(servers);
  };

  const getProviderInfo = (type: string) => {
    const providerConfigs = {
      openai: {
        name: 'OpenAI',
        defaultModel: DEFAULT_OPENAI_TARGET_ID,
        placeholder: OPENAI_TARGET_PLACEHOLDER,
        docUrl: 'https://www.promptfoo.dev/docs/providers/openai',
        envVar: 'OPENAI_API_KEY',
      },
      anthropic: {
        name: 'Anthropic',
        defaultModel: 'anthropic:messages:claude-sonnet-4-5-20250929',
        placeholder:
          'anthropic:messages:claude-sonnet-4-5-20250929, anthropic:messages:claude-haiku-4-5-20251001',
        docUrl: 'https://www.promptfoo.dev/docs/providers/anthropic',
        envVar: 'ANTHROPIC_API_KEY',
      },
      google: {
        name: 'Google AI Studio',
        defaultModel: DEFAULT_GOOGLE_TARGET_ID,
        placeholder: `${DEFAULT_GOOGLE_TARGET_ID}, google:gemini-3.5-flash-lite`,
        docUrl: 'https://www.promptfoo.dev/docs/providers/google',
        envVar: 'GOOGLE_API_KEY | GEMINI_API_KEY | PALM_API_KEY',
      },
      vertex: {
        name: 'Google Vertex AI',
        defaultModel: DEFAULT_VERTEX_TARGET_ID,
        placeholder: `${DEFAULT_VERTEX_TARGET_ID}, vertex:gemini-3.5-flash-lite`,
        docUrl: 'https://www.promptfoo.dev/docs/providers/vertex',
        envVar: 'GOOGLE_APPLICATION_CREDENTIALS',
      },
      mistral: {
        name: 'Mistral AI',
        defaultModel: 'mistral:mistral-large-latest',
        placeholder: 'mistral:mistral-large-latest, mistral:mistral-small-latest',
        docUrl: 'https://www.promptfoo.dev/docs/providers/mistral',
        envVar: 'MISTRAL_API_KEY',
      },
      cohere: {
        name: 'Cohere',
        defaultModel: 'cohere:command-a-03-2025',
        placeholder: 'cohere:command-a-03-2025, cohere:command-r-plus-08-2024',
        docUrl: 'https://www.promptfoo.dev/docs/providers/cohere',
        envVar: 'COHERE_API_KEY',
      },
      groq: {
        name: 'Groq',
        defaultModel: 'groq:llama-3.1-70b-versatile',
        placeholder: 'groq:llama-3.1-70b-versatile, groq:mixtral-8x7b-32768',
        docUrl: 'https://www.promptfoo.dev/docs/providers/groq',
        envVar: 'GROQ_API_KEY',
      },
      deepseek: {
        name: 'DeepSeek',
        defaultModel: 'deepseek:deepseek-chat',
        placeholder: 'deepseek:deepseek-chat, deepseek:deepseek-coder',
        docUrl: 'https://www.promptfoo.dev/docs/providers/deepseek',
        envVar: 'DEEPSEEK_API_KEY',
      },
      azure: {
        name: 'Azure OpenAI',
        defaultModel: 'azure:chat:gpt-4o',
        placeholder: 'azure:chat:your-deployment-name',
        docUrl: 'https://www.promptfoo.dev/docs/providers/azure',
        envVar: 'AZURE_OPENAI_API_KEY',
      },
      bedrock: {
        name: 'AWS Bedrock',
        defaultModel: DEFAULT_BEDROCK_TARGET_ID,
        placeholder: 'gpt-5.6-sol',
        docUrl: 'https://www.promptfoo.dev/docs/providers/aws-bedrock',
        envVar: 'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY',
      },
      openrouter: {
        name: 'OpenRouter',
        defaultModel: 'openrouter:openai/gpt-5.4',
        placeholder: 'openrouter:openai/gpt-5.4, openrouter:anthropic/claude-opus-4.7',
        docUrl: 'https://www.promptfoo.dev/docs/providers/openrouter',
        envVar: 'OPENROUTER_API_KEY',
      },
    };

    return (
      providerConfigs[type as keyof typeof providerConfigs] || {
        name: type.charAt(0).toUpperCase() + type.slice(1),
        defaultModel: `${type}:model`,
        placeholder: `${type}:model-name`,
        docUrl: 'https://www.promptfoo.dev/docs/providers',
        envVar: `${type.toUpperCase()}_API_KEY`,
      }
    );
  };

  const providerInfo = getProviderInfo(providerType);

  if (isBedrock && !bedrockApiMode) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        This Bedrock provider uses a specialized API. Edit its configuration in the YAML editor.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <h3 className="mb-4 text-lg font-semibold">{providerInfo.name} Configuration</h3>

      <div className="rounded-lg border border-border p-4">
        <div className="space-y-2">
          {isBedrock && (
            <div className="mb-4 space-y-2">
              <Label htmlFor="bedrock-api-mode">
                Bedrock API <span className="text-destructive">*</span>
              </Label>
              <select
                id="bedrock-api-mode"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                value={bedrockApiMode}
                aria-describedby="bedrock-api-help"
                onChange={(e) => handleBedrockApiChange(e.target.value as BedrockApiMode)}
              >
                {BEDROCK_API_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <p id="bedrock-api-help" className="text-sm text-muted-foreground">
                {bedrockApiMode && BEDROCK_API_HELP[bedrockApiMode]}{' '}
                {isBedrockHttpApi &&
                  (selectedTarget.config?.apiBaseUrl
                    ? 'Uses your custom endpoint from Advanced Configuration.'
                    : bedrockApiMode === 'messages'
                      ? 'Promptfoo selects Bedrock Mantle or Runtime based on the model ID. You can configure a custom endpoint under Advanced Configuration.'
                      : 'Promptfoo defaults to the Bedrock Mantle endpoint. You can configure a custom endpoint under Advanced Configuration.')}
              </p>
            </div>
          )}

          <Label htmlFor="model-id">
            Model ID <span className="text-destructive">*</span>
          </Label>
          <Input
            id="model-id"
            value={modelId}
            onChange={handleModelIdChange}
            placeholder={providerInfo.placeholder}
            aria-invalid={Boolean(bedrockApiError)}
            aria-describedby={
              isBedrock
                ? bedrockApiError
                  ? 'bedrock-model-help bedrock-model-error'
                  : 'bedrock-model-help'
                : undefined
            }
          />
          {isBedrock && (
            <p id="bedrock-model-help" className="text-sm text-muted-foreground">
              Choose an API, then enter its model ID. GPT names such as <code>gpt-5.6-sol</code> are
              saved with Bedrock's <code>openai.</code> prefix. Full Bedrock model IDs are also
              accepted.
            </p>
          )}
          {bedrockApiError && (
            <p id="bedrock-model-error" role="alert" className="text-sm text-destructive">
              {bedrockApiError}
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {isBedrock
              ? `Provider ID: ${selectedTarget.id || 'bedrock:<model>'}. `
              : 'Specify the model to use. '}
            See{' '}
            <a
              href={providerInfo.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {providerInfo.name} documentation
            </a>{' '}
            for available models.
          </p>
        </div>

        {isBedrock && bedrockApiMode === 'converse' && (
          <SetupSection
            title="MCP Servers"
            description="Configure Model Context Protocol servers for Bedrock Converse tool calling"
            isExpanded={isMcpOpen}
            onExpandedChange={setIsMcpOpen}
            className="mt-4"
          >
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Servers are saved under <code>config.mcp</code> and enabled when at least one server
                is configured.
              </p>
              <Button type="button" variant="outline" onClick={addMCPServer}>
                Add MCP Server
              </Button>

              {(selectedTarget.config?.mcp?.servers || []).map(
                (server: MCPServerConfig, index: number) => (
                  <div key={index} className="space-y-3 rounded-md border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="font-medium">Server {index + 1}</h4>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeMCPServer(index)}
                      >
                        Remove
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`mcp-server-${index}-name`}>Name</Label>
                        <Input
                          id={`mcp-server-${index}-name`}
                          value={server.name || ''}
                          onChange={(e) => updateMCPServer(index, 'name', e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`mcp-server-${index}-command`}>Command</Label>
                        <Input
                          id={`mcp-server-${index}-command`}
                          value={server.command || ''}
                          onChange={(e) =>
                            updateMCPServer(index, 'command', e.target.value || undefined)
                          }
                          placeholder="npx"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`mcp-server-${index}-args`}>Args</Label>
                        <Input
                          id={`mcp-server-${index}-args`}
                          value={(server.args || []).join(', ')}
                          onChange={(e) =>
                            updateMCPServer(
                              index,
                              'args',
                              e.target.value
                                .split(',')
                                .map((arg) => arg.trim())
                                .filter(Boolean),
                            )
                          }
                          placeholder="-y, @modelcontextprotocol/server-filesystem"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`mcp-server-${index}-url`}>URL</Label>
                        <Input
                          id={`mcp-server-${index}-url`}
                          value={server.url || ''}
                          onChange={(e) =>
                            updateMCPServer(index, 'url', e.target.value || undefined)
                          }
                          placeholder="https://example.com/mcp"
                        />
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor={`mcp-server-${index}-path`}>Path</Label>
                        <Input
                          id={`mcp-server-${index}-path`}
                          value={server.path || ''}
                          onChange={(e) =>
                            updateMCPServer(index, 'path', e.target.value || undefined)
                          }
                          placeholder="./mcp-server.js"
                        />
                      </div>
                    </div>
                  </div>
                ),
              )}
            </div>
          </SetupSection>
        )}

        {isBedrock && (
          <SetupSection
            title="Bedrock Settings"
            description="Configure the AWS region and authentication"
            isExpanded={isBedrockSettingsOpen}
            onExpandedChange={setIsBedrockSettingsOpen}
            className="mt-4"
          >
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="bedrock-region">AWS Region</Label>
                <Input
                  id="bedrock-region"
                  value={selectedTarget.config?.region ?? ''}
                  onChange={(e) => updateCustomTarget('region', e.target.value || undefined)}
                  placeholder="Use environment or provider default"
                />
                <p className="text-sm text-muted-foreground">
                  {isBedrockHttpApi ? (
                    <>
                      Overrides <code>AWS_BEDROCK_REGION</code>, <code>AWS_REGION</code>, and{' '}
                      <code>AWS_DEFAULT_REGION</code>. When none is set, the provider uses its
                      model-specific default. Choose a region that supports your model and API.
                    </>
                  ) : (
                    <>
                      Overrides <code>AWS_BEDROCK_REGION</code>; otherwise defaults to{' '}
                      <code>us-east-1</code>. Choose a region that supports your model or inference
                      profile.
                    </>
                  )}
                </p>
              </div>

              <BedrockAuthentication
                config={selectedTarget.config ?? {}}
                isHttpApi={isBedrockHttpApi}
                updateCustomTarget={updateCustomTarget}
              />

              {isBedrockNativeApi && (
                <div className="space-y-2">
                  <Label htmlFor="bedrock-inference-model-type">Inference Model Type</Label>
                  <Input
                    id="bedrock-inference-model-type"
                    value={selectedTarget.config?.inferenceModelType ?? ''}
                    onChange={(e) =>
                      updateCustomTarget('inferenceModelType', e.target.value || undefined)
                    }
                    placeholder="claude, nova, llama, mistral, ..."
                  />
                  <p className="text-sm text-muted-foreground">
                    Required when the model ID is an Application Inference Profile ARN. Otherwise
                    inferred from the model ID.
                  </p>
                </div>
              )}
            </div>
          </SetupSection>
        )}

        <SetupSection
          title="Advanced Configuration"
          description="Model parameters and API settings"
          isExpanded={isAdvancedOpen}
          onExpandedChange={setIsAdvancedOpen}
          className="mt-4"
        >
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor="temperature">Temperature</Label>
              <Input
                id="temperature"
                type="number"
                min={0}
                max={2}
                step={0.1}
                value={selectedTarget.config?.temperature ?? ''}
                onChange={(e) =>
                  updateCustomTarget('temperature', parseFloat(e.target.value) || undefined)
                }
              />
              <p className="text-sm text-muted-foreground">Controls randomness (0.0 to 2.0)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="max-tokens">
                {bedrockApiMode === 'responses' ? 'Max Output Tokens' : 'Max Tokens'}
              </Label>
              <Input
                id="max-tokens"
                type="number"
                min={1}
                value={
                  bedrockApiMode === 'responses'
                    ? (selectedTarget.config?.max_output_tokens ?? '')
                    : (selectedTarget.config?.max_tokens ?? '')
                }
                onChange={(e) =>
                  updateCustomTarget(
                    bedrockApiMode === 'responses' ? 'max_output_tokens' : 'max_tokens',
                    parseInt(e.target.value) || undefined,
                  )
                }
              />
              <p className="text-sm text-muted-foreground">Maximum number of tokens to generate</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="top-p">Top P</Label>
              <Input
                id="top-p"
                type="number"
                min={0}
                max={1}
                step={0.01}
                value={selectedTarget.config?.top_p ?? ''}
                onChange={(e) =>
                  updateCustomTarget('top_p', parseFloat(e.target.value) || undefined)
                }
              />
              <p className="text-sm text-muted-foreground">
                Nucleus sampling parameter (0.0 to 1.0)
              </p>
            </div>

            {!isBedrock && (
              <div className="space-y-2">
                <Label htmlFor="api-key">API Key</Label>
                <Input
                  id="api-key"
                  type="password"
                  value={selectedTarget.config?.apiKey ?? ''}
                  onChange={(e) => updateCustomTarget('apiKey', e.target.value || undefined)}
                />
                <p className="text-sm text-muted-foreground">
                  Optional - defaults to {providerInfo.envVar} environment variable
                </p>
              </div>
            )}

            {(!isBedrock || isBedrockHttpApi) && (
              <div className="space-y-2">
                <Label htmlFor="api-base-url">API Base URL</Label>
                <Input
                  id="api-base-url"
                  type="url"
                  value={selectedTarget.config?.apiBaseUrl ?? ''}
                  onChange={(e) => updateCustomTarget('apiBaseUrl', e.target.value || undefined)}
                  placeholder={
                    isBedrock
                      ? 'Use the provider-selected Bedrock endpoint'
                      : 'https://api.openai.com/v1'
                  }
                />
                <p className="text-sm text-muted-foreground">
                  {isBedrock
                    ? 'Optional override for a trusted proxy or custom endpoint supporting the selected API. Bedrock credentials are sent to this URL.'
                    : 'For proxies, local models (Ollama, LMStudio), or custom API endpoints'}
                </p>
              </div>
            )}
          </div>
        </SetupSection>
      </div>
    </div>
  );
};

export default FoundationModelConfiguration;
