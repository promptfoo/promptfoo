# OpenAI Agents SDK Integration Design

**Date:** 2024-10-23
**Status:** Design Phase
**Author:** Architecture Review

## Executive Summary

This document outlines the integration of OpenAI's Agents SDK (openai-agents-js) into promptfoo as a standard provider implementation. The integration follows a **minimal provider-only approach** with no special core features, treating agents like any other LLM provider (similar to the Assistants API or Responses API). The only extension is **tracing integration** via OTLP to capture agent execution details (tool calls, handoffs, multi-turn conversations) in promptfoo's existing tracing infrastructure.

### Key Design Principles

1. **Minimal Core Changes**: No new "agent" concept in promptfoo core - just a provider
2. **Standard Provider Pattern**: Implements `ApiProvider` interface like all other providers
3. **Tracing-First**: Deep integration with promptfoo's OTLP tracing for observability
4. **File-Based Configuration**: Agent definitions, tools, and handoffs loaded from external files
5. **Backward Compatible**: Works with all existing promptfoo features (assertions, caching, UI)

---

## Goals and Non-Goals

### Goals

- ✅ Enable testing of openai-agents-js workflows in promptfoo
- ✅ Support multi-turn agent conversations with tools and handoffs
- ✅ Capture detailed execution traces (spans, tool calls, agent transitions)
- ✅ Work with existing promptfoo assertions on final outputs
- ✅ Allow flexible agent definitions (inline or file-based)
- ✅ Support both real and mocked tool execution
- ✅ Provide comprehensive examples and documentation

### Non-Goals

- ❌ Special "agent evaluation mode" or custom eval workflows
- ❌ Agent-specific UI components or visualizations (beyond standard tracing)
- ❌ Agent-specific assertion types (tool usage, handoff assertions)
- ❌ Streaming support in initial implementation
- ❌ Conversation history management across test cases
- ❌ Custom agent lifecycle hooks in promptfoo

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Promptfoo Eval Engine                     │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │         Test Case: { vars: {...}, assert: [...] }  │    │
│  └────────────────┬───────────────────────────────────┘    │
│                   │                                          │
│                   v                                          │
│  ┌────────────────────────────────────────────────────┐    │
│  │       OpenAiAgentsProvider.callApi(prompt)         │    │
│  │                                                      │    │
│  │  1. Load agent definition (file or inline)         │    │
│  │  2. Configure tools, handoffs, guardrails          │    │
│  │  3. Setup OTLP tracing exporter                    │    │
│  │  4. Call run(agent, prompt, context)               │    │
│  │  5. Return result.finalOutput as ProviderResponse  │    │
│  └────────────────┬───────────────────────────────────┘    │
│                   │                                          │
└───────────────────┼──────────────────────────────────────────┘
                    │
                    v
         ┌──────────────────────────┐
         │  @openai/agents SDK      │
         │                          │
         │  run(agent, input) {     │
         │    while (!done) {       │
         │      - Call LLM          │
         │      - Execute tools     │
         │      - Handle handoffs   │
         │      - Emit trace spans  │
         │    }                     │
         │    return finalOutput    │
         │  }                       │
         └──────────────┬───────────┘
                        │
                        │ Trace Spans
                        v
         ┌──────────────────────────┐
         │  OTLPTracingExporter     │
         │                          │
         │  - Transforms spans to   │
         │    OTLP JSON format      │
         │  - POSTs to localhost:   │
         │    4318/v1/traces        │
         └──────────────┬───────────┘
                        │
                        v
         ┌──────────────────────────┐
         │  Promptfoo OTLP Receiver │
         │                          │
         │  - Parses OTLP traces    │
         │  - Stores in SQLite      │
         │  - Links to evaluation   │
         └──────────────────────────┘
```

---

## Core Components

### 1. Provider Implementation

**File:** `src/providers/openai/agents.ts`

```typescript
export class OpenAiAgentsProvider extends OpenAiGenericProvider {
  private agentConfig: AgentConfiguration;
  private agent?: Agent;

  constructor(
    modelName: string,
    options: { config?: OpenAiAgentsOptions; id?: string; env?: EnvOverrides },
  ) {
    super(modelName, options);
    this.agentConfig = this.parseAgentConfig(options.config);
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // 1. Initialize agent if not cached
    if (!this.agent) {
      this.agent = await this.initializeAgent();
    }

    // 2. Setup tracing if enabled
    const tracingExporter = this.setupTracingIfNeeded(context);

    // 3. Run agent
    const result = await run(this.agent, prompt, {
      context: context?.vars,
      maxTurns: this.agentConfig.maxTurns || 10,
      signal: callApiOptions?.signal,
    });

    // 4. Return standard ProviderResponse
    return {
      output: result.finalOutput,
      tokenUsage: {
        total: result.usage?.totalTokens,
        prompt: result.usage?.promptTokens,
        completion: result.usage?.completionTokens,
      },
      cached: false,
      cost: this.calculateCost(result.usage),
    };
  }

  private async initializeAgent(): Promise<Agent> {
    // Load agent definition from file or inline config
    // Load tools from file or inline
    // Load handoffs from file or inline
    // Return configured Agent instance
  }

  private setupTracingIfNeeded(context?: CallApiContextParams): OTLPTracingExporter | null {
    // Check if tracing enabled in context
    // Create and register OTLP exporter
    // Return exporter for cleanup
  }
}
```

### 2. OTLP Tracing Exporter

**File:** `src/providers/openai/agents-tracing.ts`

```typescript
import type { TracingExporter } from '@openai/agents';
import type { Trace, Span } from '@openai/agents';

export class OTLPTracingExporter implements TracingExporter {
  private otlpEndpoint: string;
  private evaluationId?: string;
  private testCaseId?: string;

  constructor(options: { otlpEndpoint?: string; evaluationId?: string; testCaseId?: string }) {
    this.otlpEndpoint = options.otlpEndpoint || 'http://localhost:4318';
    this.evaluationId = options.evaluationId;
    this.testCaseId = options.testCaseId;
  }

  async export(items: (Trace | Span)[], signal?: AbortSignal): Promise<void> {
    const otlpPayload = this.transformToOTLP(items);

    try {
      const response = await fetch(`${this.otlpEndpoint}/v1/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(otlpPayload),
        signal,
      });

      if (!response.ok) {
        logger.error(`OTLP export failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      logger.error(`Failed to export traces to OTLP: ${error}`);
    }
  }

  private transformToOTLP(items: (Trace | Span)[]): any {
    // Transform openai-agents-js trace/span format to OTLP JSON format
    // See: https://opentelemetry.io/docs/specs/otlp/#otlphttp-request

    const spans = items.filter((item) => item.type === 'span').map((span) => this.spanToOTLP(span));

    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'promptfoo-agents' } },
              { key: 'evaluation.id', value: { stringValue: this.evaluationId || 'unknown' } },
              { key: 'test.case.id', value: { stringValue: this.testCaseId || 'unknown' } },
            ],
          },
          scopeSpans: [
            {
              scope: { name: 'openai-agents-js', version: '0.1.0' },
              spans,
            },
          ],
        },
      ],
    };
  }

  private spanToOTLP(span: Span): any {
    return {
      traceId: this.hexToBase64(span.traceId),
      spanId: this.hexToBase64(span.spanId),
      parentSpanId: span.parentId ? this.hexToBase64(span.parentId) : undefined,
      name: span.data?.name || 'agent.span',
      kind: 1, // SPAN_KIND_INTERNAL
      startTimeUnixNano: String(span.startTime * 1_000_000), // Convert ms to ns
      endTimeUnixNano: span.endTime ? String(span.endTime * 1_000_000) : undefined,
      attributes: this.attributesToOTLP(span.data),
      status: {
        code: span.data?.error ? 2 : 0, // 0=OK, 2=ERROR
        message: span.data?.error?.message,
      },
    };
  }

  private attributesToOTLP(data: any): any[] {
    // Convert span data to OTLP attributes
    const attributes = [];

    if (data) {
      for (const [key, value] of Object.entries(data)) {
        attributes.push({
          key,
          value: this.valueToOTLP(value),
        });
      }
    }

    return attributes;
  }

  private valueToOTLP(value: any): any {
    if (typeof value === 'string') {
      return { stringValue: value };
    } else if (typeof value === 'number') {
      return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
    } else if (typeof value === 'boolean') {
      return { boolValue: value };
    } else if (Array.isArray(value)) {
      return { arrayValue: { values: value.map((v) => this.valueToOTLP(v)) } };
    } else if (typeof value === 'object') {
      return { stringValue: JSON.stringify(value) };
    }
    return { stringValue: String(value) };
  }

  private hexToBase64(hex: string): string {
    // Convert hex string to base64 for OTLP format
    return Buffer.from(hex, 'hex').toString('base64');
  }
}
```

### 3. Agent Configuration Types

**File:** `src/providers/openai/agents-types.ts`

```typescript
import type { OpenAiSharedOptions } from './types';

export interface OpenAiAgentsOptions extends OpenAiSharedOptions {
  /**
   * Agent definition - inline config or file reference
   */
  agent?: AgentDefinition | string; // string = file://path/to/agent.ts or .js

  /**
   * Tools to provide to the agent
   */
  tools?: ToolDefinition[] | string; // string = file://path/to/tools.ts

  /**
   * Handoff agents
   */
  handoffs?: HandoffDefinition[] | string; // string = file://path/to/handoffs.ts

  /**
   * Maximum number of agent turns
   */
  maxTurns?: number;

  /**
   * Input guardrails
   */
  inputGuardrails?: string | any[]; // file or inline

  /**
   * Output guardrails
   */
  outputGuardrails?: string | any[]; // file or inline

  /**
   * Whether to use real tool execution or mocks
   */
  executeTools?: boolean | 'mock' | 'real';

  /**
   * Mock tool responses (when executeTools: 'mock')
   */
  toolMocks?: Record<string, any>;

  /**
   * Enable tracing for agent execution
   */
  tracing?: boolean;

  /**
   * OTLP endpoint for tracing (defaults to http://localhost:4318)
   */
  otlpEndpoint?: string;
}

export interface AgentDefinition {
  name: string;
  instructions: string | ((context: any) => string | Promise<string>);
  model?: string;
  outputType?: 'text' | any; // Zod schema or JSON schema
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: any; // Zod schema
  execute: (input: any) => any | Promise<any>;
}

export interface HandoffDefinition {
  agent: AgentDefinition | string; // nested agent or file reference
  description?: string;
}
```

---

## Configuration Schema

### Example 1: File-Based Agent Definition

```yaml
# promptfooconfig.yaml
providers:
  - id: openai:agents:weather-agent
    config:
      # Agent definition from external file
      agent: file://./agents/weather-agent.ts

      # Tools from external file
      tools: file://./tools/weather-tools.ts

      # Handoffs from external file (optional)
      handoffs: file://./agents/handoffs.ts

      # Agent execution config
      maxTurns: 10
      executeTools: real # or 'mock' or boolean

      # Tracing
      tracing: true

      # OpenAI config
      apiKey: ${OPENAI_API_KEY}
      model: gpt-4

tests:
  - description: 'Weather query for Tokyo'
    vars:
      city: Tokyo
    assert:
      - type: contains
        value: 'sunny'
      - type: isSimilar
        value: 'The weather in Tokyo is pleasant'
```

**Agent file (`agents/weather-agent.ts`):**

```typescript
import { Agent } from '@openai/agents';

export default new Agent({
  name: 'Weather Agent',
  instructions:
    'You are a helpful weather assistant. Use the available tools to get weather information.',
  model: 'gpt-4',
});
```

**Tools file (`tools/weather-tools.ts`):**

```typescript
import { tool } from '@openai/agents';
import { z } from 'zod';

export const getWeather = tool({
  name: 'get_weather',
  description: 'Get the weather for a given city',
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => {
    // Real API call or mock based on provider config
    return `The weather in ${city} is sunny`;
  },
});

export default [getWeather];
```

### Example 2: Inline Agent Definition

```yaml
providers:
  - id: openai:agents:simple-agent
    config:
      # Inline agent definition
      agent:
        name: Simple Agent
        instructions: You are a helpful assistant
        model: gpt-4

      # Inline tools
      tools:
        - name: get_time
          description: Get the current time
          parameters:
            type: object
            properties:
              timezone:
                type: string
          execute: 'return new Date().toISOString()'

      maxTurns: 5
      executeTools: mock
      toolMocks:
        get_time: '2024-10-23T12:00:00Z'

tests:
  - vars:
      query: 'What time is it?'
    assert:
      - type: contains
        value: '2024-10-23'
```

### Example 3: Multi-Agent Workflow with Handoffs

```yaml
providers:
  - id: openai:agents:customer-service
    config:
      agent: file://./agents/orchestrator.ts
      handoffs: file://./agents/specialist-agents.ts
      tools: file://./tools/crm-tools.ts
      maxTurns: 20
      tracing: true

tests:
  - description: 'Escalate to billing specialist'
    vars:
      query: 'I was charged twice for my subscription'
    assert:
      - type: contains
        value: 'refund'
      - type: llm-rubric
        value: 'The response shows the issue was escalated to billing'
```

---

## Tracing Integration Details

### Trace Data Flow

1. **Promptfoo generates trace context** (traceId, spanId, traceparent header)
2. **Provider registers OTLP exporter** with agents SDK trace processor
3. **Agent execution emits spans** (LLM calls, tool executions, handoffs)
4. **OTLP exporter transforms spans** to OTLP JSON format
5. **Spans POSTed to `localhost:4318/v1/traces`**
6. **Promptfoo OTLP receiver parses** and stores in SQLite
7. **Traces linked to evaluation** via `evaluationId` and `testCaseId`
8. **Web UI renders traces** in existing trace visualization

### Span Attributes

The OTLP exporter should include these key attributes:

- `agent.name`: Name of the current agent
- `agent.turn`: Turn number in the agent loop
- `tool.name`: Name of tool being called (for tool spans)
- `tool.input`: Tool input parameters (JSON string)
- `tool.output`: Tool output (JSON string)
- `handoff.from`: Source agent name (for handoff spans)
- `handoff.to`: Target agent name (for handoff spans)
- `llm.model`: Model used for LLM call
- `llm.tokens.prompt`: Prompt tokens used
- `llm.tokens.completion`: Completion tokens used
- `error.message`: Error message if span failed

### Span Naming Convention

- `agent.run`: Root span for entire agent run
- `agent.turn`: Span for each agent turn
- `llm.completion`: LLM API call
- `tool.execute`: Tool execution
- `agent.handoff`: Agent handoff/transition
- `guardrail.check`: Guardrail validation

---

## Implementation Details

### Phase 1: Core Provider (Week 1)

**Tasks:**

1. Create `src/providers/openai/agents.ts`
   - Implement `OpenAiAgentsProvider` class
   - Extend `OpenAiGenericProvider` for common OpenAI config
   - Implement `callApi()` method
   - Add agent initialization logic

2. Create `src/providers/openai/agents-types.ts`
   - Define TypeScript types for agent config
   - Define types for tools, handoffs, guardrails

3. Add agent provider to registry
   - Update `src/providers/index.ts` to include agent provider
   - Add provider ID pattern: `openai:agents:*`

4. Implement file loading utilities
   - Create `loadAgentDefinition(pathOrInline)` helper
   - Create `loadTools(pathOrInline)` helper
   - Create `loadHandoffs(pathOrInline)` helper
   - Support both `.ts` and `.js` files via dynamic import

**Testing:**

- Unit test for provider initialization
- Unit test for agent definition loading (file + inline)
- Unit test for tool loading (file + inline)
- Integration test for simple agent run

### Phase 2: Tracing Integration (Week 2)

**Tasks:**

1. Create `src/providers/openai/agents-tracing.ts`
   - Implement `OTLPTracingExporter` class
   - Implement OTLP format transformation
   - Implement span attribute mapping
   - Add error handling and logging

2. Integrate tracing in provider
   - Check if tracing enabled in test context
   - Register OTLP exporter with agent trace processor
   - Pass evaluationId and testCaseId to exporter
   - Clean up exporter after run

3. Update OTLP receiver if needed
   - Ensure it handles agent-specific attributes
   - Add validation for agent trace format

**Testing:**

- Unit test for OTLP transformation
- Unit test for span attribute mapping
- Integration test with OTLP receiver running
- Verify traces stored in SQLite correctly
- Verify traces linked to evaluations

### Phase 3: Tool Execution Modes (Week 2)

**Tasks:**

1. Implement tool execution modes
   - Add `executeTools` config option
   - Implement mock tool wrapper
   - Implement tool override mechanism

2. Tool mocking system
   - Create `MockToolExecutor` wrapper
   - Support `toolMocks` config for mock responses
   - Support deterministic mock generation

3. Tool result validation
   - Add validation for tool outputs
   - Add error handling for tool failures
   - Add timeout handling for long-running tools

**Testing:**

- Unit test for mock tool execution
- Unit test for real tool execution
- Integration test for tool mocks
- Test tool error handling

### Phase 4: Examples and Documentation (Week 3)

**Tasks:**

1. Create example configurations
   - Simple single-agent example
   - Multi-agent with handoffs example
   - Customer service workflow example
   - Tool-heavy workflow example

2. Create example agent files
   - Example agent definitions
   - Example tool implementations
   - Example handoff configurations

3. Write provider documentation
   - Document in `site/docs/providers/openai-agents.md`
   - Include all config options
   - Include example configurations
   - Include tracing guide
   - Include troubleshooting section

4. Write guide documentation
   - "Testing AI Agents with Promptfoo" guide
   - "Agent Tool Testing" guide
   - "Multi-Agent Workflows" guide

**Testing:**

- Verify all examples run successfully
- Verify documentation accuracy
- Get user feedback on examples

### Phase 5: Advanced Features (Week 4)

**Tasks:**

1. Caching support
   - Implement agent run caching
   - Cache based on agent config + input
   - Support cache invalidation

2. Guardrails support
   - Support input guardrails from config
   - Support output guardrails from config
   - Integrate with agents SDK guardrail system

3. Performance optimization
   - Profile agent runs
   - Optimize trace export
   - Optimize tool loading

4. Error handling improvements
   - Better error messages
   - Graceful degradation
   - Retry logic for transient failures

**Testing:**

- Test caching behavior
- Test guardrails
- Performance benchmarks
- Error scenario testing

---

## Testing Strategy

### Unit Tests

**File:** `test/providers/openai/agents.test.ts`

```typescript
describe('OpenAiAgentsProvider', () => {
  describe('initialization', () => {
    it('should load agent from file', async () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        config: { agent: 'file://./test/fixtures/test-agent.ts' },
      });
      // Assert agent loaded correctly
    });

    it('should load agent from inline config', async () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        config: {
          agent: {
            name: 'Test Agent',
            instructions: 'You are a test',
          },
        },
      });
      // Assert agent created correctly
    });
  });

  describe('callApi', () => {
    it('should run agent and return final output', async () => {
      const provider = new OpenAiAgentsProvider('test-agent', {
        config: { agent: testAgentConfig },
      });

      const response = await provider.callApi('Hello');

      expect(response.output).toBeTruthy();
      expect(response.tokenUsage).toBeDefined();
    });

    it('should handle tool execution', async () => {
      // Test with mocked tools
    });

    it('should handle handoffs', async () => {
      // Test multi-agent workflow
    });
  });
});
```

**File:** `test/providers/openai/agents-tracing.test.ts`

```typescript
describe('OTLPTracingExporter', () => {
  it('should transform spans to OTLP format', () => {
    const exporter = new OTLPTracingExporter({});
    const spans = createTestSpans();
    const otlp = exporter.transformToOTLP(spans);

    expect(otlp.resourceSpans).toBeDefined();
    expect(otlp.resourceSpans[0].scopeSpans[0].spans).toHaveLength(spans.length);
  });

  it('should export to OTLP endpoint', async () => {
    // Mock fetch
    // Test export
    // Verify POST request made correctly
  });

  it('should handle export failures gracefully', async () => {
    // Test error handling
  });
});
```

### Integration Tests

**File:** `test/providers/openai/agents.integration.test.ts`

```typescript
describe('OpenAiAgentsProvider Integration', () => {
  it('should run end-to-end agent workflow', async () => {
    // Start OTLP receiver
    // Create provider with real agent
    // Run callApi
    // Verify output
    // Verify traces in database
    // Stop OTLP receiver
  });

  it('should work with promptfoo eval', async () => {
    // Run full promptfoo eval with agent provider
    // Verify results
  });
});
```

### Example Tests

Create examples that serve as tests:

- `examples/openai-agents/basic/` - Simple agent with one tool
- `examples/openai-agents/handoffs/` - Multi-agent with handoffs
- `examples/openai-agents/customer-service/` - Complex workflow
- `examples/openai-agents/mocked-tools/` - Using mocked tools

Each example should have:

- `promptfooconfig.yaml`
- Agent definitions in `agents/`
- Tool definitions in `tools/`
- `README.md` explaining the example
- `package.json` with dependencies

Run all examples in CI to ensure they work.

---

## Documentation Plan

### Provider Documentation

**File:** `site/docs/providers/openai-agents.md`

**Sections:**

1. Overview
   - What is openai-agents-js
   - Why test agents
   - How it works in promptfoo

2. Installation
   - `npm install @openai/agents zod@3`
   - Environment variables

3. Basic Usage
   - Simple agent configuration
   - File-based agent definitions
   - Inline agent definitions

4. Agent Definition
   - Agent structure
   - Instructions (static and dynamic)
   - Model configuration
   - Output types

5. Tools
   - Tool definition format
   - File-based tools
   - Inline tools
   - Tool execution modes (real vs mock)
   - Tool mocking

6. Handoffs
   - Multi-agent workflows
   - Handoff configuration
   - Orchestrator patterns

7. Guardrails
   - Input guardrails
   - Output guardrails
   - Guardrail configuration

8. Tracing
   - Enabling tracing
   - Viewing traces in UI
   - Trace attributes
   - OTLP endpoint configuration

9. Configuration Reference
   - All config options
   - Type definitions
   - Defaults

10. Examples
    - Links to example projects
    - Common patterns

11. Troubleshooting
    - Common errors
    - Debugging tips
    - Performance issues

### Guide Documentation

**File:** `site/docs/guides/testing-ai-agents.md`

**Sections:**

1. Introduction to Agent Testing
2. Setting Up Your First Agent Test
3. Testing Tool Execution
4. Testing Multi-Agent Workflows
5. Assertions for Agent Outputs
6. Using Tracing for Debugging
7. Mocking Tools for Deterministic Tests
8. Performance Testing Agents
9. Best Practices

---

## Dependencies

### Package Dependencies

Add to `package.json`:

```json
{
  "dependencies": {
    "@openai/agents": "^0.1.11",
    "zod": "^3.25.40"
  }
}
```

Note: `zod` is a peer dependency of `@openai/agents`, but we should include it as a direct dependency since we use it in our codebase already.

### Optional Dependencies

The agent provider should work without these, but supports them if available:

- Existing OpenAI configuration
- Existing tracing infrastructure

---

## Migration and Backward Compatibility

### No Breaking Changes

This integration introduces only new functionality:

- New provider type: `openai:agents:*`
- New configuration options
- New tracing attributes

All existing providers and configurations continue to work unchanged.

### Opt-In Tracing

Tracing is opt-in via:

1. Test metadata: `tracingEnabled: true`
2. Provider config: `tracing: true`
3. Environment: `PROMPTFOO_TRACING_ENABLED=true`

If tracing not enabled, agent runs work normally without trace export.

---

## Implementation Phases

### Phase 1: MVP (Weeks 1-2)

- ✅ Core provider implementation
- ✅ File-based agent definitions
- ✅ Basic tool support
- ✅ OTLP tracing integration
- ✅ One complete example
- ✅ Basic unit tests

**Deliverable:** Working provider that can run simple agents with tracing

### Phase 2: Polish (Week 3)

- ✅ Tool execution modes (real/mock)
- ✅ Tool mocking system
- ✅ Handoffs support
- ✅ Multiple examples
- ✅ Integration tests
- ✅ Provider documentation

**Deliverable:** Production-ready provider with examples and docs

### Phase 3: Advanced (Week 4)

- ✅ Caching support
- ✅ Guardrails support
- ✅ Performance optimization
- ✅ Guide documentation
- ✅ Error handling improvements

**Deliverable:** Fully-featured provider with guides and optimizations

---

## Open Questions

### 1. Agent Definition Caching

**Question:** Should we cache loaded agent definitions between test cases?

**Options:**

- A) Cache by file path - faster but might miss changes
- B) Always reload - slower but always fresh
- C) Watch files and invalidate cache - complex but optimal

**Recommendation:** Start with B (always reload), add A (caching) in Phase 3 if performance is an issue.

### 2. Streaming Support

**Question:** Should we support streaming agent responses?

**Options:**

- A) No streaming in v1 - simpler implementation
- B) Stream to console only - useful for debugging
- C) Full streaming support - matches other providers

**Recommendation:** A for MVP, consider B or C in future based on user feedback.

### 3. Conversation State Management

**Question:** Should we support continuing conversations across test cases?

**Options:**

- A) Each test case is independent - simpler, more isolated
- B) Support optional conversation continuity - more flexible
- C) Automatic conversation threading - too magical

**Recommendation:** A for now, consider B if users request it.

### 4. Tool Override API

**Question:** How should users override tool behavior for testing?

**Options:**

- A) Config-based mocks (as designed) - declarative
- B) Programmatic hooks - more flexible
- C) Both - most powerful but complex

**Recommendation:** A for MVP, can add B if needed.

---

## Future Enhancements

### Post-MVP Features (Not in Initial Scope)

1. **Agent-Specific Assertions**
   - `assert-tool-called`: Assert specific tool was invoked
   - `assert-agent-used`: Assert specific agent was activated
   - `assert-turn-count`: Assert number of agent turns
   - `assert-handoff-path`: Assert agent handoff sequence

2. **Streaming Support**
   - Stream agent output during development
   - Real-time trace updates in UI
   - Progress indicators for long-running agents

3. **Conversation Management**
   - Persist conversation state across test cases
   - Test multi-turn conversation flows
   - Conversation history assertions

4. **Advanced Tool Testing**
   - Tool call history tracking
   - Tool call order assertions
   - Tool parameter validation
   - Tool retry behavior testing

5. **Performance Profiling**
   - Token usage by agent/tool
   - Latency breakdown by span
   - Cost analysis per agent turn
   - Performance regression detection

6. **UI Enhancements**
   - Agent-specific visualizations
   - Tool call timeline view
   - Handoff flow diagram
   - Interactive trace exploration

7. **Integration with Other Frameworks**
   - LangChain agent adapter
   - CrewAI integration
   - Semantic Kernel support

---

## Risk Assessment

### Technical Risks

| Risk                            | Impact | Likelihood | Mitigation                                  |
| ------------------------------- | ------ | ---------- | ------------------------------------------- |
| openai-agents-js API changes    | High   | Medium     | Pin to specific version, monitor releases   |
| OTLP format incompatibility     | Medium | Low        | Extensive testing, validation layer         |
| Performance issues with tracing | Medium | Medium     | Make tracing optional, optimize export      |
| File loading security issues    | High   | Low        | Validate file paths, sanitize imports       |
| Tool execution side effects     | Medium | Medium     | Clear documentation, mock-by-default option |

### Product Risks

| Risk                                    | Impact | Likelihood | Mitigation                                   |
| --------------------------------------- | ------ | ---------- | -------------------------------------------- |
| Users expect agent-specific features    | Medium | High       | Clear documentation of scope, future roadmap |
| Complex agent configs hard to manage    | Medium | Medium     | Good examples, validation, error messages    |
| Debugging agent failures difficult      | High   | Medium     | Excellent tracing, detailed error messages   |
| Performance issues with long agent runs | Medium | Medium     | Timeouts, progress indicators, optimization  |

---

## Success Metrics

### Technical Metrics

- ✅ Unit test coverage > 80%
- ✅ All integration tests passing
- ✅ All examples run successfully
- ✅ Zero P0/P1 bugs in first month

### Adoption Metrics

- Target: 50+ agent provider uses in first month
- Target: 5+ community examples/guides
- Target: 10+ GitHub issues/discussions about agents
- Target: Positive feedback in user interviews

### Performance Metrics

- Agent run overhead < 100ms
- Trace export overhead < 50ms
- File loading overhead < 200ms
- Memory usage increase < 50MB

---

## Conclusion

This design provides a **minimal, focused integration** of openai-agents-js into promptfoo as a standard provider with excellent tracing support. The implementation follows promptfoo's existing patterns, requires no core changes, and enables comprehensive agent workflow testing while maintaining full backward compatibility.

The phased approach allows for rapid MVP delivery while leaving room for advanced features based on user feedback. The emphasis on tracing ensures excellent observability and debugging capabilities from day one.

**Next Steps:**

1. Review and approve this design
2. Set up development environment with openai-agents-js
3. Begin Phase 1 implementation
4. Create tracking issue with task breakdown
5. Schedule weekly check-ins to review progress
