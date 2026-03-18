import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRun = vi.hoisted(() => vi.fn());
const mockGetOrCreateTrace = vi.hoisted(() => vi.fn(async (fn: () => Promise<unknown>) => fn()));
const mockRetryPolicies = vi.hoisted(() => {
  const neverPolicy = vi.fn();
  const providerSuggestedPolicy = vi.fn();
  const networkErrorPolicy = vi.fn();
  const retryAfterPolicy = vi.fn();
  const httpStatusPolicy = vi.fn();
  const anyPolicy = vi.fn();
  const allPolicy = vi.fn();

  return {
    never: vi.fn(() => neverPolicy),
    providerSuggested: vi.fn(() => providerSuggestedPolicy),
    networkError: vi.fn(() => networkErrorPolicy),
    retryAfter: vi.fn(() => retryAfterPolicy),
    httpStatus: vi.fn(() => httpStatusPolicy),
    any: vi.fn(() => anyPolicy),
    all: vi.fn(() => allPolicy),
  };
});

vi.mock('@openai/agents', () => {
  class MockAgent {
    name: string;
    instructions: unknown;
    prompt?: unknown;
    model?: string;
    modelSettings: Record<string, unknown>;
    handoffDescription: string;
    outputType?: unknown;
    tools: any[];
    handoffs: any[];
    inputGuardrails: any[];
    outputGuardrails: any[];
    mcpServers: any[];
    toolUseBehavior: unknown;
    resetToolChoice: boolean;

    constructor(config: Record<string, any>) {
      this.name = config.name;
      this.instructions = config.instructions;
      this.prompt = config.prompt;
      this.model = config.model;
      this.modelSettings = config.modelSettings ?? {};
      this.handoffDescription = config.handoffDescription ?? '';
      this.outputType = config.outputType;
      this.tools = config.tools ?? [];
      this.handoffs = config.handoffs ?? [];
      this.inputGuardrails = config.inputGuardrails ?? [];
      this.outputGuardrails = config.outputGuardrails ?? [];
      this.mcpServers = config.mcpServers ?? [];
      this.toolUseBehavior = config.toolUseBehavior ?? 'run_llm_again';
      this.resetToolChoice = config.resetToolChoice ?? true;
    }

    clone(config: Record<string, any>) {
      return new MockAgent({
        ...this,
        ...config,
      });
    }
  }

  return {
    Agent: MockAgent,
    BatchTraceProcessor: class BatchTraceProcessor {
      exporter: unknown;
      options: unknown;

      constructor(exporter: unknown, options: unknown) {
        this.exporter = exporter;
        this.options = options;
      }
    },
    addTraceProcessor: vi.fn(),
    getOrCreateTrace: mockGetOrCreateTrace,
    handoff: vi.fn((agent: MockAgent, config?: Record<string, any>) => ({
      agent,
      agentName: agent.name,
      getHandoffAsFunctionTool: vi.fn(),
      onInvokeHandoff: vi.fn(),
      toolDescription: config?.toolDescriptionOverride,
      isEnabled: vi.fn(async () => true),
    })),
    retryPolicies: mockRetryPolicies,
    run: mockRun,
    startTraceExportLoop: vi.fn(),
    tool: vi.fn((options: Record<string, any>) => ({
      type: 'function',
      name: options.name ?? 'anonymous_tool',
      description: options.description,
      parameters: options.parameters,
      strict: options.strict ?? true,
      deferLoading: options.deferLoading,
      invoke: vi.fn(async () => {
        if (typeof options.execute === 'function') {
          return options.execute({});
        }
        return options.execute;
      }),
      needsApproval: vi.fn(async () => false),
      isEnabled: vi.fn(async () => true),
    })),
  };
});

vi.mock('../../../src/esm', async (importOriginal) => ({
  ...(await importOriginal()),
  importModule: vi.fn(),
}));

vi.mock('../../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { Agent, handoff, tool } from '@openai/agents';
import cliState from '../../../src/cliState';
import { importModule } from '../../../src/esm';
import { OpenAiAgentsProvider } from '../../../src/providers/openai/agents';

describe('OpenAiAgentsProvider', () => {
  const mockImportModule = vi.mocked(importModule);
  const baseInputGuardrail = {
    name: 'base-input',
    execute: vi.fn(async () => ({ tripwireTriggered: false, outputInfo: {} })),
  };
  const baseOutputGuardrail = {
    name: 'base-output',
    execute: vi.fn(async () => ({ tripwireTriggered: false, outputInfo: {} })),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockRun.mockResolvedValue({
      finalOutput: 'Agent answer',
      usage: {
        totalTokens: 12,
        promptTokens: 7,
        completionTokens: 5,
      },
      newItems: [],
    });
    cliState.basePath = undefined;
  });

  afterEach(() => {
    cliState.basePath = undefined;
  });

  it('creates a real SDK agent from inline definitions', async () => {
    const provider = new OpenAiAgentsProvider('gpt-5-mini', {
      config: {
        agent: {
          name: 'Inline Support Agent',
          instructions: 'Help the user.',
          tools: [
            {
              name: 'lookup_order',
              description: 'Look up an order',
              parameters: {
                type: 'object',
                properties: {},
                required: [],
                additionalProperties: false,
              },
              execute: async () => ({ status: 'shipped' }),
            },
          ],
          handoffs: [
            {
              agent: {
                name: 'Billing Agent',
                instructions: 'Handle billing requests.',
              },
              description: 'Transfer billing issues',
            },
          ],
          inputGuardrails: [
            {
              name: 'inline-input',
              execute: async () => ({ tripwireTriggered: false, outputInfo: {} }),
            },
          ],
          outputGuardrails: [
            {
              name: 'inline-output',
              execute: async () => ({ tripwireTriggered: false, outputInfo: {} }),
            },
          ],
        },
      },
    });

    await provider.callApi('Where is my order?');

    expect(mockRun).toHaveBeenCalledTimes(1);
    const agent = mockRun.mock.calls[0][0];

    expect(agent).toBeInstanceOf(Agent);
    expect(agent.name).toBe('Inline Support Agent');
    expect(agent.tools).toHaveLength(1);
    expect(agent.tools[0].name).toBe('lookup_order');
    expect(handoff).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Billing Agent' }),
      expect.objectContaining({ toolDescriptionOverride: 'Transfer billing issues' }),
    );
    expect(agent.handoffs).toHaveLength(1);
    expect(agent.inputGuardrails.map((guardrail: { name: string }) => guardrail.name)).toEqual([
      'inline-input',
    ]);
    expect(agent.outputGuardrails.map((guardrail: { name: string }) => guardrail.name)).toEqual([
      'inline-output',
    ]);
  });

  it('merges file-based tools, handoffs, and guardrails into the loaded agent', async () => {
    const baseTool = vi.mocked(tool)({
      name: 'base_tool',
      description: 'Base tool',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      execute: async () => ({ ok: true }),
    });
    const baseHandoffAgent = new Agent({
      name: 'Existing Specialist',
      instructions: 'Already configured specialist.',
    });
    const baseAgent = new Agent({
      name: 'Support Agent',
      instructions: 'Help the user.',
      tools: [baseTool],
      handoffs: [baseHandoffAgent],
      inputGuardrails: [baseInputGuardrail],
      outputGuardrails: [baseOutputGuardrail],
    });

    mockImportModule.mockImplementation(async (modulePath: string) => {
      switch (modulePath) {
        case '/tmp/agent.ts':
          return { default: baseAgent };
        case '/tmp/tools.ts':
          return {
            default: [
              {
                name: 'lookup_order',
                description: 'Look up an order',
                parameters: {
                  type: 'object',
                  properties: {},
                  required: [],
                  additionalProperties: false,
                },
                execute: async () => ({ status: 'shipped' }),
              },
            ],
          };
        case '/tmp/handoffs.ts':
          return {
            default: [
              {
                agent: {
                  name: 'Billing Agent',
                  instructions: 'Handle billing requests.',
                },
                description: 'Transfer billing issues',
              },
            ],
          };
        case '/tmp/input-guardrails.ts':
          return {
            default: [
              {
                name: 'file-input',
                execute: async () => ({ tripwireTriggered: false, outputInfo: {} }),
              },
            ],
          };
        case '/tmp/output-guardrails.ts':
          return {
            default: [
              {
                name: 'file-output',
                execute: async () => ({ tripwireTriggered: false, outputInfo: {} }),
              },
            ],
          };
        default:
          throw new Error(`Unexpected module path: ${modulePath}`);
      }
    });

    const provider = new OpenAiAgentsProvider('gpt-5-mini', {
      config: {
        agent: 'file:///tmp/agent.ts',
        tools: 'file:///tmp/tools.ts',
        handoffs: 'file:///tmp/handoffs.ts',
        inputGuardrails: 'file:///tmp/input-guardrails.ts',
        outputGuardrails: 'file:///tmp/output-guardrails.ts',
        modelSettings: {
          retry: {
            maxRetries: 2,
            backoff: {
              initialDelayMs: 50,
              multiplier: 2,
            },
            policy: {
              any: ['providerSuggested', { httpStatus: [429] }],
            },
          },
        },
      },
    });

    await provider.callApi('Where is my order?');

    expect(mockRun).toHaveBeenCalledTimes(1);

    const agent = mockRun.mock.calls[0][0];
    const runOptions = mockRun.mock.calls[0][2];

    expect(agent.tools.map((loadedTool: { name: string }) => loadedTool.name)).toEqual([
      'base_tool',
      'lookup_order',
    ]);
    expect(agent.handoffs).toHaveLength(2);
    expect(agent.inputGuardrails.map((guardrail: { name: string }) => guardrail.name)).toEqual([
      'base-input',
      'file-input',
    ]);
    expect(agent.outputGuardrails.map((guardrail: { name: string }) => guardrail.name)).toEqual([
      'base-output',
      'file-output',
    ]);
    expect(runOptions.model).toBe('gpt-5-mini');
    expect(runOptions.modelSettings.retry.maxRetries).toBe(2);
    expect(typeof runOptions.modelSettings.retry.policy).toBe('function');
    expect(mockRetryPolicies.providerSuggested).toHaveBeenCalledTimes(1);
    expect(mockRetryPolicies.httpStatus).toHaveBeenCalledWith([429]);
    expect(mockRetryPolicies.any).toHaveBeenCalledTimes(1);
  });

  it('replaces function tool execution with configured mocks when executeTools is mock', async () => {
    const baseTool = vi.mocked(tool)({
      name: 'lookup_order',
      description: 'Look up an order',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
        additionalProperties: false,
      },
      execute: async () => ({ status: 'real' }),
    });
    const baseAgent = new Agent({
      name: 'Support Agent',
      instructions: 'Help the user.',
      tools: [baseTool],
    });

    const provider = new OpenAiAgentsProvider('gpt-5-mini', {
      config: {
        agent: baseAgent,
        executeTools: 'mock',
        toolMocks: {
          lookup_order: { status: 'mocked' },
        },
      },
    });

    await provider.callApi('Where is my order?');

    const agent = mockRun.mock.calls[0][0];
    const toolResult = await agent.tools[0].invoke({}, '{}');

    expect(toolResult).toEqual({ status: 'mocked' });
  });
});
