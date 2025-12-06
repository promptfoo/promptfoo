# AWS Bedrock Converse API Implementation Plan

## Executive Summary

This plan outlines the implementation of the AWS Bedrock Converse API with extended thinking ("ultrathink") support. The Converse API provides a unified interface across all Bedrock models, native reasoning/thinking support, and improved streaming capabilities.

## Background Research

### Current Implementation Analysis

**Current State:**

- Uses `InvokeModel` API exclusively for all models
- Model-specific handlers (`CLAUDE_MESSAGES`, `AMAZON_NOVA`, `LLAMA3`, etc.) format requests differently
- Thinking support exists but uses model-specific output parsing
- No streaming in the main completion provider (only in Nova Sonic and Agents providers)
- 2,147 lines in `src/providers/bedrock/index.ts` with significant complexity

**Key Files:**

- `src/providers/bedrock/index.ts` - Main provider (2,147 lines)
- `src/providers/bedrock/util.ts` - Nova utilities
- `src/providers/bedrock/nova-sonic.ts` - Bidirectional streaming
- `src/providers/bedrock/agents.ts` - Bedrock Agents
- `src/providers/bedrock/knowledgeBase.ts` - RAG provider

### Converse API Benefits

1. **Unified Interface**: Single API format across all supported models
2. **Native Reasoning**: `reasoningContent` blocks for extended thinking
3. **Built-in Tool Support**: Standardized tool calling format
4. **Guardrail Integration**: First-class guardrail support
5. **Performance Config**: `latency: "standard" | "optimized"` options
6. **Service Tier**: `priority`, `default`, `flex` tiers
7. **Streaming**: `ConverseStreamCommand` for streaming responses
8. **Cache Support**: `cacheReadInputTokens`, `cacheWriteInputTokens` in usage

### Models Supporting Converse API

From AWS documentation, the Converse API supports:

- **Claude models**: All Claude 3.x and 4.x models
- **Amazon Nova**: Lite, Micro, Pro, Premier (but NOT Sonic)
- **Meta Llama**: 3.x, 4.x models
- **Mistral**: All Mistral models
- **Cohere**: Command R and R+ models
- **AI21**: Jamba models

### Extended Thinking ("Ultrathink")

The Converse API supports thinking/reasoning through:

- `reasoningContent` content block in responses
- Contains `reasoningText` (with text and signature) or `redactedContent`
- Configured via `additionalModelRequestFields.thinking`

---

## Implementation Strategy

### Approach: Parallel Implementation

Rather than replacing the existing InvokeModel implementation, we'll:

1. Add a new `AwsBedrockConverseProvider` class
2. Keep existing provider for backward compatibility
3. Allow users to opt-in via provider ID: `bedrock:converse:model-id`
4. Eventually migrate as the default once stable

### Why Parallel?

1. **Low Risk**: Existing functionality unchanged
2. **Gradual Migration**: Users can test new API without breaking configs
3. **Fallback**: Can fall back to InvokeModel for unsupported features
4. **Simpler Code**: Converse provider will be cleaner without legacy handlers

---

## Implementation Tasks

### Phase 1: Core Converse Provider

#### Task 1.1: Create Base Converse Provider Class

**File**: `src/providers/bedrock/converse.ts`

```typescript
// New file structure
export interface BedrockConverseOptions extends BedrockOptions {
  // Standard Converse API params
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];

  // Extended thinking
  thinking?: {
    type: 'enabled';
    budget_tokens: number;
  };
  showThinking?: boolean;

  // Performance
  performanceConfig?: {
    latency: 'standard' | 'optimized';
  };
  serviceTier?: {
    type: 'priority' | 'default' | 'flex';
  };

  // Tools
  tools?: ConverseToolConfig[];
  toolChoice?: 'auto' | 'any' | { tool: { name: string } };

  // Additional model params
  additionalModelRequestFields?: Record<string, any>;
}

export class AwsBedrockConverseProvider extends AwsBedrockGenericProvider {
  // Core implementation using ConverseCommand
}
```

**Implementation Details:**

- Import `ConverseCommand` from `@aws-sdk/client-bedrock-runtime`
- Build unified request format from config
- Handle response parsing with reasoning content
- Support `showThinking` parameter

#### Task 1.2: Message Format Conversion

**Function**: `convertToConverseMessages(prompt: string)`

Convert various prompt formats to Converse message format:

- Plain text → User message with text content
- JSON array → Parse roles and content blocks
- Structured prompt → Extract system, user, assistant messages

```typescript
interface ConverseMessage {
  role: 'user' | 'assistant';
  content: ContentBlock[];
}

interface ContentBlock {
  text?: string;
  image?: ImageBlock;
  document?: DocumentBlock;
  toolUse?: ToolUseBlock;
  toolResult?: ToolResultBlock;
  guardContent?: GuardrailContentBlock;
  reasoningContent?: ReasoningContentBlock;
}
```

#### Task 1.3: Response Parsing

**Function**: `parseConverseResponse(response: ConverseResponse)`

Handle all response content types:

- `text` blocks → Join as string
- `reasoningContent` → Extract thinking with signature
- `toolUse` → Format tool calls
- Token usage extraction with cache tokens
- Stop reason mapping

```typescript
function parseConverseResponse(
  response: ConverseResponse,
  showThinking: boolean,
): {
  output: string;
  tokenUsage: TokenUsage;
  stopReason: string;
  reasoning?: string;
};
```

### Phase 2: Extended Thinking Support

#### Task 2.1: Thinking Configuration

Enable extended thinking via `additionalModelRequestFields`:

```typescript
// For Claude models
additionalModelRequestFields: {
  thinking: {
    type: 'enabled',
    budget_tokens: 16000
  }
}
```

**Documentation config example:**

```yaml
providers:
  - id: bedrock:converse:us.anthropic.claude-sonnet-4-5-20250929-v1:0
    config:
      region: us-east-1
      maxTokens: 20000
      thinking:
        type: enabled
        budget_tokens: 16000
      showThinking: true
```

#### Task 2.2: Reasoning Output Parsing

Handle `reasoningContent` in response:

```typescript
function extractReasoningContent(content: ContentBlock[], showThinking: boolean): string {
  return content
    .map((block) => {
      if (block.reasoningContent) {
        if (block.reasoningContent.reasoningText && showThinking) {
          return `Thinking: ${block.reasoningContent.reasoningText.text}\nSignature: ${block.reasoningContent.reasoningText.signature}`;
        } else if (block.reasoningContent.redactedContent && showThinking) {
          return `Redacted Thinking: [redacted]`;
        }
      }
      if (block.text) {
        return block.text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}
```

### Phase 3: Tool Calling Support

#### Task 3.1: Tool Configuration Conversion

Convert promptfoo tool format to Converse format:

```typescript
interface ConverseToolConfig {
  toolSpec: {
    name: string;
    description?: string;
    inputSchema: { json: object };
  };
}

function convertToolConfig(tools: any[]): ConverseToolConfig[] {
  // Convert from Anthropic/OpenAI format to Converse format
}
```

#### Task 3.2: Tool Use Response Handling

Parse tool use blocks and format for output:

```typescript
function handleToolUseResponse(content: ContentBlock[]): string {
  const toolUses = content.filter((b) => b.toolUse);
  return toolUses
    .map((t) =>
      JSON.stringify({
        toolUseId: t.toolUse.toolUseId,
        name: t.toolUse.name,
        input: t.toolUse.input,
      }),
    )
    .join('\n\n');
}
```

### Phase 4: Streaming Support

#### Task 4.1: Implement ConverseStreamCommand

**File**: Add streaming to `converse.ts`

```typescript
async callApiWithStreaming(prompt: string): Promise<ProviderResponse> {
  const command = new ConverseStreamCommand({
    modelId: this.modelName,
    messages: convertToConverseMessages(prompt),
    // ... config
  });

  const response = await client.send(command);

  let output = '';
  let reasoning = '';

  for await (const event of response.stream) {
    if (event.contentBlockDelta) {
      if (event.contentBlockDelta.delta?.text) {
        output += event.contentBlockDelta.delta.text;
      }
      if (event.contentBlockDelta.delta?.reasoningContent) {
        reasoning += event.contentBlockDelta.delta.reasoningContent.text;
      }
    }
    // Handle metadata, stop, usage events
  }

  return { output, tokenUsage, reasoning };
}
```

### Phase 5: Provider Registration & Integration

#### Task 5.1: Provider Registration

**File**: Update `src/providers/index.ts`

Add provider registration for `bedrock:converse:*` pattern:

```typescript
// In loadApiProvider function
if (providerPath.startsWith('bedrock:converse:')) {
  const modelId = providerPath.replace('bedrock:converse:', '');
  return new AwsBedrockConverseProvider(modelId, { config: providerOptions });
}
```

#### Task 5.2: Backward Compatibility

Ensure existing `bedrock:*` providers continue to work:

- Keep `AwsBedrockCompletionProvider` as default
- Add opt-in flag `useConverseApi: true` in config
- Future: Make Converse API default with `useLegacyApi: true` fallback

### Phase 6: Testing

#### Task 6.1: Unit Tests

**File**: `test/providers/bedrock/converse.test.ts`

Test cases:

1. Basic message conversion
2. System message handling
3. Multi-turn conversation
4. Extended thinking configuration
5. Reasoning output parsing with `showThinking: true/false`
6. Tool configuration conversion
7. Tool use response handling
8. Token usage extraction (including cache tokens)
9. Error handling (ValidationException, ThrottlingException)
10. Inference profile ARN handling

#### Task 6.2: Integration Tests

Add to `test/integration/providers/bedrock.test.ts`:

- Live API call with Converse
- Extended thinking end-to-end
- Tool calling flow
- Streaming response

### Phase 7: Documentation & Examples

#### Task 7.1: Documentation Update

**File**: `site/docs/providers/aws-bedrock.md`

Add section for Converse API:

```markdown
## Using the Converse API

The Converse API provides a unified interface with native extended thinking support.

### Enabling Converse API

Use the `bedrock:converse:` prefix:

\`\`\`yaml
providers:

- id: bedrock:converse:us.anthropic.claude-sonnet-4-5-20250929-v1:0
  config:
  region: us-east-1
  maxTokens: 20000
  \`\`\`

### Extended Thinking (Ultrathink)

Enable Claude's extended thinking for complex reasoning tasks:

\`\`\`yaml
providers:

- id: bedrock:converse:us.anthropic.claude-sonnet-4-5-20250929-v1:0
  config:
  thinking:
  type: enabled
  budget_tokens: 16000
  showThinking: true
  \`\`\`
```

#### Task 7.2: Example Configuration

**File**: `examples/amazon-bedrock/promptfooconfig.converse.yaml`

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Bedrock Converse API with Extended Thinking'

prompts:
  - 'Solve this step by step: {{problem}}'

providers:
  - id: bedrock:converse:us.anthropic.claude-sonnet-4-5-20250929-v1:0
    label: Claude Sonnet 4.5 (Converse)
    config:
      region: us-east-1
      maxTokens: 20000
      thinking:
        type: enabled
        budget_tokens: 16000
      showThinking: true
      performanceConfig:
        latency: optimized

tests:
  - vars:
      problem: 'What is the 100th prime number?'
  - vars:
      problem: 'Prove that sqrt(2) is irrational'
```

---

## Technical Details

### AWS SDK Types

The Converse API uses these key types from `@aws-sdk/client-bedrock-runtime`:

```typescript
import {
  ConverseCommand,
  ConverseStreamCommand,
  type ConverseCommandInput,
  type ConverseCommandOutput,
  type Message,
  type ContentBlock,
  type InferenceConfiguration,
  type ToolConfiguration,
  type GuardrailConfiguration,
  type PerformanceConfiguration,
  type ServiceTier,
} from '@aws-sdk/client-bedrock-runtime';
```

### Request Structure

```typescript
const input: ConverseCommandInput = {
  modelId: string,
  messages: Message[],
  system?: SystemContentBlock[],
  inferenceConfig?: {
    maxTokens?: number,
    temperature?: number,
    topP?: number,
    stopSequences?: string[],
  },
  toolConfig?: {
    tools: Tool[],
    toolChoice?: ToolChoice,
  },
  guardrailConfig?: {
    guardrailIdentifier: string,
    guardrailVersion: string,
    trace?: 'enabled' | 'disabled',
  },
  additionalModelRequestFields?: Document,
  performanceConfig?: {
    latency: 'standard' | 'optimized',
  },
  serviceTier?: {
    type: 'priority' | 'default' | 'flex',
  },
};
```

### Response Structure

```typescript
interface ConverseCommandOutput {
  output: {
    message: {
      role: 'assistant';
      content: ContentBlock[];
    };
  };
  stopReason:
    | 'end_turn'
    | 'tool_use'
    | 'max_tokens'
    | 'stop_sequence'
    | 'guardrail_intervened'
    | 'content_filtered';
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadInputTokens?: number;
    cacheWriteInputTokens?: number;
  };
  metrics: {
    latencyMs: number;
  };
  trace?: ConverseTrace;
}
```

### Content Block Types

```typescript
type ContentBlock =
  | { text: string }
  | { image: ImageBlock }
  | { document: DocumentBlock }
  | { toolUse: ToolUseBlock }
  | { toolResult: ToolResultBlock }
  | { guardContent: GuardrailContentBlock }
  | { reasoningContent: ReasoningContentBlock };

interface ReasoningContentBlock {
  reasoningText?: {
    text: string;
    signature?: string;
  };
  redactedContent?: Uint8Array;
}
```

---

## Migration Path

### Short-term (This Implementation)

1. Add `bedrock:converse:` provider prefix
2. Users opt-in to new API explicitly
3. Existing `bedrock:` providers unchanged

### Medium-term

1. Add `useConverseApi: true` config option for existing providers
2. Test across all supported models
3. Identify any feature gaps

### Long-term

1. Make Converse API the default for supported models
2. Add `useLegacyApi: true` for backward compatibility
3. Deprecate model-specific handlers
4. Simplify codebase significantly

---

## Risk Assessment

### Low Risk

- Parallel implementation doesn't affect existing users
- AWS SDK types provide compile-time safety
- Converse API is GA and well-documented

### Medium Risk

- Some edge cases may differ between InvokeModel and Converse
- Not all models support all Converse features
- Streaming implementation requires careful testing

### Mitigation

- Comprehensive test coverage
- Feature flags for gradual rollout
- Clear documentation of differences

---

## Success Criteria

1. **Functional**: All Claude, Nova, Llama, Mistral models work via Converse API
2. **Thinking**: Extended thinking works with `showThinking` toggle
3. **Tools**: Tool calling works consistently across models
4. **Streaming**: ConverseStream works for real-time output
5. **Performance**: No regression in API latency or token counting
6. **Tests**: 90%+ coverage for new code
7. **Documentation**: Clear examples and migration guide

---

## File Changes Summary

### New Files

- `src/providers/bedrock/converse.ts` - Main Converse provider
- `test/providers/bedrock/converse.test.ts` - Unit tests
- `examples/amazon-bedrock/promptfooconfig.converse.yaml` - Example config

### Modified Files

- `src/providers/bedrock/index.ts` - Export new provider
- `src/providers/index.ts` - Register provider
- `site/docs/providers/aws-bedrock.md` - Documentation
- `examples/amazon-bedrock/README.md` - Update examples list

### Estimated Lines of Code

- New Converse provider: ~600-800 lines
- Tests: ~400-500 lines
- Documentation: ~150 lines
- Total: ~1,200-1,500 lines

---

## Dependencies

### Required (already installed)

- `@aws-sdk/client-bedrock-runtime` - Already a dependency

### No New Dependencies Required

The Converse API is part of the existing Bedrock Runtime SDK.

---

## Open Questions

1. **Streaming Priority**: Should streaming be Phase 4 or earlier?
2. **Default API**: Should we make Converse the default immediately for new configs?
3. **Feature Parity**: Are there any InvokeModel features not available in Converse?
4. **Model Coverage**: Which models to test first?

---

## Next Steps

1. Review and approve this plan
2. Create feature branch: `feat/bedrock-converse-api`
3. Implement Phase 1 (Core Provider)
4. Add unit tests
5. Implement Phase 2 (Extended Thinking)
6. Manual testing with real AWS credentials
7. Implement remaining phases
8. Documentation and examples
9. PR review and merge
