import 'prismjs/components/prism-json';

import React, { useEffect, useMemo, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import {
  AlertCircle,
  AlignLeft,
  ChevronDown,
  Cloud,
  Code2,
  FileCode2,
  Server,
  Terminal,
} from 'lucide-react';
import Prism from 'prismjs';
import Editor from 'react-simple-code-editor';

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

const getProviderConfig = (providerType?: string): ProviderConfig => {
  switch (providerType) {
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
              Custom Targets documentation
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

  const config = useMemo(() => getProviderConfig(providerType), [providerType]);

  useEffect(() => {
    setTargetId(selectedTarget.id?.replace('file://', '') || '');
  }, [selectedTarget.id]);

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

  const handleConfigChange = (content: string) => {
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
        updateCustomTarget('config', parsed);
      } catch {
        // Error state is already shown via bodyError prop
      }
    }
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

        {/* Custom Configuration Section */}
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="config-json">Configuration (JSON)</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleFormatJson}
                  disabled={!rawConfigJson.trim() || !!bodyError}
                  className="h-7 px-2"
                >
                  <AlignLeft className="size-4" />
                  <span className="ml-1 text-xs">Format</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{bodyError ? 'Fix JSON errors first' : 'Format JSON'}</TooltipContent>
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
              bodyError ? 'border-destructive' : 'border-border',
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
                placeholder={JSON.stringify(config.configExample, null, 2)}
                style={{
                  fontFamily: 'ui-monospace, "Fira Code", monospace',
                  fontSize: 13,
                  minHeight: '120px',
                }}
              />
            </div>
          </div>

          {bodyError ? (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="size-4" />
              <AlertContent>
                <AlertDescription>{bodyError}</AlertDescription>
              </AlertContent>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">{config.configDescription}</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CustomTargetConfiguration;
