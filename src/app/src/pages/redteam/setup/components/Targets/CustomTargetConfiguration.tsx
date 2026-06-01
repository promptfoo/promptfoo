import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import Editor from '@app/components/ui/code-editor';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { HelperText } from '@app/components/ui/helper-text';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import Prism from '@app/lib/prism';
import { cn } from '@app/lib/utils';
import {
  AlertCircle,
  AlignLeft,
  ChevronDown,
  Cloud,
  Code2,
  Eye,
  EyeOff,
  FileCode2,
  Server,
  Terminal,
} from 'lucide-react';

import type { ProviderOptions } from '../../types';

interface CustomTargetConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
  rawConfigJson: string;
  setRawConfigJson: (value: string) => void;
  bodyError: string | React.ReactNode | null;
  providerType?: string;
}

interface ProviderConfig {
  title: string;
  icon: React.ReactNode;
  targetIdLabel: string;
  targetIdPlaceholder: string;
  helpText: React.ReactNode;
  docUrl: string;
  examples: {
    title: string;
    items: Array<{ code: string; description: string }>;
  };
  configExample: Record<string, unknown>;
  configDescription: string;
}

type A2AAuthConfig = {
  type?: 'bearer' | 'basic' | 'api_key' | 'oauth' | 'no_auth';
  token?: string;
  username?: string;
  password?: string;
  keyName?: string;
  value?: string;
  placement?: 'header' | 'query';
  grantType?: 'client_credentials' | 'password';
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string[] | string;
};

type A2AProviderConfig = Record<string, unknown> & {
  url?: string;
  agentCardUrl?: string;
  mode?: 'auto' | 'send' | 'stream';
  tenant?: string;
  protocolVersion?: string;
  auth?: A2AAuthConfig;
};

const A2A_STRUCTURED_CONFIG_KEYS = new Set(['url', 'agentCardUrl', 'auth']);

const asA2AConfig = (config?: ProviderOptions['config']): A2AProviderConfig =>
  (config ?? {}) as A2AProviderConfig;

const getA2AAdvancedConfig = (config?: ProviderOptions['config']): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(config ?? {}).filter(([key]) => !A2A_STRUCTURED_CONFIG_KEYS.has(key)),
  );

const getA2AStructuredConfig = (config?: ProviderOptions['config']): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(config ?? {}).filter(([key]) => A2A_STRUCTURED_CONFIG_KEYS.has(key)),
  );

const parseA2AScopes = (value: string): string[] =>
  value
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);

const highlightJSON = (code: string): string => {
  try {
    const grammar = Prism?.languages?.json;
    if (!grammar) {
      return code;
    }
    return Prism.highlight(code, grammar, 'json');
  } catch {
    return code;
  }
};

const SecretInput = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  helperText,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  required?: boolean;
}) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={isVisible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10"
          autoComplete="off"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setIsVisible((current) => !current)}
              aria-label={isVisible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            >
              {isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isVisible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          </TooltipContent>
        </Tooltip>
      </div>
      {helperText && <p className="text-sm text-muted-foreground">{helperText}</p>}
    </div>
  );
};

const getProviderConfig = (providerType?: string): ProviderConfig => {
  switch (providerType) {
    case 'a2a':
      return {
        title: 'A2A Provider',
        icon: <Server className="size-5 text-primary" />,
        targetIdLabel: 'Provider ID',
        targetIdPlaceholder: 'a2a or a2a:https://agent.example.com/a2a/v1',
        helpText: (
          <>
            Agent2Agent (A2A) HTTP+JSON endpoint configuration. Promptfoo sends test prompts as A2A
            messages and reads final messages, task artifacts, or streaming events.
          </>
        ),
        docUrl: 'https://www.promptfoo.dev/docs/providers/a2a/',
        examples: {
          title: 'A2A Provider Examples',
          items: [
            { code: 'a2a:https://agent.example.com/a2a/v1', description: 'Endpoint shorthand' },
            { code: 'a2a', description: 'Use config.url or config.agentCardUrl' },
          ],
        },
        configExample: {
          url: 'https://agent.example.com/a2a/v1',
          agentCardUrl: 'https://agent.example.com/.well-known/agent-card.json',
          mode: 'auto',
          auth: {
            type: 'bearer',
            token: '{{A2A_API_KEY}}',
          },
          polling: {
            enabled: true,
            intervalMs: 1000,
            timeoutMs: 300000,
          },
        },
        configDescription: 'A2A endpoint, Agent Card discovery, headers, and task polling',
      };

    case 'python':
      return {
        title: 'Python Provider',
        icon: <FileCode2 className="size-5 text-primary" />,
        targetIdLabel: 'Python File Path',
        targetIdPlaceholder: './my_provider.py or ./my_provider.py:call_api',
        helpText: (
          <>
            Path to your Python file that implements the provider. Optionally specify a function
            name after a colon.
          </>
        ),
        docUrl: 'https://www.promptfoo.dev/docs/providers/python/',
        examples: {
          title: 'Python Provider Examples',
          items: [
            { code: './provider.py', description: 'Uses default call_api function' },
            { code: './provider.py:my_function', description: 'Uses custom function name' },
            { code: '/absolute/path/to/provider.py', description: 'Absolute path' },
          ],
        },
        configExample: {
          pythonExecutable: '/usr/bin/python3',
          timeout: 30000,
        },
        configDescription: 'Python executable path and timeout settings',
      };

    case 'javascript':
      return {
        title: 'JavaScript Provider',
        icon: <FileCode2 className="size-5 text-primary" />,
        targetIdLabel: 'JavaScript File Path',
        targetIdPlaceholder: './my_provider.js or ./my_provider.js:callApi',
        helpText: (
          <>
            Path to your JavaScript/TypeScript file that exports a provider function. Optionally
            specify an export name after a colon.
          </>
        ),
        docUrl: 'https://www.promptfoo.dev/docs/providers/custom-api/',
        examples: {
          title: 'JavaScript Provider Examples',
          items: [
            { code: './provider.js', description: 'Uses default export' },
            { code: './provider.js:callApi', description: 'Uses named export' },
            { code: './provider.ts', description: 'TypeScript file' },
          ],
        },
        configExample: {
          timeout: 30000,
          env: {
            API_KEY: '{{MY_API_KEY}}',
          },
        },
        configDescription: 'Environment variables and timeout settings',
      };

    case 'go':
      return {
        title: 'Go Provider',
        icon: <FileCode2 className="size-5 text-primary" />,
        targetIdLabel: 'Go Executable Path',
        targetIdPlaceholder: './my_provider (compiled Go binary)',
        helpText: (
          <>
            Path to your compiled Go binary that implements the provider interface. The binary
            should accept prompts via stdin and output responses to stdout.
          </>
        ),
        docUrl: 'https://www.promptfoo.dev/docs/providers/custom-api/',
        examples: {
          title: 'Go Provider Examples',
          items: [
            { code: './my-provider', description: 'Compiled Go binary' },
            { code: '/usr/local/bin/my-provider', description: 'Absolute path to binary' },
          ],
        },
        configExample: {
          timeout: 30000,
          args: ['--model', 'gpt-4'],
        },
        configDescription: 'Command-line arguments and timeout',
      };

    case 'exec':
      return {
        title: 'Executable Provider',
        icon: <Terminal className="size-5 text-primary" />,
        targetIdLabel: 'Command',
        targetIdPlaceholder: 'exec:./my_script.sh or exec:python script.py',
        helpText: (
          <>
            Execute any command as a provider. The command receives the prompt via stdin and should
            output the response to stdout.
          </>
        ),
        docUrl: 'https://www.promptfoo.dev/docs/providers/custom-script/',
        examples: {
          title: 'Exec Provider Examples',
          items: [
            { code: 'exec:./my_script.sh', description: 'Shell script' },
            { code: 'exec:python3 inference.py', description: 'Python script with interpreter' },
            { code: 'exec:node handler.js', description: 'Node.js script' },
          ],
        },
        configExample: {
          timeout: 60000,
          env: {
            MODEL_PATH: '/models/llama',
          },
        },
        configDescription: 'Environment variables and timeout for the command',
      };

    case 'mcp':
      return {
        title: 'MCP Provider',
        icon: <Server className="size-5 text-primary" />,
        targetIdLabel: 'MCP Server Configuration',
        targetIdPlaceholder: 'mcp:server-name',
        helpText: (
          <>
            Model Context Protocol (MCP) server configuration. Connect to MCP-compatible servers for
            tool use and context management.
          </>
        ),
        docUrl: 'https://www.promptfoo.dev/docs/providers/mcp/',
        examples: {
          title: 'MCP Provider Examples',
          items: [
            { code: 'mcp:my-server', description: 'Connect to MCP server' },
            { code: 'mcp:filesystem', description: 'Filesystem MCP server' },
          ],
        },
        configExample: {
          serverPath: './mcp-server',
          args: ['--port', '3000'],
        },
        configDescription: 'MCP server path and arguments',
      };

    // Cloud providers
    case 'bedrock':
      return {
        title: 'AWS Bedrock',
        icon: <Cloud className="size-5 text-primary" />,
        targetIdLabel: 'Model ID',
        targetIdPlaceholder: 'bedrock:anthropic.claude-3-sonnet-20240229-v1:0',
        helpText: <>AWS Bedrock model identifier. Requires AWS credentials configured.</>,
        docUrl: 'https://www.promptfoo.dev/docs/providers/aws-bedrock/',
        examples: {
          title: 'Bedrock Model Examples',
          items: [
            {
              code: 'bedrock:anthropic.claude-3-sonnet-20240229-v1:0',
              description: 'Claude 3 Sonnet',
            },
            { code: 'bedrock:amazon.titan-text-express-v1', description: 'Amazon Titan' },
            { code: 'bedrock:meta.llama3-70b-instruct-v1:0', description: 'Llama 3' },
          ],
        },
        configExample: {
          region: 'us-east-1',
          temperature: 0.7,
          max_tokens: 1024,
        },
        configDescription: 'AWS region and model parameters',
      };

    case 'sagemaker':
      return {
        title: 'AWS SageMaker',
        icon: <Cloud className="size-5 text-primary" />,
        targetIdLabel: 'Endpoint Name',
        targetIdPlaceholder: 'sagemaker:my-endpoint-name',
        helpText: <>SageMaker endpoint name. Requires AWS credentials configured.</>,
        docUrl: 'https://www.promptfoo.dev/docs/providers/aws-bedrock/#sagemaker',
        examples: {
          title: 'SageMaker Examples',
          items: [
            { code: 'sagemaker:my-llm-endpoint', description: 'Custom endpoint' },
            { code: 'sagemaker:huggingface-llm', description: 'HuggingFace endpoint' },
          ],
        },
        configExample: {
          region: 'us-west-2',
          modelKwargs: {
            temperature: 0.7,
          },
        },
        configDescription: 'AWS region and model parameters',
      };

    // Local model providers
    case 'ollama':
      return {
        title: 'Ollama',
        icon: <Server className="size-5 text-primary" />,
        targetIdLabel: 'Model Name',
        targetIdPlaceholder: 'ollama:llama3.2 or ollama:chat:mistral',
        helpText: <>Ollama model name. Make sure Ollama is running locally.</>,
        docUrl: 'https://www.promptfoo.dev/docs/providers/ollama/',
        examples: {
          title: 'Ollama Model Examples',
          items: [
            { code: 'ollama:llama3.2', description: 'Llama 3.2 (completion)' },
            { code: 'ollama:chat:llama3.2', description: 'Llama 3.2 (chat)' },
            { code: 'ollama:mistral', description: 'Mistral' },
            { code: 'ollama:codellama', description: 'Code Llama' },
          ],
        },
        configExample: {
          baseUrl: 'http://localhost:11434',
          temperature: 0.7,
          num_predict: 1024,
        },
        configDescription: 'Ollama server URL and model parameters',
      };

    case 'vllm':
      return {
        title: 'vLLM',
        icon: <Server className="size-5 text-primary" />,
        targetIdLabel: 'Model Path',
        targetIdPlaceholder: 'vllm:meta-llama/Llama-2-7b-hf',
        helpText: <>vLLM model path. Can be a HuggingFace model ID or local path.</>,
        docUrl: 'https://www.promptfoo.dev/docs/providers/vllm/',
        examples: {
          title: 'vLLM Model Examples',
          items: [
            { code: 'vllm:meta-llama/Llama-2-7b-hf', description: 'HuggingFace model' },
            { code: 'vllm:/path/to/model', description: 'Local model path' },
          ],
        },
        configExample: {
          baseUrl: 'http://localhost:8000',
          temperature: 0.7,
          max_tokens: 1024,
        },
        configDescription: 'vLLM server URL and generation parameters',
      };

    case 'localai':
      return {
        title: 'LocalAI',
        icon: <Server className="size-5 text-primary" />,
        targetIdLabel: 'Model Name',
        targetIdPlaceholder: 'localai:gpt4all-j',
        helpText: <>LocalAI model name. Ensure LocalAI server is running.</>,
        docUrl: 'https://www.promptfoo.dev/docs/providers/localai/',
        examples: {
          title: 'LocalAI Model Examples',
          items: [
            { code: 'localai:gpt4all-j', description: 'GPT4All-J' },
            { code: 'localai:ggml-gpt4all-j', description: 'GGML model' },
          ],
        },
        configExample: {
          baseUrl: 'http://localhost:8080',
          temperature: 0.7,
        },
        configDescription: 'LocalAI server URL and parameters',
      };

    case 'llamafile':
    case 'llama.cpp':
      return {
        title: providerType === 'llamafile' ? 'Llamafile' : 'llama.cpp',
        icon: <Server className="size-5 text-primary" />,
        targetIdLabel: 'Server URL',
        targetIdPlaceholder: `${providerType}:http://localhost:8080`,
        helpText: (
          <>
            {providerType === 'llamafile' ? 'Llamafile' : 'llama.cpp'} server URL. Start the server
            first.
          </>
        ),
        docUrl: 'https://www.promptfoo.dev/docs/providers/llama.cpp/',
        examples: {
          title: `${providerType === 'llamafile' ? 'Llamafile' : 'llama.cpp'} Examples`,
          items: [
            { code: `${providerType}:http://localhost:8080`, description: 'Default local server' },
            { code: `${providerType}:http://192.168.1.100:8080`, description: 'Remote server' },
          ],
        },
        configExample: {
          temperature: 0.7,
          n_predict: 1024,
        },
        configDescription: 'Generation parameters',
      };

    // Default fallback for custom and other providers
    default:
      return {
        title: 'Custom Target Configuration',
        icon: <FileCode2 className="size-5 text-primary" />,
        targetIdLabel: 'Target ID',
        targetIdPlaceholder: 'e.g., openai:chat:gpt-4o or ./my-provider.py',
        helpText: (
          <>
            The configuration string for your custom target. See{' '}
            <a
              href="https://www.promptfoo.dev/docs/red-team/configuration/#custom-providerstargets"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              Custom target documentation
            </a>{' '}
            for more information.
          </>
        ),
        docUrl: 'https://www.promptfoo.dev/docs/red-team/configuration/#custom-providerstargets',
        examples: {
          title: 'Provider String Examples',
          items: [
            { code: 'openai:chat:gpt-4o', description: 'OpenAI model' },
            { code: './provider.py', description: 'Local Python script' },
            { code: './provider.js:myFunction', description: 'JavaScript with custom function' },
          ],
        },
        configExample: {
          temperature: 0.7,
          max_tokens: 1024,
          apiKey: '{{OPENAI_API_KEY}}',
        },
        configDescription: 'Optional JSON configuration (API keys, model parameters, etc.)',
      };
  }
};

const CustomTargetConfiguration = ({
  selectedTarget,
  updateCustomTarget,
  rawConfigJson,
  setRawConfigJson,
  bodyError,
  providerType,
}: CustomTargetConfigurationProps) => {
  const [targetId, setTargetId] = useState(selectedTarget.id?.replace('file://', '') || '');
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [advancedConfigError, setAdvancedConfigError] = useState<string | null>(null);
  const initializedA2ATargetId = useRef<string | null>(null);

  const config = useMemo(() => getProviderConfig(providerType), [providerType]);
  const a2aConfig = asA2AConfig(selectedTarget.config);

  useEffect(() => {
    setTargetId(selectedTarget.id?.replace('file://', '') || '');
  }, [selectedTarget.id]);

  useEffect(() => {
    if (providerType === 'a2a') {
      const targetKey = selectedTarget.id ?? '';

      if (initializedA2ATargetId.current === targetKey) {
        return;
      }

      initializedA2ATargetId.current = targetKey;
      setRawConfigJson(JSON.stringify(getA2AAdvancedConfig(selectedTarget.config), null, 2));
      setAdvancedConfigError(null);
      return;
    }

    initializedA2ATargetId.current = null;
  }, [providerType, selectedTarget.config, selectedTarget.id, setRawConfigJson]);

  const handleTargetIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTargetId(value);

    let idToSave = value;
    if (
      value &&
      !value.startsWith('file://') &&
      !value.startsWith('http://') &&
      !value.startsWith('https://') &&
      (value.includes('.py') || value.includes('.js'))
    ) {
      idToSave = `file://${value}`;
    }
    updateCustomTarget('id', idToSave);
  };

  const handleA2AAdvancedConfigChange = (content: string) => {
    setRawConfigJson(content);

    try {
      const parsedConfig = JSON.parse(content);

      if (
        typeof parsedConfig !== 'object' ||
        parsedConfig === null ||
        Array.isArray(parsedConfig)
      ) {
        setAdvancedConfigError('Advanced configuration must be a JSON object');
        return;
      }

      setAdvancedConfigError(null);
      updateCustomTarget('config', {
        ...parsedConfig,
        ...getA2AStructuredConfig(selectedTarget.config),
      });
    } catch {
      setAdvancedConfigError('Invalid JSON configuration');
    }
  };

  const handleConfigChange = (content: string) => {
    if (providerType === 'a2a') {
      handleA2AAdvancedConfigChange(content);
      return;
    }

    setRawConfigJson(content);
    try {
      const parsedConfig = JSON.parse(content);
      updateCustomTarget('config', parsedConfig);
    } catch (error) {
      // Allow invalid JSON while typing - error is shown via bodyError prop
      console.error('Invalid JSON configuration:', error);
    }
  };

  const handleFormatJson = () => {
    if (rawConfigJson.trim()) {
      try {
        const parsed = JSON.parse(rawConfigJson);
        const formatted = JSON.stringify(parsed, null, 2);
        setRawConfigJson(formatted);
        if (providerType === 'a2a') {
          updateCustomTarget('config', {
            ...parsed,
            ...getA2AStructuredConfig(selectedTarget.config),
          });
          setAdvancedConfigError(null);
        } else {
          updateCustomTarget('config', parsed);
        }
      } catch {
        // Error state is already shown via bodyError prop
      }
    }
  };

  const updateA2AField = (field: string, value: unknown) => {
    updateCustomTarget(field, value);
  };

  const updateA2AAuth = (auth: A2AAuthConfig | undefined) => {
    updateCustomTarget('auth', auth);
  };

  const updateA2AAuthField = (field: keyof A2AAuthConfig, value: unknown) => {
    updateA2AAuth({
      ...(a2aConfig.auth ?? {}),
      [field]: value,
    });
  };

  const handleA2AAuthTypeChange = (value: string) => {
    switch (value) {
      case 'bearer':
        updateA2AAuth({ type: 'bearer', token: '' });
        break;
      case 'basic':
        updateA2AAuth({ type: 'basic', username: '', password: '' });
        break;
      case 'api_key':
        updateA2AAuth({ type: 'api_key', keyName: 'X-API-Key', placement: 'header', value: '' });
        break;
      case 'oauth':
        updateA2AAuth({
          type: 'oauth',
          grantType: 'client_credentials',
          tokenUrl: '',
          clientId: '',
          clientSecret: '',
          scopes: [],
        });
        break;
      default:
        updateA2AAuth(undefined);
    }
  };

  const handleA2AOAuthGrantTypeChange = (grantType: 'client_credentials' | 'password') => {
    const currentAuth = a2aConfig.auth ?? {};

    if (grantType === 'password') {
      updateA2AAuth({
        ...currentAuth,
        type: 'oauth',
        grantType,
        username: currentAuth.username ?? '',
        password: currentAuth.password ?? '',
      });
      return;
    }

    const { username: _username, password: _password, ...authWithoutPassword } = currentAuth;
    updateA2AAuth({
      ...authWithoutPassword,
      type: 'oauth',
      grantType,
    });
  };

  const renderA2AAuthFields = () => {
    const auth = a2aConfig.auth;

    return (
      <div className="mt-6 space-y-4 rounded-lg border border-border p-4">
        <div>
          <h4 className="font-medium">Authorization</h4>
          <p className="text-sm text-muted-foreground">
            Configure common A2A authentication without manually editing headers.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="a2a-auth-type">Authentication Type</Label>
          <Select value={auth?.type ?? 'no_auth'} onValueChange={handleA2AAuthTypeChange}>
            <SelectTrigger id="a2a-auth-type">
              <SelectValue placeholder="Select authentication type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="no_auth">No Auth</SelectItem>
              <SelectItem value="bearer">Bearer Token</SelectItem>
              <SelectItem value="basic">Basic Auth</SelectItem>
              <SelectItem value="api_key">API Key</SelectItem>
              <SelectItem value="oauth">OAuth 2.0</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {auth?.type === 'bearer' && (
          <SecretInput
            id="a2a-bearer-token"
            label="Bearer Token"
            value={auth.token ?? ''}
            onChange={(value) => updateA2AAuthField('token', value)}
            placeholder="{{A2A_API_KEY}}"
            helperText="Sent as an Authorization: Bearer header."
            required
          />
        )}

        {auth?.type === 'basic' && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="a2a-basic-username">
                Username <span className="text-destructive">*</span>
              </Label>
              <Input
                id="a2a-basic-username"
                value={auth.username ?? ''}
                onChange={(e) => updateA2AAuthField('username', e.target.value)}
              />
            </div>
            <SecretInput
              id="a2a-basic-password"
              label="Password"
              value={auth.password ?? ''}
              onChange={(value) => updateA2AAuthField('password', value)}
              required
            />
          </div>
        )}

        {auth?.type === 'api_key' && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="a2a-api-key-placement">Placement</Label>
              <Select
                value={auth.placement ?? 'header'}
                onValueChange={(value) => updateA2AAuthField('placement', value)}
              >
                <SelectTrigger id="a2a-api-key-placement">
                  <SelectValue placeholder="Select placement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="header">Header</SelectItem>
                  <SelectItem value="query">Query Parameter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="a2a-api-key-name">
                Key Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="a2a-api-key-name"
                value={auth.keyName ?? 'X-API-Key'}
                onChange={(e) => updateA2AAuthField('keyName', e.target.value)}
                placeholder={auth.placement === 'query' ? 'api_key' : 'X-API-Key'}
              />
            </div>
            <SecretInput
              id="a2a-api-key-value"
              label="API Key Value"
              value={auth.value ?? ''}
              onChange={(value) => updateA2AAuthField('value', value)}
              placeholder="{{A2A_API_KEY}}"
              required
            />
          </div>
        )}

        {auth?.type === 'oauth' && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="a2a-oauth-grant-type">Grant Type</Label>
                <Select
                  value={auth.grantType ?? 'client_credentials'}
                  onValueChange={(value) =>
                    handleA2AOAuthGrantTypeChange(value as 'client_credentials' | 'password')
                  }
                >
                  <SelectTrigger id="a2a-oauth-grant-type">
                    <SelectValue placeholder="Select grant type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client_credentials">Client Credentials</SelectItem>
                    <SelectItem value="password">Username & Password</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="a2a-oauth-token-url">Token URL</Label>
                <Input
                  id="a2a-oauth-token-url"
                  value={auth.tokenUrl ?? ''}
                  onChange={(e) => updateA2AAuthField('tokenUrl', e.target.value)}
                  placeholder="https://agent.example.com/oauth/token"
                />
                <p className="text-sm text-muted-foreground">
                  Optional when the Agent Card exposes an auth realm that supports discovery.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="a2a-oauth-client-id">Client ID</Label>
                <Input
                  id="a2a-oauth-client-id"
                  value={auth.clientId ?? ''}
                  onChange={(e) => updateA2AAuthField('clientId', e.target.value)}
                  placeholder="{{A2A_CLIENT_ID}}"
                />
              </div>
              <SecretInput
                id="a2a-oauth-client-secret"
                label="Client Secret"
                value={auth.clientSecret ?? ''}
                onChange={(value) => updateA2AAuthField('clientSecret', value)}
                placeholder="{{A2A_CLIENT_SECRET}}"
              />
            </div>
            {auth.grantType === 'password' && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="a2a-oauth-username">
                    Username <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="a2a-oauth-username"
                    value={auth.username ?? ''}
                    onChange={(e) => updateA2AAuthField('username', e.target.value)}
                  />
                </div>
                <SecretInput
                  id="a2a-oauth-password"
                  label="Password"
                  value={auth.password ?? ''}
                  onChange={(value) => updateA2AAuthField('password', value)}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="a2a-oauth-scopes">Scopes</Label>
              <Input
                id="a2a-oauth-scopes"
                value={Array.isArray(auth.scopes) ? auth.scopes.join(', ') : (auth.scopes ?? '')}
                onChange={(e) => updateA2AAuthField('scopes', parseA2AScopes(e.target.value))}
                placeholder="agent:invoke, tasks:read"
              />
              <p className="text-sm text-muted-foreground">Comma-separated OAuth scopes.</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mt-4">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        {config.icon}
        {config.title}
      </h3>

      <div className="rounded-lg border border-border p-4">
        {/* Target ID Section */}
        <div className="space-y-2">
          <Label htmlFor="target-id">
            {config.targetIdLabel} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="target-id"
            value={targetId}
            onChange={handleTargetIdChange}
            placeholder={config.targetIdPlaceholder}
          />
          <p className="text-sm text-muted-foreground">
            {config.helpText}{' '}
            {providerType && providerType !== 'custom' && (
              <>
                See{' '}
                <a
                  href={config.docUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  documentation
                </a>
                .
              </>
            )}
          </p>
        </div>

        {providerType === 'a2a' && (
          <>
            <div className="mt-6 space-y-4 rounded-lg border border-border p-4">
              <div>
                <h4 className="font-medium">Connection</h4>
                <p className="text-sm text-muted-foreground">
                  Start with an Agent Card when available. Use an endpoint URL only to override
                  discovery or connect directly.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="a2a-agent-card-url">Agent Card URL</Label>
                  <Input
                    id="a2a-agent-card-url"
                    value={a2aConfig.agentCardUrl ?? ''}
                    onChange={(e) => updateA2AField('agentCardUrl', e.target.value)}
                    placeholder="https://agent.example.com/.well-known/agent-card.json"
                  />
                  <p className="text-sm text-muted-foreground">
                    Recommended. Used to discover the HTTP+JSON endpoint, tenant, and protocol
                    version.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="a2a-url">A2A Endpoint URL</Label>
                  <Input
                    id="a2a-url"
                    value={a2aConfig.url ?? ''}
                    onChange={(e) => updateA2AField('url', e.target.value)}
                    placeholder="https://agent.example.com/a2a/v1"
                  />
                  <p className="text-sm text-muted-foreground">
                    Optional override. Used for /message:send, /message:stream, and task polling.
                  </p>
                </div>
              </div>
            </div>

            {renderA2AAuthFields()}
          </>
        )}

        {/* Custom Configuration Section */}
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="config-json">
              {providerType === 'a2a' ? 'Advanced Configuration (JSON)' : 'Configuration (JSON)'}
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleFormatJson}
                  disabled={
                    !rawConfigJson.trim() ||
                    !!bodyError ||
                    (providerType === 'a2a' && !!advancedConfigError)
                  }
                  className="h-7 px-2"
                >
                  <AlignLeft className="size-4" />
                  <span className="ml-1 text-xs">Format</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {bodyError || advancedConfigError ? 'Fix JSON errors first' : 'Format JSON'}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Documentation Collapsible */}
          <Collapsible
            open={docsExpanded}
            onOpenChange={setDocsExpanded}
            className="rounded-lg border border-border"
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted data-[state=open]:rounded-b-none">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Code2 className="size-4" />
                Examples
              </span>
              <ChevronDown
                className={cn(
                  'size-4 text-muted-foreground transition-transform',
                  docsExpanded && 'rotate-180',
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-3 border-t border-border p-3">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {config.examples.title}
                  </p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    {config.examples.items.map((item, index) => (
                      <li key={index}>
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{item.code}</code>{' '}
                        - {item.description}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    JSON Config Example
                  </p>
                  <pre className="rounded bg-muted p-2 text-xs">
                    {JSON.stringify(config.configExample, null, 2)}
                  </pre>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* JSON Editor */}
          <div
            className={cn(
              'overflow-hidden rounded-lg border',
              bodyError || advancedConfigError ? 'border-destructive' : 'border-border',
            )}
          >
            <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
              <span className="text-xs text-muted-foreground">JSON</span>
            </div>
            <div className="bg-white dark:bg-zinc-950">
              <Editor
                value={rawConfigJson}
                onValueChange={handleConfigChange}
                highlight={highlightJSON}
                padding={12}
                placeholder={
                  providerType === 'a2a'
                    ? JSON.stringify(
                        {
                          mode: 'auto',
                          tenant: 'optional-tenant',
                          protocolVersion: '1.0',
                          polling: {
                            enabled: true,
                            intervalMs: 1000,
                            timeoutMs: 300000,
                          },
                          headers: {
                            'X-Custom-Header': '{{value}}',
                          },
                          message: {
                            role: 'user',
                            parts: [{ kind: 'text', text: '{{prompt}}' }],
                          },
                          transformResponse:
                            'return result.output || result.message || JSON.stringify(result.raw);',
                        },
                        null,
                        2,
                      )
                    : JSON.stringify(config.configExample, null, 2)
                }
                style={{
                  fontFamily: 'ui-monospace, "Fira Code", monospace',
                  fontSize: 13,
                  minHeight: '120px',
                }}
              />
            </div>
          </div>

          {bodyError || advancedConfigError ? (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="size-4" />
              <AlertContent>
                <AlertDescription>{bodyError || advancedConfigError}</AlertDescription>
              </AlertContent>
            </Alert>
          ) : providerType === 'a2a' ? (
            <HelperText>
              Optional JSON merged with the fields above. Use it for headers, custom message
              templates, mode, tenant, protocol version, polling, timeouts, and transformResponse.
            </HelperText>
          ) : (
            <p className="text-sm text-muted-foreground">{config.configDescription}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomTargetConfiguration;
