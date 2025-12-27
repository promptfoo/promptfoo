import type { Agent } from '@openai/agents';

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
  tools?: string | ToolDefinition[];

  /**
   * Handoff agents
   * Can be a file path or an array of handoff definitions
   */
  handoffs?: string | HandoffDefinition[];

  /**
   * Maximum number of agent turns before stopping
   * @default 10
   */
  maxTurns?: number;

  /**
   * Input guardrails
   * Can be a file path or an array of guardrail definitions
   */
  inputGuardrails?: string | any[];

  /**
   * Output guardrails
   * Can be a file path or an array of guardrail definitions
   */
  outputGuardrails?: string | any[];

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
  modelSettings?: any;
}

/**
 * Agent definition for inline configuration
 */
export interface AgentDefinition {
  /**
   * Name of the agent
   */
  name: string;

  /**
   * Instructions for the agent (system prompt)
   * Can be a string or a function that returns a string
   */
  instructions: string | ((context: any) => string | Promise<string>);

  /**
   * Model to use for the agent
   */
  model?: string;

  /**
   * Description of what the agent does (used for handoffs)
   */
  handoffDescription?: string;

  /**
   * Output type schema
   * Can be 'text', a Zod schema, or a JSON schema definition
   */
  outputType?: 'text' | any;

  /**
   * Tools available to the agent
   */
  tools?: ToolDefinition[];

  /**
   * Handoff agents
   */
  handoffs?: HandoffDefinition[];
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
