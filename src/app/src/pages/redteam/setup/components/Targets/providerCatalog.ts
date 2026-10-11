import {
  DEFAULT_BEDROCK_TARGET_ID,
  DEFAULT_GOOGLE_TARGET_ID,
  DEFAULT_OPENAI_TARGET_ID,
  DEFAULT_VERTEX_TARGET_ID,
} from '../constants';
import { DEFAULT_WEBSOCKET_TIMEOUT_MS, DEFAULT_WEBSOCKET_TRANSFORM_RESPONSE } from './consts';
import { getLocalProviderConfig, getProviderType, isLocalOpenAiProviderType } from './helpers';
import { getProviderDocumentationUrl } from './providerDocumentationMap';

import type { ProviderOptions } from '../../types';

type ProviderEditorKind =
  | 'custom'
  | 'foundation'
  | 'agent'
  | 'http'
  | 'websocket'
  | 'browser'
  | 'a2a'
  | 'codex-security';
interface ProviderTypeOption {
  value: string;
  label: string;
  description: string;
  tag: 'app' | 'agents' | 'providers' | 'local';
  recommended?: boolean;
  last?: boolean;
  defaultId: string;
  createConfig?: () => ProviderOptions['config'];
  defaultLabel?: string;
  editor: ProviderEditorKind;
  fileAliases?: string[];
}
// Priority order for the most important providers (shown first in this exact order)
const priorityOrder = [
  // Most common ways to test your own application
  'http',
  'a2a',
  'python',
  'javascript',
  // Most popular AI providers (direct API access)
  'openai',
  'anthropic',
  'google',
];

const providerCatalog: ProviderTypeOption[] = [
  {
    value: 'http',
    label: 'HTTP/HTTPS Endpoint',
    description: 'Connect to your REST API or HTTP endpoint',
    tag: 'app',
    recommended: true,
    defaultId: 'http',
    createConfig: () => ({
      url: '',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: '{{prompt}}',
      }),
      stateful: true,
    }),
    editor: 'http',
  },
  {
    value: 'websocket',
    label: 'WebSocket',
    description: 'Real-time WebSocket connections',
    tag: 'app',
    defaultId: 'websocket',
    createConfig: () => ({
      type: 'websocket',
      url: 'wss://example.com/ws',
      messageTemplate: '{"message": {{prompt | dump}}}',
      transformResponse: DEFAULT_WEBSOCKET_TRANSFORM_RESPONSE,
      timeoutMs: DEFAULT_WEBSOCKET_TIMEOUT_MS,
      stateful: true,
    }),
    editor: 'websocket',
  },
  {
    value: 'a2a',
    label: 'A2A Agent',
    description: 'Connect to Agent2Agent HTTP+JSON agents',
    tag: 'agents',
    recommended: true,
    defaultId: 'a2a',
    createConfig: () => ({
      url: '',
    }),
    editor: 'a2a',
  },
  {
    value: 'python',
    label: 'Python',
    description: 'Custom Python script or integration',
    tag: 'app',
    recommended: true,
    defaultId: 'file:///path/to/custom_provider.py',
    editor: 'custom',
  },
  {
    value: 'javascript',
    label: 'JavaScript / TypeScript',
    description: 'Custom JS/TS script or integration',
    tag: 'app',
    recommended: true,
    defaultId: 'file:///path/to/custom_provider.js',
    editor: 'custom',
  },
  {
    value: 'go',
    label: 'Go',
    description: 'Custom Go integration',
    tag: 'app',
    defaultId: 'file:///path/to/your/script.go',
    editor: 'custom',
  },
  {
    value: 'exec',
    label: 'Shell Command',
    description: 'Execute shell scripts or CLI commands',
    tag: 'app',
    defaultId: 'exec:/path/to/script.sh',
    editor: 'custom',
  },
  {
    value: 'browser',
    label: 'Browser Automation',
    description: 'Test web apps via browser automation',
    tag: 'app',
    defaultId: 'browser',
    createConfig: () => ({
      steps: [
        {
          action: 'navigate',
          args: { url: 'https://example.com' },
        },
      ],
    }),
    editor: 'browser',
  },
  {
    value: 'custom',
    label: 'Custom Target',
    description: 'Any other target via a custom provider',
    tag: 'app',
    last: true,
    defaultId: '',
    editor: 'custom',
  },
  {
    value: 'claude-agent-sdk',
    label: 'Claude Agent SDK',
    description: "Anthropic's official SDK for building agents",
    tag: 'agents',
    recommended: true,
    defaultId: 'file:///path/to/claude_agent.py',
    editor: 'custom',
  },
  {
    value: 'openinterpreter',
    label: 'Open Interpreter',
    description: 'Local coding agent with sandbox and approval controls',
    tag: 'agents',
    defaultId: 'openinterpreter',
    editor: 'custom',
  },
  {
    value: 'openai-agents-sdk',
    label: 'OpenAI Agents SDK',
    description: "OpenAI's official agent framework",
    tag: 'agents',
    recommended: true,
    defaultId: 'file:///path/to/openai_agents.py',
    editor: 'agent',
    fileAliases: ['openai_agents', 'openai-agents'],
  },
  {
    value: 'codex-security',
    label: 'Codex Security SDK',
    description: 'Evaluate security scans, finding validation, model reasoning, and cost',
    tag: 'agents',
    recommended: true,
    defaultId: 'openai:codex-security:gpt-5.6-luna',
    createConfig: () => ({
      operation: 'security-scan',
      repository: '',
      auth: 'auto',
      model_reasoning_effort: 'high',
      max_cost_usd: 1,
    }),
    defaultLabel: 'Codex Security SDK',
    editor: 'codex-security',
  },
  {
    value: 'langchain',
    label: 'LangChain',
    description: 'Popular framework for LLM applications',
    tag: 'agents',
    defaultId: 'file:///path/to/langchain_agent.py',
    editor: 'agent',
  },
  {
    value: 'langgraph',
    label: 'LangGraph',
    description: 'Stateful, multi-actor agent applications',
    tag: 'agents',
    defaultId: 'file:///path/to/langgraph_agent.py',
    editor: 'agent',
  },
  {
    value: 'crewai',
    label: 'CrewAI',
    description: 'Multi-agent orchestration framework',
    tag: 'agents',
    defaultId: 'file:///path/to/crewai_agent.py',
    editor: 'agent',
  },
  {
    value: 'autogen',
    label: 'AutoGen',
    description: "Microsoft's multi-agent framework",
    tag: 'agents',
    defaultId: 'file:///path/to/autogen_agent.py',
    editor: 'agent',
  },
  {
    value: 'pydantic-ai',
    label: 'PydanticAI',
    description: 'Type-safe agents with structured outputs',
    tag: 'agents',
    defaultId: 'file:///path/to/pydantic_ai_agent.py',
    editor: 'agent',
    fileAliases: ['pydantic_ai', 'pydantic-ai'],
  },
  {
    value: 'llamaindex',
    label: 'LlamaIndex',
    description: 'RAG and data framework for LLM apps',
    tag: 'agents',
    defaultId: 'file:///path/to/llamaindex_agent.py',
    editor: 'agent',
  },
  {
    value: 'google-adk',
    label: 'Google ADK',
    description: 'Google AI Development Kit',
    tag: 'agents',
    defaultId: 'file:///path/to/google_adk_agent.py',
    editor: 'agent',
    fileAliases: ['google_adk', 'google-adk'],
  },
  {
    value: 'bedrock-agent',
    label: 'AWS Bedrock Agents',
    description: "Amazon's agent orchestration service",
    tag: 'agents',
    defaultId: 'bedrock-agent:your-agent-id',
    createConfig: () => ({ agentAliasId: 'your-agent-alias-id' }),
    editor: 'custom',
  },
  {
    value: 'mcp',
    label: 'MCP Server',
    description: 'Model Context Protocol for tool use',
    tag: 'agents',
    defaultId: 'mcp',
    createConfig: () => ({
      enabled: true,
      verbose: false,
    }),
    editor: 'custom',
  },
  {
    value: 'generic-agent',
    label: 'Other Agent Framework',
    description: 'Any other agent framework via custom provider',
    tag: 'agents',
    last: true,
    defaultId: 'file:///path/to/custom_agent.py',
    editor: 'agent',
  },
  {
    value: 'openai',
    label: 'OpenAI',
    description: 'GPT-6.1 Sol, GPT-6 Luna and Astra, and GPT-5.6 Terra',
    tag: 'providers',
    recommended: true,
    defaultId: DEFAULT_OPENAI_TARGET_ID,
    editor: 'foundation',
  },
  {
    value: 'anthropic',
    label: 'Anthropic',
    description: 'Claude Sonnet, Opus, and Haiku models',
    tag: 'providers',
    recommended: true,
    defaultId: 'anthropic:messages:claude-sonnet-5',
    editor: 'foundation',
  },
  {
    value: 'google',
    label: 'Google AI Studio',
    description: 'Gemini models via Google AI',
    tag: 'providers',
    recommended: true,
    defaultId: DEFAULT_GOOGLE_TARGET_ID,
    editor: 'foundation',
  },
  {
    value: 'mistral',
    label: 'Mistral AI',
    description: 'Mistral and Mixtral models',
    tag: 'providers',
    defaultId: 'mistral:mistral-large-latest',
    editor: 'foundation',
  },
  {
    value: 'deepseek',
    label: 'DeepSeek',
    description: 'DeepSeek V4.1 Flash and V4 Pro models',
    tag: 'providers',
    defaultId: 'deepseek:deepseek-flash',
    editor: 'foundation',
  },
  {
    value: 'cohere',
    label: 'Cohere',
    description: 'Command and embedding models',
    tag: 'providers',
    defaultId: 'cohere:command-a-03-2025',
    editor: 'foundation',
  },
  {
    value: 'ai21',
    label: 'AI21 Labs',
    description: 'Jamba and Jurassic models',
    tag: 'providers',
    defaultId: 'ai21:jamba-large',
    editor: 'custom',
  },
  {
    value: 'xai',
    label: 'X.AI (Grok)',
    description: 'Grok models from X.AI',
    tag: 'providers',
    defaultId: 'xai:grok-4.7',
    editor: 'custom',
  },
  {
    value: 'perplexity',
    label: 'Perplexity AI',
    description: 'Search-augmented AI with citations',
    tag: 'providers',
    defaultId: 'perplexity:sonar',
    editor: 'foundation',
  },
  {
    value: 'azure',
    label: 'Azure OpenAI',
    description: 'OpenAI models on Azure',
    tag: 'providers',
    defaultId: 'azure:chat:your-deployment-name',
    editor: 'foundation',
  },
  {
    value: 'vertex',
    label: 'Google Vertex AI',
    description: 'Gemini on Google Cloud',
    tag: 'providers',
    defaultId: DEFAULT_VERTEX_TARGET_ID,
    createConfig: () => ({ region: 'global' }),
    editor: 'foundation',
  },
  {
    value: 'bedrock',
    label: 'AWS Bedrock',
    description: 'Multiple models on AWS',
    tag: 'providers',
    defaultId: DEFAULT_BEDROCK_TARGET_ID,
    editor: 'foundation',
  },
  {
    value: 'sagemaker',
    label: 'Amazon SageMaker',
    description: 'Custom model endpoints on AWS',
    tag: 'providers',
    defaultId: 'sagemaker:your-endpoint-name',
    editor: 'custom',
  },
  {
    value: 'groq',
    label: 'Groq',
    description: 'Ultra-fast inference API',
    tag: 'providers',
    defaultId: 'groq:openai/gpt-oss-120b',
    editor: 'foundation',
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    description: 'Unified API for 200+ models',
    tag: 'providers',
    defaultId: 'openrouter:openai/gpt-6-sol',
    editor: 'foundation',
  },
  {
    value: 'fireworks',
    label: 'Fireworks AI',
    description: 'Fast inference for open models',
    tag: 'providers',
    defaultId: 'fireworks:accounts/fireworks/models/llama-v3p1-70b-instruct',
    editor: 'custom',
  },
  {
    value: 'together',
    label: 'Together AI',
    description: 'Open-source model inference',
    tag: 'providers',
    defaultId: 'togetherai:meta-llama/Llama-3.3-70B-Instruct-Turbo',
    editor: 'custom',
  },
  {
    value: 'cerebras',
    label: 'Cerebras',
    description: 'High-speed Llama inference',
    tag: 'providers',
    defaultId: 'cerebras:gpt-oss-120b',
    editor: 'foundation',
  },
  {
    value: 'hyperbolic',
    label: 'Hyperbolic',
    description: 'Fast open model inference',
    tag: 'providers',
    defaultId: 'hyperbolic:meta-llama/Meta-Llama-3.1-70B-Instruct',
    editor: 'custom',
  },
  {
    value: 'aimlapi',
    label: 'AI/ML API',
    description: 'Access 300+ AI models',
    tag: 'providers',
    defaultId: 'aimlapi:gpt-4o',
    editor: 'custom',
  },
  {
    value: 'huggingface',
    label: 'Hugging Face',
    description: 'Inference API for thousands of models',
    tag: 'providers',
    defaultId: 'huggingface:chat:meta-llama/Meta-Llama-3-70B-Instruct',
    editor: 'custom',
  },
  {
    value: 'cloudflare-ai',
    label: 'Cloudflare AI',
    description: 'Edge AI inference',
    tag: 'providers',
    defaultId: 'cloudflare-ai:chat:@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    editor: 'custom',
  },
  {
    value: 'databricks',
    label: 'Databricks',
    description: 'Foundation Model APIs',
    tag: 'providers',
    defaultId: 'databricks:databricks-meta-llama-3-3-70b-instruct',
    editor: 'custom',
  },
  {
    value: 'replicate',
    label: 'Replicate',
    description: 'Run open-source models',
    tag: 'providers',
    defaultId: 'replicate:meta/meta-llama-3-70b-instruct',
    editor: 'custom',
  },
  {
    value: 'fal',
    label: 'fal.ai',
    description: 'Image generation models',
    tag: 'providers',
    defaultId: 'fal:image:fal-ai/flux/dev',
    editor: 'custom',
  },
  {
    value: 'voyage',
    label: 'Voyage AI',
    description: 'Embedding models',
    tag: 'providers',
    defaultId: 'voyage:voyage-3',
    editor: 'custom',
  },
  {
    value: 'ollama',
    label: 'Ollama',
    description: 'Easy local model runner',
    tag: 'local',
    recommended: true,
    defaultId: 'ollama:llama3.2:3b',
    editor: 'custom',
  },
  {
    value: 'vllm',
    label: 'vLLM',
    description: 'High-performance inference server',
    tag: 'local',
    defaultId: 'openai:chat:your-served-model-name',
    createConfig: () => getLocalProviderConfig('vllm')!,
    editor: 'custom',
  },
  {
    value: 'llama.cpp',
    label: 'llama.cpp',
    description: 'Lightweight CPU/GPU inference',
    tag: 'local',
    defaultId: 'llama:local-model',
    createConfig: () => ({ n_predict: 1024 }),
    editor: 'custom',
  },
  {
    value: 'localai',
    label: 'LocalAI',
    description: 'OpenAI-compatible local API',
    tag: 'local',
    defaultId: 'localai:gpt-4',
    editor: 'custom',
  },
  {
    value: 'llamafile',
    label: 'Llamafile',
    description: 'Single-file executable models',
    tag: 'local',
    defaultId: 'openai:chat:local-model',
    createConfig: () => getLocalProviderConfig('llamafile')!,
    editor: 'custom',
  },
  {
    value: 'text-generation-webui',
    label: 'Text Generation WebUI',
    description: 'Gradio-based model interface',
    tag: 'local',
    defaultId: 'openai:chat:your-served-model-name',
    createConfig: () => getLocalProviderConfig('text-generation-webui')!,
    editor: 'custom',
  },
];

export const allProviderOptions = providerCatalog
  .map((option) => ({ ...option, docs: getProviderDocumentationUrl(option.value) }))
  .sort((a, b) => {
    // Items marked as 'last' always go to the end
    if (a.last) {
      return 1;
    }
    if (b.last) {
      return -1;
    }

    // Priority providers come first in the defined order
    const aPriority = priorityOrder.indexOf(a.value);
    const bPriority = priorityOrder.indexOf(b.value);

    if (aPriority !== -1 && bPriority !== -1) {
      return aPriority - bPriority;
    }
    if (aPriority !== -1) {
      return -1;
    }
    if (bPriority !== -1) {
      return 1;
    }

    // Popular items come next
    if (a.recommended && !b.recommended) {
      return -1;
    }
    if (!a.recommended && b.recommended) {
      return 1;
    }

    // Otherwise sort alphabetically
    return a.label.localeCompare(b.label);
  });
export function getProviderEditorKind(type?: string): ProviderEditorKind | undefined {
  return (
    allProviderOptions.find((option) => option.value === type)?.editor ??
    (type && type !== 'github' ? 'custom' : undefined)
  );
}

export function createDefaultProvider(type: string, label?: string): ProviderOptions {
  const option = allProviderOptions.find((option) => option.value === type);
  return {
    id: option?.defaultId ?? type,
    config: option?.createConfig?.() ?? {},
    label: label ?? option?.defaultLabel,
  };
}

// UI inference is separate from the provider-family classification used for draft recovery.
export function getProviderEditorType(
  id?: string,
  config?: Record<string, unknown>,
): string | undefined {
  if (!id || typeof id !== 'string') {
    return undefined;
  }
  const family = getProviderType(id, config);
  if (isLocalOpenAiProviderType(family) || family === 'custom') {
    return family;
  }
  const template = allProviderOptions.find(
    (option) => option.defaultId === id && !isLocalOpenAiProviderType(option.value),
  );
  if (template) {
    return template.value;
  }
  if (id.startsWith('bedrock:agents:')) {
    return 'bedrock-agent';
  }
  if (
    id === 'anthropic:claude-agent-sdk' ||
    id.startsWith('anthropic:claude-agent-sdk:') ||
    id === 'anthropic:claude-code' ||
    id.startsWith('anthropic:claude-code:')
  ) {
    return 'claude-agent-sdk';
  }
  if (allProviderOptions.some((option) => option.value === family) || family === 'github') {
    return family;
  }
  if (id.startsWith('file://')) {
    if (/\.(json|ya?ml)$/i.test(id)) {
      return 'custom';
    }
    // Retain extensionless legacy framework paths; ordinary Python/JS/Go files use their language editor.
    return (
      allProviderOptions.find(
        (option) =>
          option.editor === 'agent' &&
          option.value !== 'generic-agent' &&
          (option.fileAliases ?? [option.value]).some((alias) => id.includes(alias)),
      )?.value ?? 'generic-agent'
    );
  }
  return 'custom';
}
