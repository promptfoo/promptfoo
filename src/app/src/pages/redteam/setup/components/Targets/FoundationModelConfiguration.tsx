import React, { useEffect, useState } from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { DEFAULT_OPENAI_TARGET_ID, OPENAI_TARGET_PLACEHOLDER } from '../constants';
import { SetupSection } from '../SetupSection';

import type { ProviderOptions } from '../../types';

interface FoundationModelConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
  providerType: string;
}

type BedrockApiMode = 'invoke' | 'converse';

interface MCPServerConfig {
  name: string;
  command?: string;
  args?: string[];
  path?: string;
  url?: string;
}

const getBedrockApiModeFromId = (id?: string): BedrockApiMode =>
  id?.startsWith('bedrock:converse:') ? 'converse' : 'invoke';

const getBedrockModelFromId = (id?: string): string => {
  if (!id) {
    return '';
  }
  if (id.startsWith('bedrock:converse:')) {
    return id.slice('bedrock:converse:'.length);
  }
  if (id.startsWith('bedrock:')) {
    return id.slice('bedrock:'.length);
  }
  return id;
};

const buildBedrockProviderId = (apiMode: BedrockApiMode, modelId: string): string =>
  apiMode === 'converse' ? `bedrock:converse:${modelId}` : `bedrock:${modelId}`;

const isServerConfigured = (server: MCPServerConfig): boolean =>
  Boolean(server.command || server.path || server.url);

const FoundationModelConfiguration = ({
  selectedTarget,
  updateCustomTarget,
  providerType,
}: FoundationModelConfigurationProps) => {
  const isBedrock = providerType === 'bedrock';
  const bedrockApiMode = getBedrockApiModeFromId(selectedTarget.id);
  const [modelId, setModelId] = useState(
    isBedrock ? getBedrockModelFromId(selectedTarget.id) : selectedTarget.id || '',
  );
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isMcpOpen, setIsMcpOpen] = useState(Boolean(selectedTarget.config?.mcp?.servers?.length));
  const [isBedrockSettingsOpen, setIsBedrockSettingsOpen] = useState(
    isBedrock && Boolean(selectedTarget.config?.region || selectedTarget.config?.profile),
  );

  useEffect(() => {
    setModelId(isBedrock ? getBedrockModelFromId(selectedTarget.id) : selectedTarget.id || '');
  }, [isBedrock, selectedTarget.id]);

  const handleModelIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newId = e.target.value;
    setModelId(newId);
    updateCustomTarget('id', isBedrock ? buildBedrockProviderId(bedrockApiMode, newId) : newId);
  };

  const updateBedrockApiMode = (apiMode: BedrockApiMode) => {
    updateCustomTarget('id', buildBedrockProviderId(apiMode, modelId));
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
    updateMCPServers([...servers, { name: `server-${servers.length + 1}`, args: [] }]);
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
        defaultModel: 'google:gemini-2.5-pro',
        placeholder: 'google:gemini-2.5-pro, google:gemini-2.5-flash',
        docUrl: 'https://www.promptfoo.dev/docs/providers/google',
        envVar: 'GOOGLE_API_KEY | GEMINI_API_KEY | PALM_API_KEY',
      },
      vertex: {
        name: 'Google Vertex AI',
        defaultModel: 'vertex:gemini-2.5-pro',
        placeholder: 'vertex:gemini-2.5-pro, vertex:gemini-2.5-flash',
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
        defaultModel: 'bedrock:anthropic.claude-3-5-sonnet-20241022-v2:0',
        placeholder: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
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
                onChange={(e) => updateBedrockApiMode(e.target.value as BedrockApiMode)}
              >
                <option value="invoke">InvokeModel</option>
                <option value="converse">Converse</option>
              </select>
              <p className="text-sm text-muted-foreground">
                Use Converse for Bedrock-native tool calling and MCP servers. InvokeModel keeps the
                legacy direct model API.
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
          />
          <p className="text-sm text-muted-foreground">
            {isBedrock
              ? `Saved as ${buildBedrockProviderId(bedrockApiMode, modelId || '<model>')}. `
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
            description="AWS region and credential profile (required for non-default-region deployments)"
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
                  placeholder="us-east-1"
                />
                <p className="text-sm text-muted-foreground">
                  Defaults to <code>us-east-1</code> if unset. Set this when using inference
                  profiles or models pinned to a specific region.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bedrock-profile">AWS Profile</Label>
                <Input
                  id="bedrock-profile"
                  value={selectedTarget.config?.profile ?? ''}
                  onChange={(e) => updateCustomTarget('profile', e.target.value || undefined)}
                  placeholder="default"
                />
                <p className="text-sm text-muted-foreground">
                  Optional - SSO profile name from <code>~/.aws/config</code>. Falls back to the
                  default credential chain when unset.
                </p>
              </div>

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
              <Label htmlFor="max-tokens">Max Tokens</Label>
              <Input
                id="max-tokens"
                type="number"
                min={1}
                value={selectedTarget.config?.max_tokens ?? ''}
                onChange={(e) =>
                  updateCustomTarget('max_tokens', parseInt(e.target.value) || undefined)
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

            <div className="space-y-2">
              <Label htmlFor="api-base-url">API Base URL</Label>
              <Input
                id="api-base-url"
                type="url"
                value={selectedTarget.config?.apiBaseUrl ?? ''}
                onChange={(e) => updateCustomTarget('apiBaseUrl', e.target.value || undefined)}
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-sm text-muted-foreground">
                For proxies, local models (Ollama, LMStudio), or custom API endpoints
              </p>
            </div>
          </div>
        </SetupSection>
      </div>
    </div>
  );
};

export default FoundationModelConfiguration;
