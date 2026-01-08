# xAI Voice Agent API Provider Implementation Plan

## Executive Summary

This document outlines the integration plan for xAI's Grok Voice Agent API into promptfoo. The Voice Agent API provides real-time, bidirectional voice communication with Grok models, enabling evaluation of voice-based AI agents similar to how we support OpenAI's Realtime API and ElevenLabs Conversational Agents.

## Background

### xAI Voice Agent API Overview

The Grok Voice Agent API, launched December 2025, provides:

- **Real-time WebSocket communication** at `wss://api.x.ai/v1/realtime`
- **Sub-700ms latency** for natural conversational turn-taking
- **Similar protocol to OpenAI Realtime** but with xAI-specific differences
- **Unified pipeline** - STT, LLM, and TTS in a single connection
- **100+ languages** with automatic language detection
- **5 voice options** - Ara (default), Rex, Sal, Eve, Leo
- **Built-in tools** - web_search, x_search, file_search (collections)
- **Custom function tools** - JSON schema-based function calling
- **Server VAD** - Automatic voice activity detection with barge-in support
- **Flat pricing** - $0.05/minute of connection time

### Sources

- [xAI Voice Agent API Documentation](https://docs.x.ai/docs/guides/voice)
- [xAI Voice Agent API Announcement](https://x.ai/news/grok-voice-agent-api)
- [xAI Cookbook Voice Examples](https://github.com/xai-org/xai-cookbook/tree/main/voice-examples/agent)
- [LiveKit xAI Partnership Blog](https://blog.livekit.io/xai-livekit-partnership-grok-voice-agent-api/)

## Current State Analysis

### Existing xAI Providers

The codebase already has robust xAI support:

| Provider Path           | File                             | Purpose                                                  |
| ----------------------- | -------------------------------- | -------------------------------------------------------- |
| `xai:<model>`           | `src/providers/xai/chat.ts`      | Chat completions (OpenAI-compatible)                     |
| `xai:image:<model>`     | `src/providers/xai/image.ts`     | Image generation (grok-2-image)                          |
| `xai:responses:<model>` | `src/providers/xai/responses.ts` | Agent Tools API (web_search, x_search, code_interpreter) |

### Existing Voice/Realtime Providers

We have two reference implementations:

#### OpenAI Realtime Provider (`src/providers/openai/realtime.ts`)

- ~1750 lines of WebSocket handling
- PCM16 audio format with WAV conversion
- Support for text + audio modalities
- Function calling via WebSocket events
- Persistent connection support
- Audio transcript handling

#### ElevenLabs Agents Provider (`src/providers/elevenlabs/agents/`)

- REST-based simulation API (not WebSocket)
- Agent creation and configuration
- Evaluation criteria support
- Tool mocking capabilities
- Conversation parsing

### Key Observations

1. **OpenAI Realtime pattern is closest match** - xAI Voice API uses WebSocket protocol compatible with OpenAI Realtime API
2. **Audio handling already exists** - PCM16 to WAV conversion in realtime.ts
3. **Provider registration pattern** - Registry at `src/providers/registry.ts:1133` handles xai:\* routing
4. **Cost tracking** - xAI has existing cost calculation in `chat.ts:calculateXAICost()`

## Technical Architecture

### Provider Path Format

```
xai:voice:<model>
```

Examples:

- `xai:voice:grok-3` - Grok 3 voice model
- `xai:voice:grok-3-fast` - Fast voice model
- `xai:voice:grok-4` - Latest voice model

### API Endpoints

**WebSocket Endpoint:**

```
wss://api.x.ai/v1/realtime
```

**Ephemeral Token Endpoint (for client-side auth):**

```
POST https://api.x.ai/v1/realtime/client_secrets
```

### Authentication

Two authentication methods:

1. **Direct API Key** (server-side only):

```typescript
const ws = new WebSocket('wss://api.x.ai/v1/realtime', {
  headers: { Authorization: `Bearer ${XAI_API_KEY}` },
});
```

2. **Ephemeral Token** (client-side safe):

```typescript
// First, fetch token from your server
const response = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
  method: 'POST',
  headers: { Authorization: `Bearer ${XAI_API_KEY}` },
  body: JSON.stringify({ expires_after: { seconds: 300 } }),
});
const { client_secret } = await response.json();
// Then connect with ephemeral token
```

### Available Voices

| Voice   | Type    | Tone                  | Description                                  |
| ------- | ------- | --------------------- | -------------------------------------------- |
| **Ara** | Female  | Warm, friendly        | Default voice, balanced and conversational   |
| **Rex** | Male    | Confident, clear      | Professional, ideal for business             |
| **Sal** | Neutral | Smooth, balanced      | Versatile, suitable for various contexts     |
| **Eve** | Female  | Energetic, upbeat     | Engaging, great for interactive experiences  |
| **Leo** | Male    | Authoritative, strong | Decisive, suitable for instructional content |

### Audio Format

**Supported Formats:**

| Format       | Encoding                | Sample Rate              |
| ------------ | ----------------------- | ------------------------ |
| `audio/pcm`  | Linear16, Little-endian | Configurable (see below) |
| `audio/pcmu` | G.711 μ-law             | 8000 Hz fixed            |
| `audio/pcma` | G.711 A-law             | 8000 Hz fixed            |

**Supported Sample Rates (PCM only):**

| Rate         | Quality        | Description                    |
| ------------ | -------------- | ------------------------------ |
| 8000 Hz      | Telephone      | Narrowband, voice calls        |
| 16000 Hz     | Wideband       | Good for speech recognition    |
| 21050 Hz     | Standard       | Balanced quality               |
| **24000 Hz** | High (Default) | Recommended for most use cases |
| 32000 Hz     | Very High      | Enhanced clarity               |
| 44100 Hz     | CD Quality     | Music/media                    |
| 48000 Hz     | Professional   | Studio-grade/browser           |

**Audio Specifications:**

- Channels: Mono (1 channel)
- Encoding: Base64 string
- Byte Order: Little-endian (16-bit samples)

### Message Protocol

#### Client -> Server Events

```typescript
// Session configuration
{
  type: 'session.update',
  session: {
    voice: 'Ara',
    instructions: 'You are a helpful assistant.',
    turn_detection: { type: 'server_vad' }, // or null for manual
    audio: {
      input: { format: { type: 'audio/pcm', rate: 24000 } },
      output: { format: { type: 'audio/pcm', rate: 24000 } }
    },
    tools: [/* tool definitions */]
  }
}

// Create conversation item (text)
{
  type: 'conversation.item.create',
  item: {
    type: 'message',
    role: 'user',
    content: [{ type: 'input_text', text: 'Hello!' }]
  }
}

// Append audio to buffer
{ type: 'input_audio_buffer.append', audio: '<base64_audio>' }

// Commit audio buffer (manual VAD only)
{ type: 'input_audio_buffer.commit' }

// Clear audio buffer
{ type: 'input_audio_buffer.clear' }

// Request response
{ type: 'response.create', response: { modalities: ['text', 'audio'] } }
```

#### Server -> Client Events

```typescript
// Session lifecycle
{ type: 'conversation.created', conversation: { id: 'conv_001' } }
{ type: 'session.updated', session: { ... } }

// VAD events (server_vad mode)
{ type: 'input_audio_buffer.speech_started', item_id: 'msg_003' }
{ type: 'input_audio_buffer.speech_stopped', item_id: 'msg_003' }
{ type: 'input_audio_buffer.committed', item_id: 'msg_002' }

// Transcription
{ type: 'conversation.item.input_audio_transcription.completed', transcript: '...' }
{ type: 'conversation.item.added', item: { role: 'user', content: [...] } }

// Response streaming
{ type: 'response.created', response: { id: 'resp_001', status: 'in_progress' } }
{ type: 'response.output_item.added', item: { role: 'assistant', ... } }
{ type: 'response.output_audio_transcript.delta', delta: '<text>' }
{ type: 'response.output_audio_transcript.done' }
{ type: 'response.output_audio.delta', delta: '<base64_audio>' }
{ type: 'response.output_audio.done' }
{ type: 'response.done', response: { status: 'completed' } }

// Function calls
{ type: 'response.function_call_arguments.done', name: 'fn', call_id: 'id', arguments: '{}' }
```

### Tool Support

**Built-in Tools:**

```typescript
// Collections/Document Search
{ type: 'file_search', vector_store_ids: ['collection-id'], max_num_results: 10 }

// Web Search
{ type: 'web_search' }

// X/Twitter Search
{ type: 'x_search', allowed_x_handles: ['elonmusk', 'xai'] }
```

**Custom Function Tools:**

```typescript
{
  type: 'function',
  name: 'get_weather',
  description: 'Get current weather for a location',
  parameters: {
    type: 'object',
    properties: {
      location: { type: 'string', description: 'City name' }
    },
    required: ['location']
  }
}
```

**Function Call Response Flow:**

1. Server sends `response.function_call_arguments.done` with `call_id`
2. Client executes function and sends result:
   ```typescript
   {
     type: 'conversation.item.create',
     item: {
       type: 'function_call_output',
       call_id: '<call_id>',
       output: JSON.stringify(result)
     }
   }
   ```
3. Client sends `{ type: 'response.create' }` to continue

## Implementation Plan

### Phase 1: Core Provider Implementation

#### 1.1 Create Voice Provider File

**File:** `src/providers/xai/voice.ts`

```typescript
import WebSocket from 'ws';
import logger from '../../logger';
import { getEnvString } from '../../envars';
import { maybeLoadToolsFromExternalFile } from '../../util/index';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
  TokenUsage,
} from '../../types/index';

/**
 * Audio format configuration for xAI Voice API
 */
export interface XAIAudioFormat {
  type: 'audio/pcm' | 'audio/pcmu' | 'audio/pcma';
  rate?: 8000 | 16000 | 21050 | 24000 | 32000 | 44100 | 48000; // Only for audio/pcm
}

/**
 * xAI Voice-specific options
 */
export interface XAIVoiceOptions {
  // Authentication
  apiKey?: string;
  apiKeyEnvar?: string;

  // Voice configuration
  voice?: 'Ara' | 'Rex' | 'Sal' | 'Eve' | 'Leo';

  // System instructions
  instructions?: string;

  // Turn detection
  turn_detection?: {
    type: 'server_vad';
  } | null; // null for manual turn management

  // Audio format configuration
  audio?: {
    input?: { format: XAIAudioFormat };
    output?: { format: XAIAudioFormat };
  };

  // Response modalities
  modalities?: ('text' | 'audio')[];

  // Tool configuration
  tools?: XAIVoiceTool[];
  functionCallHandler?: (name: string, args: string) => Promise<string>;

  // Timeouts
  websocketTimeout?: number; // Default: 30000ms
}

/**
 * xAI Voice tool types
 */
export type XAIVoiceTool = XAIFileSearchTool | XAIWebSearchTool | XAIXSearchTool | XAIFunctionTool;

export interface XAIFileSearchTool {
  type: 'file_search';
  vector_store_ids: string[];
  max_num_results?: number;
}

export interface XAIWebSearchTool {
  type: 'web_search';
}

export interface XAIXSearchTool {
  type: 'x_search';
  allowed_x_handles?: string[];
}

export interface XAIFunctionTool {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * xAI Voice API constants
 */
export const XAI_VOICE_WS_URL = 'wss://api.x.ai/v1/realtime';
export const XAI_VOICE_COST_PER_MINUTE = 0.05; // $0.05/minute

export const XAI_VOICE_DEFAULTS = {
  voice: 'Ara' as const,
  sampleRate: 24000,
  audioFormat: 'audio/pcm' as const,
  websocketTimeout: 30000,
};

/**
 * xAI Voice Provider
 *
 * Provides real-time voice conversations with Grok models.
 *
 * Usage:
 *   xai:voice:grok-3
 *   xai:voice:grok-3-fast
 *   xai:voice:grok-4
 */
export class XAIVoiceProvider implements ApiProvider {
  modelName: string;
  config: XAIVoiceOptions;
  env?: EnvOverrides;

  // WebSocket state
  private ws: WebSocket | null = null;
  private connectionStartTime: number = 0;

  constructor(
    modelName: string,
    options: { config?: XAIVoiceOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    this.modelName = modelName;
    this.config = options.config || {};
    this.env = options.env;
  }

  id(): string {
    return `xai:voice:${this.modelName}`;
  }

  toString(): string {
    return `[xAI Voice Provider ${this.modelName}]`;
  }

  protected getApiKey(): string | undefined {
    return this.config.apiKey || getEnvString(this.config.apiKeyEnvar || 'XAI_API_KEY');
  }

  // ... implementation details below
}
```

#### 1.2 Key Implementation Components

**WebSocket Connection Management:**

```typescript
private async createWebSocketConnection(): Promise<WebSocket> {
  const apiKey = this.getApiKey();
  if (!apiKey) {
    throw new Error('XAI_API_KEY is required for voice provider');
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(XAI_VOICE_WS_URL, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'promptfoo xAI Voice Client',
      },
      handshakeTimeout: 10000,
    });

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket connection timeout'));
    }, this.config.websocketTimeout || XAI_VOICE_DEFAULTS.websocketTimeout);

    ws.on('open', () => {
      clearTimeout(timeout);
      this.connectionStartTime = Date.now();
      resolve(ws);
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}
```

**Session Configuration:**

```typescript
private buildSessionConfig(): object {
  const sampleRate = this.config.audio?.input?.format?.rate || XAI_VOICE_DEFAULTS.sampleRate;
  const audioFormat = this.config.audio?.input?.format?.type || XAI_VOICE_DEFAULTS.audioFormat;

  return {
    type: 'session.update',
    session: {
      voice: this.config.voice || XAI_VOICE_DEFAULTS.voice,
      instructions: this.config.instructions || 'You are a helpful assistant.',
      turn_detection: this.config.turn_detection ?? { type: 'server_vad' },
      audio: {
        input: { format: { type: audioFormat, rate: sampleRate } },
        output: { format: { type: audioFormat, rate: sampleRate } },
      },
      ...(this.config.tools && { tools: this.config.tools }),
    },
  };
}
```

**Message Handling:**

```typescript
private handleMessage(message: WebSocketMessage): void {
  switch (message.type) {
    // Session lifecycle
    case 'conversation.created':
      logger.debug('[xAI Voice] Conversation created', { id: message.conversation?.id });
      break;
    case 'session.updated':
      logger.debug('[xAI Voice] Session configured');
      break;

    // VAD events
    case 'input_audio_buffer.speech_started':
      logger.debug('[xAI Voice] Speech started');
      break;
    case 'input_audio_buffer.speech_stopped':
      logger.debug('[xAI Voice] Speech stopped');
      break;

    // Transcription
    case 'conversation.item.input_audio_transcription.completed':
      this.inputTranscript = message.transcript;
      break;

    // Response streaming
    case 'response.output_audio_transcript.delta':
      this.outputTranscript += message.delta;
      break;
    case 'response.output_audio.delta':
      this.audioChunks.push(Buffer.from(message.delta, 'base64'));
      break;
    case 'response.output_audio.done':
      logger.debug('[xAI Voice] Audio complete');
      break;

    // Function calls
    case 'response.function_call_arguments.done':
      this.pendingFunctionCalls.push({
        name: message.name,
        call_id: message.call_id,
        arguments: message.arguments,
      });
      break;

    // Response complete
    case 'response.done':
      this.responseComplete = true;
      break;

    // Errors
    case 'error':
      this.error = message.error?.message || 'Unknown error';
      break;
  }
}
```

**Cost Calculation:**

```typescript
/**
 * Calculate xAI Voice API cost based on connection duration
 * @param durationMs - Duration in milliseconds
 * @returns Cost in dollars
 */
export function calculateXAIVoiceCost(durationMs: number): number {
  const durationMinutes = durationMs / 60000;
  return XAI_VOICE_COST_PER_MINUTE * durationMinutes;
}
```

**Main callApi Implementation:**

```typescript
async callApi(
  prompt: string,
  context?: CallApiContextParams,
  callApiOptions?: CallApiOptionsParams
): Promise<ProviderResponse> {
  const apiKey = this.getApiKey();
  if (!apiKey) {
    return {
      error: 'XAI_API_KEY is not set. Set the environment variable or add apiKey to config.',
    };
  }

  try {
    // Connect to WebSocket
    this.ws = await this.createWebSocketConnection();

    // Configure session
    this.ws.send(JSON.stringify(this.buildSessionConfig()));

    // Send user message
    this.ws.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: prompt }],
      },
    }));

    // Request response
    this.ws.send(JSON.stringify({
      type: 'response.create',
      response: {
        modalities: this.config.modalities || ['text', 'audio'],
      },
    }));

    // Wait for response
    const result = await this.waitForResponse();

    // Calculate duration and cost
    const durationMs = Date.now() - this.connectionStartTime;
    const cost = calculateXAIVoiceCost(durationMs);

    return {
      output: result.transcript,
      cost,
      metadata: {
        voice: this.config.voice || XAI_VOICE_DEFAULTS.voice,
        durationMs,
        ...(result.audio && {
          audio: {
            data: result.audio.toString('base64'),
            format: 'wav',
            transcript: result.transcript,
          },
        }),
      },
    };
  } catch (err) {
    return {
      error: `xAI Voice error: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    this.cleanup();
  }
}
```

#### 1.3 Update Registry

**File:** `src/providers/registry.ts`

Add handling for `xai:voice:*` pattern:

```typescript
// At line ~1150, add new condition:
if (modelType === 'voice') {
  return createXAIVoiceProvider(providerPath, {
    ...providerOptions,
    env: context.env,
  });
}
```

### Phase 2: Advanced Features

#### 2.1 Tool Calling Support

Support for both custom tools and xAI's built-in tools:

```typescript
// Custom function tools (OpenAI-compatible format)
tools: [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get current weather',
      parameters: { /* JSON Schema */ }
    }
  }
]

// xAI built-in tools (if available via voice API)
enableWebSearch: true,
enableXSearch: true
```

#### 2.2 Multi-Turn Conversation Support

Enable conversation context persistence:

```typescript
interface XAIVoiceOptions {
  // ...
  maintainContext?: boolean;
  previousResponseId?: string;
}
```

#### 2.3 Audio Input/Output

Support for audio file inputs in tests:

```yaml
tests:
  - vars:
      audio_input: file://./audio/customer-question.wav
    assert:
      - type: contains
        value: 'appointment'
```

### Phase 3: Testing Infrastructure

#### 3.1 Unit Tests

**File:** `test/providers/xai/voice.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { XAIVoiceProvider } from '../../../src/providers/xai/voice';

// Mock WebSocket
vi.mock('ws', () => ({
  default: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    send: vi.fn(),
    close: vi.fn(),
  })),
}));

describe('XAIVoiceProvider', () => {
  it('should create provider with correct id', () => {
    const provider = new XAIVoiceProvider('grok-3-voice');
    expect(provider.id()).toBe('xai:voice:grok-3-voice');
  });

  it('should handle WebSocket messages correctly', async () => {
    // Test message handling
  });

  it('should calculate cost correctly', () => {
    const cost = calculateXAIVoiceCost(120, 'grok-3-voice');
    expect(cost).toBe(0.1); // 2 minutes * $0.05
  });
});
```

#### 3.2 Integration Tests

**File:** `test/providers/xai/voice.integration.test.ts`

Test against real xAI API (requires `XAI_API_KEY`):

```typescript
describe.skipIf(!process.env.XAI_API_KEY)('XAI Voice Integration', () => {
  it('should complete a voice conversation', async () => {
    const provider = new XAIVoiceProvider('grok-3-voice', {
      config: {
        voice: 'sal',
        instructions: 'You are a helpful assistant.',
      },
    });

    const response = await provider.callApi('Hello, how are you?');

    expect(response.error).toBeUndefined();
    expect(response.output).toBeTruthy();
    expect(response.metadata?.audio).toBeDefined();
  });
});
```

### Phase 4: Documentation

#### 4.1 Provider Documentation

**File:** `site/docs/providers/xai.md` (update existing)

Add new section:

```markdown
### Voice Agent API

Use the `xai:voice:<model>` provider to access xAI's Voice Agent API for real-time voice conversations:

\`\`\`yaml title="promptfooconfig.yaml"
providers:

- id: xai:voice:grok-3
  config:
  voice: Ara
  instructions: "You are a helpful customer service agent."
  modalities: - text - audio
  \`\`\`

#### Available Voices

| Voice   | Type    | Tone                  | Description                                   |
| ------- | ------- | --------------------- | --------------------------------------------- |
| **Ara** | Female  | Warm, friendly        | Default voice, balanced and conversational    |
| **Rex** | Male    | Confident, clear      | Professional, ideal for business applications |
| **Sal** | Neutral | Smooth, balanced      | Versatile, suitable for various contexts      |
| **Eve** | Female  | Energetic, upbeat     | Engaging, great for interactive experiences   |
| **Leo** | Male    | Authoritative, strong | Decisive, suitable for instructional content  |

#### Configuration Options

| Parameter             | Type   | Default                            | Description                                                    |
| --------------------- | ------ | ---------------------------------- | -------------------------------------------------------------- |
| `voice`               | string | 'Ara'                              | Voice persona (Ara, Rex, Sal, Eve, Leo)                        |
| `instructions`        | string | -                                  | System instructions                                            |
| `modalities`          | array  | ['text', 'audio']                  | Response modalities                                            |
| `turn_detection`      | object | `{type: 'server_vad'}`             | VAD config or null for manual                                  |
| `audio.input.format`  | object | `{type: 'audio/pcm', rate: 24000}` | Input audio format                                             |
| `audio.output.format` | object | `{type: 'audio/pcm', rate: 24000}` | Output audio format                                            |
| `tools`               | array  | -                                  | Tool definitions (web_search, x_search, file_search, function) |
| `websocketTimeout`    | number | 30000                              | WebSocket timeout (ms)                                         |

#### Supported Audio Formats

| Format       | Sample Rates                                                |
| ------------ | ----------------------------------------------------------- |
| `audio/pcm`  | 8000, 16000, 21050, 24000 (default), 32000, 44100, 48000 Hz |
| `audio/pcmu` | 8000 Hz (G.711 μ-law)                                       |
| `audio/pcma` | 8000 Hz (G.711 A-law)                                       |

#### Pricing

The Voice Agent API charges **$0.05 per minute** of connection time.

#### Example with Built-in Search Tools

\`\`\`yaml title="promptfooconfig.yaml"
providers:

- id: xai:voice:grok-3
  config:
  voice: Ara
  instructions: "You are a helpful assistant with access to the web."
  tools: - type: web_search - type: x_search
  allowed_x_handles: - elonmusk - xai

tests:

- vars:
  question: "What's the latest news about xAI?"
  assert: - type: contains
  value: xAI
  \`\`\`

#### Example with Custom Function Tools

\`\`\`yaml title="promptfooconfig.yaml"
providers:

- id: xai:voice:grok-3
  config:
  voice: Rex
  tools: - type: function
  name: schedule_appointment
  description: Schedule an appointment for a customer
  parameters:
  type: object
  properties:
  date:
  type: string
  description: Date in YYYY-MM-DD format
  time:
  type: string
  description: Time in HH:MM format
  service:
  type: string
  description: Type of service requested
  required: - date - time

tests:

- vars:
  question: "I'd like to schedule a haircut for tomorrow at 2pm"
  assert: - type: javascript
  value: JSON.stringify(output).includes('schedule_appointment')
  \`\`\`
```

#### 4.2 Example Configuration

**File:** `examples/xai-voice/promptfooconfig.yaml`

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: xAI Voice Agent API Examples

providers:
  - id: xai:voice:grok-3-voice
    config:
      voice: sal
      instructions: |
        You are a helpful customer service agent for a coffee shop.
        Be friendly, concise, and helpful.
      modalities:
        - text
        - audio

prompts:
  - '{{question}}'

tests:
  # Basic conversation
  - vars:
      question: 'What are your hours today?'
    assert:
      - type: llm-rubric
        value: 'Response should mention business hours'

  # Menu inquiry
  - vars:
      question: "What's your most popular drink?"
    assert:
      - type: contains-any
        value: ['coffee', 'latte', 'espresso']

  # Order handling
  - vars:
      question: "I'd like to order a large latte"
    assert:
      - type: llm-rubric
        value: 'Response should confirm the order and ask for any modifications'
```

## File Changes Summary

### New Files

| File                                           | Description                        |
| ---------------------------------------------- | ---------------------------------- |
| `src/providers/xai/voice.ts`                   | Main voice provider implementation |
| `test/providers/xai/voice.test.ts`             | Unit tests                         |
| `test/providers/xai/voice.integration.test.ts` | Integration tests                  |
| `examples/xai-voice/promptfooconfig.yaml`      | Example configuration              |
| `examples/xai-voice/README.md`                 | Example documentation              |

### Modified Files

| File                         | Changes                     |
| ---------------------------- | --------------------------- |
| `src/providers/registry.ts`  | Add xai:voice:\* handler    |
| `src/providers/xai/chat.ts`  | Export shared utilities     |
| `site/docs/providers/xai.md` | Add Voice API documentation |

### Estimated Lines of Code

| Component     | Lines          |
| ------------- | -------------- |
| `voice.ts`    | ~800-1000      |
| Tests         | ~300-400       |
| Documentation | ~200           |
| **Total**     | **~1300-1600** |

## Open Questions

### Resolved (from official documentation)

| Question            | Answer                                                   |
| ------------------- | -------------------------------------------------------- |
| WebSocket endpoint  | `wss://api.x.ai/v1/realtime` (no model in URL)           |
| Available voices    | Ara (default), Rex, Sal, Eve, Leo                        |
| Audio format        | `audio/pcm` (8-48kHz), `audio/pcmu`, `audio/pcma`        |
| Default sample rate | 24000 Hz                                                 |
| Search tools        | `web_search`, `x_search`, `file_search` in session tools |
| Function calling    | Standard JSON schema format in session.tools             |

### Remaining Questions

1. **Model names** - Documentation doesn't specify which models support voice
   - Need to test: `grok-3`, `grok-3-fast`, `grok-4`, etc.
   - May be model-agnostic (endpoint handles routing)

2. **LiveKit integration** - Should we support LiveKit as transport?
   - Adds WebRTC support for browser-based testing
   - Lower priority - WebSocket works for eval use cases

### Product Questions

1. **Audio input support** - Accept audio files as input or text-only initially?
   - Recommendation: Start with text input, add audio file support in Phase 2

2. **Streaming output display** - How to display real-time audio/transcript in UI?
   - Can reuse existing audio player from OpenAI Realtime

3. **Multi-turn conversations** - Support conversation context persistence?
   - xAI Voice maintains context within a WebSocket session
   - Could add `maintainContext` option like OpenAI Realtime

## Implementation Timeline

| Phase     | Duration      | Deliverables                       |
| --------- | ------------- | ---------------------------------- |
| Phase 1   | 3-5 days      | Core provider, basic text-to-voice |
| Phase 2   | 2-3 days      | Tool calling, multi-turn support   |
| Phase 3   | 2-3 days      | Testing infrastructure             |
| Phase 4   | 1-2 days      | Documentation and examples         |
| **Total** | **8-13 days** | Full implementation                |

## Risks and Mitigations

| Risk                             | Impact | Mitigation                                     |
| -------------------------------- | ------ | ---------------------------------------------- |
| API access restrictions          | High   | Confirm API availability before implementation |
| Protocol differences from OpenAI | Medium | Build abstraction layer for protocol handling  |
| Rate limiting                    | Low    | Implement retry logic with backoff             |
| Audio format incompatibilities   | Medium | Test with multiple audio formats               |

## Success Criteria

1. **Functional** - Can complete voice conversations via promptfoo eval
2. **Tested** - Unit and integration tests pass
3. **Documented** - Full documentation and examples
4. **Cost tracking** - Accurate cost calculation per minute
5. **Compatible** - Works with existing promptfoo assertions

## Appendix A: Related Code References

### OpenAI Realtime Provider (Reference Implementation)

- `src/providers/openai/realtime.ts:22-65` - PCM16 to WAV conversion
- `src/providers/openai/realtime.ts:67-102` - Options interface
- `src/providers/openai/realtime.ts:246-747` - WebSocket handling
- `src/providers/openai/realtime.ts:749-913` - Main callApi implementation

### ElevenLabs Agents Provider

- `src/providers/elevenlabs/agents/index.ts` - Provider structure
- `src/providers/elevenlabs/agents/types.ts` - Type definitions
- `src/providers/elevenlabs/websocket-client.ts` - WebSocket patterns

### xAI Existing Providers

- `src/providers/xai/chat.ts:291-323` - Cost calculation
- `src/providers/xai/chat.ts:379-397` - Constructor pattern
- `src/providers/xai/responses.ts:138-166` - Responses API pattern
- `src/providers/registry.ts:1133-1163` - Provider registration

## Appendix B: xAI Voice API Message Reference

Complete message reference from official xAI documentation:

### Client -> Server Events

| Event                       | Description                                                             |
| --------------------------- | ----------------------------------------------------------------------- |
| `session.update`            | Update session configuration (voice, instructions, audio format, tools) |
| `input_audio_buffer.append` | Append base64-encoded audio chunks to buffer                            |
| `input_audio_buffer.commit` | Commit audio buffer as user message (manual VAD only)                   |
| `input_audio_buffer.clear`  | Clear the audio buffer                                                  |
| `conversation.item.create`  | Create a new user message with text content                             |
| `response.create`           | Request the server to generate a response                               |

### Server -> Client Events

| Event                                                   | Description                               |
| ------------------------------------------------------- | ----------------------------------------- |
| `conversation.created`                                  | Conversation session has been created     |
| `session.updated`                                       | Session configuration has been updated    |
| `input_audio_buffer.speech_started`                     | VAD detected start of speech              |
| `input_audio_buffer.speech_stopped`                     | VAD detected end of speech                |
| `input_audio_buffer.committed`                          | Audio buffer has been committed           |
| `input_audio_buffer.cleared`                            | Audio buffer has been cleared             |
| `conversation.item.added`                               | New message added to conversation history |
| `conversation.item.input_audio_transcription.completed` | Input audio transcription complete        |
| `response.created`                                      | New assistant response in progress        |
| `response.output_item.added`                            | Assistant response added to history       |
| `response.output_audio_transcript.delta`                | Streaming text transcript delta           |
| `response.output_audio_transcript.done`                 | Text transcript complete                  |
| `response.output_audio.delta`                           | Streaming audio delta (base64)            |
| `response.output_audio.done`                            | Audio generation complete                 |
| `response.function_call_arguments.done`                 | Function call with complete arguments     |
| `response.done`                                         | Response generation complete              |

### Session Configuration Schema

```typescript
interface SessionConfig {
  type: 'session.update';
  session: {
    voice: 'Ara' | 'Rex' | 'Sal' | 'Eve' | 'Leo';
    instructions: string;
    turn_detection: { type: 'server_vad' } | null;
    audio: {
      input: {
        format: {
          type: 'audio/pcm' | 'audio/pcmu' | 'audio/pcma';
          rate?: 8000 | 16000 | 21050 | 24000 | 32000 | 44100 | 48000;
        };
      };
      output: {
        format: {
          type: 'audio/pcm' | 'audio/pcmu' | 'audio/pcma';
          rate?: 8000 | 16000 | 21050 | 24000 | 32000 | 44100 | 48000;
        };
      };
    };
    tools?: Array<
      | { type: 'web_search' }
      | { type: 'x_search'; allowed_x_handles?: string[] }
      | { type: 'file_search'; vector_store_ids: string[]; max_num_results?: number }
      | { type: 'function'; name: string; description: string; parameters: object }
    >;
  };
}
```

## Appendix C: Comparison with Existing Providers

| Feature             | OpenAI Realtime                    | ElevenLabs Agents             | xAI Voice                         |
| ------------------- | ---------------------------------- | ----------------------------- | --------------------------------- |
| Protocol            | WebSocket                          | REST (simulation)             | WebSocket                         |
| Endpoint            | `wss://api.openai.com/v1/realtime` | `POST /simulate-conversation` | `wss://api.x.ai/v1/realtime`      |
| Audio Formats       | PCM16, G.711                       | MP3, PCM                      | PCM, G.711 μ-law, G.711 A-law     |
| Sample Rates        | 24kHz                              | Various                       | 8-48kHz configurable              |
| Real-time Streaming | Yes                                | No                            | Yes                               |
| Server VAD          | Yes                                | N/A                           | Yes                               |
| Tool Calling        | Yes (functions)                    | Yes (mocked)                  | Yes (functions + built-in)        |
| Built-in Search     | No                                 | No                            | web_search, x_search, file_search |
| Multi-turn          | Yes                                | Yes                           | Yes                               |
| Cost Model          | Per token (audio/text)             | Per minute                    | $0.05/minute                      |
| Voices              | 10 (alloy, echo, etc.)             | 100+                          | 5 (Ara, Rex, Sal, Eve, Leo)       |
| Languages           | Limited                            | Multilingual                  | 100+ (auto-detect)                |
| Barge-in            | Yes                                | N/A                           | Yes                               |

### Key Differences from OpenAI Realtime

1. **Audio config format**: xAI uses nested `audio.input.format` vs OpenAI's flat `input_audio_format`
2. **Format strings**: xAI uses `audio/pcm` vs OpenAI's `pcm16`
3. **Voice names**: xAI uses proper names (Ara, Rex) vs OpenAI's descriptive (alloy, echo)
4. **Built-in tools**: xAI includes web_search, x_search, file_search
5. **Pricing**: xAI charges per minute ($0.05) vs OpenAI's per-token
6. **Event names**: Some differ (e.g., `response.output_audio.delta` vs `response.audio.delta`)
