import type {
  Agent,
  AgentInputItem,
  AgentOptions,
  Handoff,
  InputGuardrail,
  MCPServer,
  ModelSettings,
  NonStreamRunOptions,
  OpenAIConversationsSessionOptions,
  OpenAIResponsesCompactionSessionOptions,
  OutputGuardrail,
  RetryPolicy,
  Session,
  SessionInputCallback,
  Tool,
  ToolErrorFormatter,
} from '@openai/agents';
import type {
  Capability,
  Manifest,
  ManifestInit,
  SandboxAgentOptions,
  SandboxRunConfig,
} from '@openai/agents/sandbox';
import type {
  DockerSandboxClientOptions,
  UnixLocalSandboxClientOptions,
} from '@openai/agents/sandbox/local';

import type { OpenAiSharedOptions } from './types';

/**
 * Configuration options for OpenAI Agents provider
 */
export interface OpenAiAgentsOptions extends OpenAiSharedOptions {
  /**
   * Agent definition - can be:
   * - An Agent instance
   * - A file path (file://path/to/agent.ts or file://path/to/agent.js)
   * - An inline agent configuration object
   */
  agent?: Agent<any, any> | string | AgentDefinition;

  /**
   * Tools to provide to the agent
   * Can be a file path or an array of tool definitions
   */
  tools?: string | Array<Tool<any> | ToolDefinition>;

  /**
   * Handoff agents
   * Can be a file path or an array of handoff definitions
   */
  handoffs?: string | Array<Agent<any, any> | Handoff<any, any> | HandoffDefinition>;

  /**
   * Maximum number of agent turns before stopping
   * @default 10
   */
  maxTurns?: number;

  /**
   * Input guardrails
   * Can be a file path or an array of guardrail definitions
   */
  inputGuardrails?: string | InputGuardrail[];

  /**
   * Output guardrails
   * Can be a file path or an array of guardrail definitions
   */
  outputGuardrails?: string | OutputGuardrail<any>[];

  /**
   * Whether to execute tools for real or use mocks
   * - true/'real': Execute actual tool functions
   * - false/'mock': Use mocked responses
   * @default 'real'
   */
  executeTools?: boolean | 'mock' | 'real';

  /**
   * Mock tool responses (when executeTools is 'mock' or false)
   * Key is tool name, value is the mocked response
   */
  toolMocks?: Record<string, any>;

  /**
   * Enable tracing for agent execution
   * If enabled, will export traces to OTLP endpoint
   * @default false
   */
  tracing?: boolean;

  /**
   * OTLP endpoint for tracing
   * @default 'http://localhost:4318'
   */
  otlpEndpoint?: string;

  /**
   * Model to use for the agent (overrides agent definition)
   */
  model?: string;

  /**
   * Model settings to use for the agent
   */
  modelSettings?: OpenAiAgentsModelSettings;

  /**
   * Persistent conversation memory for the agent run.
   *
   * Supports built-in YAML-friendly definitions, SDK Session instances,
   * file:// exports, or factories that return a Session for each call.
   */
  session?: OpenAiAgentsSessionConfig;

  /**
   * Sandbox runtime configuration for SandboxAgent workflows.
   *
   * Supports built-in local client definitions, SDK SandboxRunConfig objects,
   * file:// exports, or factories that return a SandboxRunConfig for each call.
   */
  sandbox?: OpenAiAgentsSandboxConfig;

  /**
   * Pass-through options for the underlying SDK run() call.
   *
   * Promptfoo owns context, maxTurns, signal, and streaming mode. All other
   * current SDK run options can be supplied here.
   */
  runOptions?: OpenAiAgentsRunOptions;
}

export type OpenAiAgentsRetryPolicyPreset =
  | 'never'
  | 'providerSuggested'
  | 'networkError'
  | 'retryAfter'
  | {
      httpStatus: number[];
    }
  | {
      any: OpenAiAgentsRetryPolicyPreset[];
    }
  | {
      all: OpenAiAgentsRetryPolicyPreset[];
    };

export type OpenAiAgentsRetryPolicyConfig = RetryPolicy | OpenAiAgentsRetryPolicyPreset;

export type OpenAiAgentsModelSettings = Omit<ModelSettings, 'retry'> & {
  retry?: Omit<NonNullable<ModelSettings['retry']>, 'policy'> & {
    policy?: OpenAiAgentsRetryPolicyConfig;
  };
};

/**
 * Agent definition for inline configuration
 */
export interface AgentDefinition {
  /**
   * Agent runtime to create for inline definitions.
   * @default 'agent'
   */
  type?: 'agent' | 'sandbox';

  /**
   * Name of the agent
   */
  name: string;

  /**
   * Instructions for the agent (system prompt)
   */
  instructions: AgentOptions<any, any>['instructions'];

  /**
   * Prompt template to use for the agent
   */
  prompt?: AgentOptions<any, any>['prompt'];

  /**
   * Model to use for the agent
   */
  model?: AgentOptions<any, any>['model'];

  /**
   * Model settings to use for the agent
   */
  modelSettings?: OpenAiAgentsModelSettings;

  /**
   * Description of what the agent does (used for handoffs)
   */
  handoffDescription?: AgentOptions<any, any>['handoffDescription'];

  /**
   * Whether to warn when handoff agents expose different output types.
   */
  handoffOutputTypeWarningEnabled?: AgentOptions<any, any>['handoffOutputTypeWarningEnabled'];

  /**
   * Output type schema
   * Can be 'text', a Zod schema, or a JSON schema definition
   */
  outputType?: AgentOptions<any, any>['outputType'];

  /**
   * Tools available to the agent
   */
  tools?: Array<Tool<any> | ToolDefinition>;

  /**
   * Handoff agents
   */
  handoffs?: Array<Agent<any, any> | Handoff<any, any> | HandoffDefinition>;

  /**
   * Input validation guardrails
   */
  inputGuardrails?: InputGuardrail[];

  /**
   * Output validation guardrails
   */
  outputGuardrails?: OutputGuardrail<any>[];

  /**
   * MCP servers available to the agent
   */
  mcpServers?: MCPServer[];

  /**
   * Configure how the agent should handle tool use
   */
  toolUseBehavior?: AgentOptions<any, any>['toolUseBehavior'];

  /**
   * Whether to reset the tool choice after a tool call
   */
  resetToolChoice?: AgentOptions<any, any>['resetToolChoice'];

  /**
   * SandboxAgent-only manifest mounted into the sandbox workspace.
   */
  defaultManifest?: Manifest | ManifestInit;

  /**
   * SandboxAgent-only base instructions prepended to runtime instructions.
   */
  baseInstructions?: SandboxAgentOptions<any, any>['baseInstructions'];

  /**
   * SandboxAgent-only capability list. For YAML, prefer a file-exported agent
   * when you need capabilities beyond the SDK defaults.
   */
  capabilities?: Capability[];

  /**
   * SandboxAgent-only execution user.
   */
  runAs?: SandboxAgentOptions<any, any>['runAs'];
}

/**
 * Tool definition
 */
export interface ToolDefinition {
  /**
   * Name of the tool
   */
  name: string;

  /**
   * Description of what the tool does
   */
  description: string;

  /**
   * Parameters schema (Zod schema or JSON schema)
   */
  parameters: any;

  /**
   * Whether to use strict schema enforcement
   */
  strict?: boolean;

  /**
   * Responses API only: whether to defer loading this tool
   */
  deferLoading?: boolean;

  /**
   * Function to execute when tool is called
   * Can be a function or a string (for file:// references)
   */
  execute: ((input: any) => any | Promise<any>) | string;
}

/**
 * Handoff definition
 */
export interface HandoffDefinition {
  /**
   * Agent to handoff to
   * Can be an Agent instance, file path, or agent definition
   */
  agent: Agent<any, any> | string | AgentDefinition;

  /**
   * Description of when to use this handoff
   */
  description?: string;
}

/**
 * Result from loading an agent definition
 */
export interface LoadedAgent {
  agent: Agent<any, any>;
  tools?: any[];
  handoffs?: any[];
}

export type OpenAiAgentsSessionFactory = (context?: any) => Session | Promise<Session>;

export type OpenAiAgentsMemorySessionDefinition = {
  type: 'memory';
  sessionId?: string;
  initialItems?: AgentInputItem[];
};

export type OpenAiAgentsConversationsSessionDefinition = OpenAIConversationsSessionOptions & {
  type: 'openai-conversations';
};

export type OpenAiAgentsResponsesCompactionSessionDefinition = Omit<
  OpenAIResponsesCompactionSessionOptions,
  'underlyingSession'
> & {
  type: 'openai-responses-compaction';
  underlyingSession?: OpenAiAgentsSessionConfig;
};

export type OpenAiAgentsSessionDefinition =
  | OpenAiAgentsMemorySessionDefinition
  | OpenAiAgentsConversationsSessionDefinition
  | OpenAiAgentsResponsesCompactionSessionDefinition;

export type OpenAiAgentsSessionConfig =
  | Session
  | string
  | OpenAiAgentsSessionFactory
  | OpenAiAgentsSessionDefinition;

export type OpenAiAgentsSandboxFactory = (
  context?: any,
) => SandboxRunConfig | Promise<SandboxRunConfig>;

type OpenAiAgentsSandboxDefinitionBase = Omit<SandboxRunConfig<any, any>, 'client' | 'manifest'> & {
  manifest?: Manifest | ManifestInit;
};

export type OpenAiAgentsUnixLocalSandboxDefinition = OpenAiAgentsSandboxDefinitionBase & {
  type: 'unix-local';
  clientOptions?: UnixLocalSandboxClientOptions;
};

export type OpenAiAgentsDockerSandboxDefinition = OpenAiAgentsSandboxDefinitionBase & {
  type: 'docker';
  clientOptions?: DockerSandboxClientOptions;
};

export type OpenAiAgentsSandboxDefinition =
  | OpenAiAgentsUnixLocalSandboxDefinition
  | OpenAiAgentsDockerSandboxDefinition;

export type OpenAiAgentsSandboxConfig =
  | SandboxRunConfig<any, any>
  | string
  | OpenAiAgentsSandboxFactory
  | OpenAiAgentsSandboxDefinition;

export type OpenAiAgentsRunOptions = Omit<
  NonStreamRunOptions<any, any>,
  | 'callModelInputFilter'
  | 'context'
  | 'errorHandlers'
  | 'maxTurns'
  | 'sandbox'
  | 'session'
  | 'sessionInputCallback'
  | 'signal'
  | 'stream'
  | 'toolErrorFormatter'
> & {
  callModelInputFilter?:
    | NonNullable<NonStreamRunOptions<any, any>['callModelInputFilter']>
    | string;
  errorHandlers?: NonNullable<NonStreamRunOptions<any, any>['errorHandlers']> | string;
  sandbox?: OpenAiAgentsSandboxConfig;
  session?: OpenAiAgentsSessionConfig;
  sessionInputCallback?: SessionInputCallback | string;
  toolErrorFormatter?: ToolErrorFormatter | string;
};
