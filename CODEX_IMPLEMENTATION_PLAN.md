# OpenAI Codex SDK Provider Implementation Plan

## Overview

Implement an OpenAI Codex SDK provider for promptfoo, following the same architectural patterns as the Claude Agent SDK provider. The Codex SDK wraps the bundled codex binary and communicates via JSONL events over stdin/stdout.

**Reference Implementation**: `src/providers/claude-agent-sdk.ts`

---

## Architecture Analysis

### Similarities to Claude Agent SDK

| Feature          | Claude Agent SDK                 | OpenAI Codex SDK                        |
| ---------------- | -------------------------------- | --------------------------------------- |
| **Package**      | `@anthropic-ai/claude-agent-sdk` | `@openai/codex-sdk`                     |
| **License**      | Proprietary (separate install)   | Likely proprietary (separate install)   |
| **Working Dir**  | Configurable, temp by default    | Configurable, CWD by default            |
| **Conversation** | Multi-turn support               | Thread-based persistence                |
| **Streaming**    | Supported                        | `runStreamed()` with events             |
| **Tools**        | Configurable permissions         | Built-in (CLI manages)                  |
| **Output**       | Text responses                   | Text + structured JSON output           |
| **State**        | Stateless per call               | Stateful threads in `~/.codex/sessions` |
| **Caching**      | Custom fingerprinting            | Thread resumption                       |

### Key Differences

1. **Thread Persistence**: Codex saves threads to `~/.codex/sessions` automatically
2. **Git Requirement**: Codex requires Git repo by default (can skip)
3. **Structured Output**: Native JSON schema support with Zod compatibility
4. **Image Support**: Can attach images via `local_image` entries
5. **Event Streaming**: Rich event types (`item.completed`, `turn.completed`, etc.)
6. **CLI Wrapper**: Spawns binary process (not pure Node.js API)

---

## Implementation Plan

### Phase 1: Core Provider Implementation

**File**: `src/providers/openai-codex-sdk.ts`

#### 1.1 Provider Class Structure

```typescript
export class OpenAICodexSDKProvider implements ApiProvider {
  static OPENAI_MODELS = [...]; // Compatible models

  config: OpenAICodexSDKConfig;
  env?: EnvOverrides;
  apiKey?: string;

  private providerId = 'openai:codex-sdk';
  private codexModule?: typeof import('@openai/codex-sdk');
  private codexInstance?: Codex;
  private threads: Map<string, Thread> = new Map(); // Thread pooling

  constructor(options: { id?: string; config?: OpenAICodexSDKConfig; env?: EnvOverrides })
  id(): string
  async callApi(prompt: string, context?: CallApiContextParams, callOptions?: CallApiOptionsParams): Promise<ProviderResponse>
  getApiKey(): string | undefined
  async cleanup(): Promise<void> // Clean up threads
  toString(): string
}
```

#### 1.2 Configuration Interface

```typescript
export interface OpenAICodexSDKConfig {
  apiKey?: string;

  /**
   * Working directory for Codex to operate in
   * Defaults to process.cwd()
   */
  working_dir?: string;

  /**
   * Skip Git repository check (Codex requires Git by default)
   */
  skip_git_repo_check?: boolean;

  /**
   * Model to use (e.g., 'gpt-4', 'gpt-4-turbo')
   */
  model?: string;

  /**
   * Thread management
   */
  thread_id?: string; // Resume existing thread
  persist_threads?: boolean; // Keep threads alive between calls (default: false)
  thread_pool_size?: number; // Max concurrent threads (default: 1)

  /**
   * Output schema for structured JSON responses
   * Supports plain JSON schema or Zod schemas converted with zod-to-json-schema
   */
  output_schema?: Record<string, any>;

  /**
   * Environment variables to pass to Codex CLI
   * By default inherits Node.js process.env
   */
  cli_env?: Record<string, string>;

  /**
   * Custom system instructions (if Codex supports)
   */
  system_prompt?: string;

  /**
   * Max tokens for response
   */
  max_tokens?: number;

  /**
   * Enable streaming events (default: false for simplicity)
   */
  enable_streaming?: boolean;
}
```

#### 1.3 Dynamic Module Loading

```typescript
/**
 * Helper to load the OpenAI Codex SDK ESM module
 * Follows same pattern as Claude Agent SDK loader
 */
async function loadCodexSDK(): Promise<typeof import('@openai/codex-sdk')> {
  try {
    const basePath =
      cliState.basePath && path.isAbsolute(cliState.basePath) ? cliState.basePath : process.cwd();
    const resolveFrom = path.join(basePath, 'package.json');
    const require = createRequire(resolveFrom);
    const codexPath = require.resolve('@openai/codex-sdk');
    return importModule(codexPath);
  } catch (err) {
    logger.error(`Failed to load OpenAI Codex SDK: ${err}`);
    throw new Error(
      dedent`The @openai/codex-sdk package is required but not installed.

      This package may have a proprietary license and is not installed by default.

      To use the OpenAI Codex SDK provider, install it with:
        npm install @openai/codex-sdk

      Requires Node.js 18+.

      For more information, see: https://www.promptfoo.dev/docs/providers/openai-codex-sdk/`,
    );
  }
}
```

#### 1.4 Thread Management Strategy

**Challenge**: Codex uses persistent threads; promptfoo expects stateless calls.

**Solutions**:

1. **Default (Stateless)**: Create new thread per `callApi()`, destroy after
2. **Thread Reuse**: If `persist_threads: true`, pool threads by cache key
3. **Explicit Resume**: If `thread_id` provided, resume that specific thread

```typescript
private async getOrCreateThread(
  config: OpenAICodexSDKConfig,
  cacheKey?: string
): Promise<Thread> {
  // Option 1: Explicit thread_id
  if (config.thread_id) {
    const cached = this.threads.get(config.thread_id);
    if (cached) return cached;

    const thread = this.codexInstance!.resumeThread(config.thread_id);
    if (config.persist_threads) {
      this.threads.set(config.thread_id, thread);
    }
    return thread;
  }

  // Option 2: Thread pooling with cache key
  if (config.persist_threads && cacheKey) {
    const cached = this.threads.get(cacheKey);
    if (cached) return cached;
  }

  // Option 3: Create new thread
  const thread = this.codexInstance!.startThread({
    workingDirectory: config.working_dir,
    skipGitRepoCheck: config.skip_git_repo_check ?? false,
  });

  if (config.persist_threads && cacheKey) {
    // Enforce pool size limit
    if (this.threads.size >= (config.thread_pool_size ?? 1)) {
      const oldestKey = this.threads.keys().next().value;
      this.threads.delete(oldestKey);
    }
    this.threads.set(cacheKey, thread);
  }

  return thread;
}
```

#### 1.5 Core `callApi()` Implementation

```typescript
async callApi(
  prompt: string,
  context?: CallApiContextParams,
  callOptions?: CallApiOptionsParams,
): Promise<ProviderResponse> {
  // Merge configs
  const config: OpenAICodexSDKConfig = {
    ...this.config,
    ...context?.prompt?.config,
  };

  // Set up environment
  const env: Record<string, string> = config.cli_env
    ? { ...config.cli_env }
    : { ...process.env as Record<string, string> };

  if (this.apiKey) {
    env.CODEX_API_KEY = this.apiKey;
  }

  if (!this.apiKey && !env.CODEX_API_KEY && !env.OPENAI_API_KEY) {
    throw new Error(
      'OpenAI API key is not set. Set OPENAI_API_KEY or CODEX_API_KEY environment variable or add "apiKey" to provider config.'
    );
  }

  // Validate working directory if provided
  if (config.working_dir) {
    validateWorkingDirectory(config.working_dir, config.skip_git_repo_check);
  }

  // Check abort signal before starting
  if (callOptions?.abortSignal?.aborted) {
    return { error: 'OpenAI Codex SDK call aborted before it started' };
  }

  // Load SDK module
  if (!this.codexModule) {
    this.codexModule = await loadCodexSDK();
  }

  // Initialize Codex instance
  if (!this.codexInstance) {
    this.codexInstance = new this.codexModule.Codex({ env });
  }

  // Cache key for thread pooling
  const cacheKey = config.persist_threads
    ? generateCacheKey(config, prompt)
    : undefined;

  // Get or create thread
  const thread = await this.getOrCreateThread(config, cacheKey);

  // Prepare run options
  const runOptions: any = {};
  if (config.output_schema) {
    runOptions.outputSchema = config.output_schema;
  }

  // Handle image attachments from context
  const input = prepareInput(prompt, context);

  try {
    let turn: any;

    if (config.enable_streaming) {
      // Use streaming API
      const { events } = await thread.runStreamed(input, runOptions);
      const items: any[] = [];
      let usage: any = undefined;

      for await (const event of events) {
        // Handle abort signal during streaming
        if (callOptions?.abortSignal?.aborted) {
          return { error: 'OpenAI Codex SDK call aborted during execution' };
        }

        switch (event.type) {
          case 'item.completed':
            items.push(event.item);
            break;
          case 'turn.completed':
            usage = event.usage;
            break;
        }
      }

      turn = {
        finalResponse: items.map(i => i.content).join('\n'),
        items,
        usage
      };
    } else {
      // Buffered API (simpler)
      turn = await thread.run(input, runOptions);
    }

    // Extract response
    const output = turn.finalResponse || '';
    const raw = JSON.stringify(turn);

    const tokenUsage: ProviderResponse['tokenUsage'] = turn.usage ? {
      prompt: turn.usage.prompt_tokens,
      completion: turn.usage.completion_tokens,
      total: turn.usage.total_tokens,
    } : undefined;

    const cost = calculateCost(turn.usage, config.model);

    logger.debug(`OpenAI Codex SDK response: ${raw}`);

    return {
      output,
      tokenUsage,
      cost,
      raw,
      sessionId: thread.id, // Expose thread ID
    };

  } catch (error: any) {
    const isAbort = error?.name === 'AbortError' || callOptions?.abortSignal?.aborted;

    if (isAbort) {
      logger.warn('OpenAI Codex SDK call aborted');
      return { error: 'OpenAI Codex SDK call aborted' };
    }

    logger.error(`Error calling OpenAI Codex SDK: ${error}`);
    return {
      error: `Error calling OpenAI Codex SDK: ${error}`,
    };
  } finally {
    // Clean up thread if not persisting
    if (!config.persist_threads && !config.thread_id) {
      // Thread cleanup handled by Codex SDK internally
      // Sessions are saved to ~/.codex/sessions automatically
    }
  }
}
```

#### 1.6 Helper Functions

```typescript
/**
 * Validate working directory exists and optionally check for Git repo
 */
function validateWorkingDirectory(workingDir: string, skipGitCheck: boolean = false): void {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(workingDir);
  } catch (err: any) {
    throw new Error(
      `Working directory ${workingDir} does not exist or isn't accessible: ${err.message}`,
    );
  }

  if (!stats.isDirectory()) {
    throw new Error(`Working directory ${workingDir} is not a directory`);
  }

  if (!skipGitCheck) {
    const gitDir = path.join(workingDir, '.git');
    if (!fs.existsSync(gitDir)) {
      throw new Error(
        `Working directory ${workingDir} is not a Git repository. Set skip_git_repo_check: true to bypass this check.`,
      );
    }
  }
}

/**
 * Prepare input with image attachments if provided
 */
function prepareInput(prompt: string, context?: CallApiContextParams): string | any[] {
  // Check for image attachments in context
  // For now, just return prompt as string
  // TODO: Support image attachments when we have context.images or similar
  return prompt;
}

/**
 * Calculate cost based on token usage and model
 */
function calculateCost(usage: any, model?: string): number {
  if (!usage) return 0;

  // Use OpenAI pricing from existing openai provider
  // TODO: Import from src/providers/openai/util.ts
  return 0;
}

/**
 * Generate cache key for thread pooling
 */
function generateCacheKey(config: OpenAICodexSDKConfig, prompt: string): string {
  const keyData = {
    working_dir: config.working_dir,
    model: config.model,
    output_schema: config.output_schema,
    prompt: prompt,
  };

  const hash = crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex');
  return `openai:codex-sdk:${hash}`;
}
```

#### 1.7 Provider Registry Integration

**File**: `src/providers/registry.ts`

Add entry after Claude Agent SDK registration:

```typescript
{
  test: (providerPath: string) =>
    providerPath.startsWith('openai:codex-sdk') ||
    providerPath.startsWith('openai:codex'),
  create: async (
    _providerPath: string,
    providerOptions: ProviderOptions,
    context: LoadApiProviderContext,
  ) => {
    const { OpenAICodexSDKProvider } = await import('./openai-codex-sdk');
    return new OpenAICodexSDKProvider({
      ...providerOptions,
      env: context.env,
    });
  },
},
```

---

### Phase 2: Testing

**File**: `test/providers/openai-codex-sdk.test.ts`

#### 2.1 Test Structure (Follow Claude Agent SDK Pattern)

```typescript
describe('OpenAICodexSDKProvider', () => {
  describe('constructor', () => {
    // Test default config
    // Test custom config
    // Test custom id
    // Test model validation warnings
  });

  describe('callApi', () => {
    describe('basic functionality', () => {
      // Test successful API call
      // Test SDK error response
      // Test SDK exceptions
      // Test missing API key error
    });

    describe('working directory management', () => {
      // Test default CWD behavior
      // Test custom working_dir
      // Test non-existent working_dir error
      // Test non-directory error
      // Test Git repo requirement
      // Test skip_git_repo_check option
    });

    describe('thread management', () => {
      // Test ephemeral threads (default)
      // Test thread persistence
      // Test thread resumption by ID
      // Test thread pool size limits
      // Test thread cleanup
    });

    describe('structured output', () => {
      // Test JSON schema output
      // Test Zod schema conversion
      // Test schema validation
    });

    describe('streaming', () => {
      // Test streaming events
      // Test event types (item.completed, turn.completed)
      // Test abort during streaming
    });

    describe('config merging', () => {
      // Test provider + prompt config merge
      // Test prompt config priority
    });

    describe('abort signal', () => {
      // Test pre-aborted signal
      // Test abort during execution
      // Test cleanup on abort
    });

    describe('environment variables', () => {
      // Test default env inheritance
      // Test custom cli_env
      // Test API key injection
    });
  });
});
```

#### 2.2 Mock Setup

```typescript
jest.mock('../../src/cliState', () => ({ basePath: '/test/basePath' }));
jest.mock('../../src/esm', () => ({
  importModule: jest.fn(),
}));

const mockRun = jest.fn();
const mockRunStreamed = jest.fn();
const mockStartThread = jest.fn();
const mockResumeThread = jest.fn();

// Mock thread instance
const mockThread = {
  id: 'test-thread-123',
  run: mockRun,
  runStreamed: mockRunStreamed,
};

// Mock Codex class
const MockCodex = jest.fn().mockImplementation(() => ({
  startThread: mockStartThread.mockReturnValue(mockThread),
  resumeThread: mockResumeThread.mockReturnValue(mockThread),
}));

beforeEach(() => {
  jest.clearAllMocks();

  const { importModule } = require('../../src/esm');
  importModule.mockResolvedValue({
    Codex: MockCodex,
  });
});
```

#### 2.3 Key Test Cases

**Test: Basic successful call**

```typescript
it('should successfully call API with simple prompt', async () => {
  mockRun.mockResolvedValue({
    finalResponse: 'Test response',
    items: [{ content: 'Test response' }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  });

  const provider = new OpenAICodexSDKProvider({
    env: { OPENAI_API_KEY: 'test-api-key' },
  });
  const result = await provider.callApi('Test prompt');

  expect(result).toEqual({
    output: 'Test response',
    tokenUsage: { prompt: 10, completion: 20, total: 30 },
    cost: expect.any(Number),
    raw: expect.any(String),
    sessionId: 'test-thread-123',
  });

  expect(mockStartThread).toHaveBeenCalledWith({
    workingDirectory: undefined,
    skipGitRepoCheck: false,
  });

  expect(mockRun).toHaveBeenCalledWith('Test prompt', {});
});
```

**Test: Git repo requirement**

```typescript
it('should error when working_dir is not a Git repo', async () => {
  const statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({
    isDirectory: () => true,
  } as fs.Stats);

  const existsSyncSpy = jest.spyOn(fs, 'existsSync').mockReturnValue(false);

  const provider = new OpenAICodexSDKProvider({
    config: { working_dir: '/path/to/non-git-dir' },
    env: { OPENAI_API_KEY: 'test-api-key' },
  });

  await expect(provider.callApi('Test prompt')).rejects.toThrow(/is not a Git repository/);

  statSyncSpy.mockRestore();
  existsSyncSpy.mockRestore();
});
```

**Test: Thread persistence**

```typescript
it('should reuse threads when persist_threads is true', async () => {
  mockRun.mockResolvedValue({
    finalResponse: 'Response',
    items: [],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  });

  const provider = new OpenAICodexSDKProvider({
    config: { persist_threads: true, working_dir: '/test/dir' },
    env: { OPENAI_API_KEY: 'test-api-key' },
  });

  // First call creates thread
  await provider.callApi('First prompt');
  expect(mockStartThread).toHaveBeenCalledTimes(1);

  // Second call with same config reuses thread
  await provider.callApi('First prompt'); // Same prompt = same cache key
  expect(mockStartThread).toHaveBeenCalledTimes(1); // No new thread
  expect(mockRun).toHaveBeenCalledTimes(2); // But run called twice
});
```

**Test: Structured output**

```typescript
it('should handle JSON schema output', async () => {
  const schema = {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      status: { type: 'string', enum: ['ok', 'action_required'] },
    },
    required: ['summary', 'status'],
  };

  mockRun.mockResolvedValue({
    finalResponse: '{"summary":"All good","status":"ok"}',
    items: [],
    usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
  });

  const provider = new OpenAICodexSDKProvider({
    config: { output_schema: schema },
    env: { OPENAI_API_KEY: 'test-api-key' },
  });

  const result = await provider.callApi('Summarize status');

  expect(mockRun).toHaveBeenCalledWith('Summarize status', {
    outputSchema: schema,
  });

  expect(JSON.parse(result.output as string)).toEqual({
    summary: 'All good',
    status: 'ok',
  });
});
```

---

### Phase 3: Examples

**Directory**: `examples/openai-codex-sdk/`

#### 3.1 Example Structure

```
examples/openai-codex-sdk/
├── README.md
├── basic/
│   └── promptfooconfig.yaml
├── working-dir/
│   ├── promptfooconfig.yaml
│   └── sample-project/
│       ├── .git/
│       ├── index.ts
│       ├── bug.py
│       └── package.json
├── structured-output/
│   └── promptfooconfig.yaml
├── image-analysis/
│   ├── promptfooconfig.yaml
│   └── screenshots/
│       └── ui.png
└── thread-continuation/
    ├── promptfooconfig.yaml
    └── hooks.js
```

#### 3.2 Example: Basic Usage

**File**: `examples/openai-codex-sdk/basic/promptfooconfig.yaml`

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'OpenAI Codex SDK basic usage - code generation'

prompts:
  - 'Write a Python function that checks if a number is prime. Just output the code, do not create files.'

providers:
  - openai:codex-sdk

tests:
  - vars: {}
    assert:
      - type: contains
        value: 'def'
      - type: llm-rubric
        value: 'Should generate working Python code for prime number checking'
```

#### 3.3 Example: Working Directory with Git

**File**: `examples/openai-codex-sdk/working-dir/promptfooconfig.yaml`

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'OpenAI Codex SDK analyzing code in a Git repository'

prompts:
  - 'Analyze the code in this repository and identify any bugs or issues. List them with file paths and line numbers.'

providers:
  - id: openai:codex-sdk
    config:
      working_dir: './sample-project'
      # Git repo check is automatic - sample-project has .git/

tests:
  - vars: {}
    assert:
      - type: contains-any
        value: ['bug', 'issue', 'error', 'problem']
      - type: llm-rubric
        value: 'Should identify specific code issues with file references'
```

#### 3.4 Example: Structured Output

**File**: `examples/openai-codex-sdk/structured-output/promptfooconfig.yaml`

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'OpenAI Codex SDK with JSON schema output'

prompts:
  - 'Analyze the repository and provide a summary report'

providers:
  - id: openai:codex-sdk
    config:
      working_dir: '.'
      skip_git_repo_check: true
      output_schema:
        type: object
        properties:
          summary:
            type: string
          file_count:
            type: number
          languages:
            type: array
            items:
              type: string
          status:
            type: string
            enum: [ok, needs_attention, critical]
        required: [summary, status]
        additionalProperties: false

tests:
  - vars: {}
    assert:
      - type: is-json
      - type: javascript
        value: 'JSON.parse(output).status !== undefined'
      - type: llm-rubric
        value: 'Should return valid JSON matching the schema'
```

#### 3.5 Example: Thread Continuation

**File**: `examples/openai-codex-sdk/thread-continuation/promptfooconfig.yaml`

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'OpenAI Codex SDK with persistent threads for multi-turn conversations'

prompts:
  - 'List all Python files in this repository'
  - 'Now analyze the first file you found for potential bugs'

providers:
  - id: openai:codex-sdk
    config:
      working_dir: '.'
      skip_git_repo_check: true
      persist_threads: true # Reuse thread across prompts

tests:
  - vars: {}
    assert:
      - type: llm-rubric
        value: 'Should maintain context from previous prompts'
```

**File**: `examples/openai-codex-sdk/thread-continuation/hooks.js`

```javascript
/**
 * Extension hooks for thread management
 */

module.exports = {
  beforeAll: async () => {
    console.log('Starting Codex evaluation with thread persistence');
  },

  afterAll: async () => {
    console.log('Completed Codex evaluation');
    // Threads are automatically saved to ~/.codex/sessions
  },
};
```

#### 3.6 Main README

**File**: `examples/openai-codex-sdk/README.md`

````markdown
# openai-codex-sdk (OpenAI Codex SDK Examples)

The OpenAI Codex SDK provider enables you to run agentic code analysis and generation evals with thread-based conversations.

```bash
npx promptfoo@latest init --example openai-codex-sdk
```
````

## Setup

Install the OpenAI Codex SDK:

```bash
npm install @openai/codex-sdk
```

Requires Node.js 18+.

Export your OpenAI API key as `OPENAI_API_KEY`:

```bash
export OPENAI_API_KEY=your_api_key_here
```

## Examples

### Basic Usage

Simple code generation without file system access.

**Location**: `./basic/`

**Usage**:

```bash
(cd basic && promptfoo eval)
```

### Working Directory

Analyze code in a Git repository with read-only access.

**Location**: `./working-dir/`

**Usage**:

```bash
(cd working-dir && promptfoo eval)
```

### Structured Output

Generate responses conforming to a JSON schema.

**Location**: `./structured-output/`

**Usage**:

```bash
(cd structured-output && promptfoo eval)
```

### Thread Continuation

Multi-turn conversations with persistent thread state.

**Location**: `./thread-continuation/`

**Usage**:

```bash
(cd thread-continuation && promptfoo eval)
```

### Image Analysis

Analyze UI screenshots and diagrams (if supported).

**Location**: `./image-analysis/`

**Usage**:

```bash
(cd image-analysis && promptfoo eval)
```

## Key Features

- **Thread Persistence**: Conversations saved to `~/.codex/sessions`
- **Git Integration**: Automatic Git repository detection
- **Structured Output**: Native JSON schema support
- **Streaming Events**: Real-time progress updates
- **Image Support**: Analyze screenshots and diagrams

````

---

### Phase 4: Documentation

**File**: `site/docs/providers/openai-codex-sdk.md`

```markdown
---
sidebar_label: OpenAI Codex SDK
---

# OpenAI Codex SDK

The OpenAI Codex SDK provider enables agentic code analysis and generation in your evals using the Codex agent.

The Codex SDK wraps the bundled `codex` binary and communicates via JSONL events over stdin/stdout. It provides thread-based conversations with automatic persistence.

## Installation

Install the OpenAI Codex SDK package:

```bash
npm install @openai/codex-sdk
````

**Requirements**: Node.js 18+

## Configuration

Use `openai:codex-sdk` as your provider:

```yaml
providers:
  - openai:codex-sdk
```

### Authentication

Set your OpenAI API key:

```bash
export OPENAI_API_KEY=your_api_key_here
```

Or configure it directly:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      apiKey: sk-...
```

### Basic Options

| Option                | Type    | Description                                 | Default                  |
| --------------------- | ------- | ------------------------------------------- | ------------------------ |
| `apiKey`              | string  | OpenAI API key                              | `OPENAI_API_KEY` env var |
| `model`               | string  | Model to use (e.g., `gpt-4`, `gpt-4-turbo`) | Codex default            |
| `working_dir`         | string  | Directory for Codex to operate in           | `process.cwd()`          |
| `skip_git_repo_check` | boolean | Skip Git repository requirement             | `false`                  |
| `max_tokens`          | number  | Maximum response tokens                     | -                        |

### Thread Management

| Option             | Type    | Description                                       | Default |
| ------------------ | ------- | ------------------------------------------------- | ------- |
| `thread_id`        | string  | Resume a specific thread from `~/.codex/sessions` | -       |
| `persist_threads`  | boolean | Reuse threads across prompts                      | `false` |
| `thread_pool_size` | number  | Max concurrent threads when persisting            | `1`     |

### Advanced Options

| Option             | Type    | Description                                |
| ------------------ | ------- | ------------------------------------------ |
| `output_schema`    | object  | JSON schema for structured output          |
| `enable_streaming` | boolean | Enable streaming events (default: `false`) |
| `cli_env`          | object  | Custom environment for Codex CLI           |
| `system_prompt`    | string  | Custom system instructions                 |

## Examples

### Basic Code Generation

```yaml
description: 'Simple code generation'

prompts:
  - 'Write a Python function to calculate factorial'

providers:
  - openai:codex-sdk

tests:
  - assert:
      - type: contains
        value: 'def factorial'
```

### Code Analysis in Git Repository

```yaml
description: 'Analyze code for bugs'

prompts:
  - 'Identify potential bugs in this codebase'

providers:
  - id: openai:codex-sdk
    config:
      working_dir: './my-project'
      # Automatically checks for .git directory

tests:
  - assert:
      - type: llm-rubric
        value: 'Identifies specific issues with file paths'
```

### Structured JSON Output

```yaml
description: 'Generate structured analysis report'

prompts:
  - 'Analyze this repository and provide a summary'

providers:
  - id: openai:codex-sdk
    config:
      working_dir: '.'
      skip_git_repo_check: true
      output_schema:
        type: object
        properties:
          summary:
            type: string
          issues_found:
            type: number
          severity:
            type: string
            enum: [low, medium, high]
        required: [summary, severity]

tests:
  - assert:
      - type: is-json
      - type: javascript
        value: 'JSON.parse(output).severity !== undefined'
```

### Multi-Turn Conversation

```yaml
description: 'Persistent thread across prompts'

prompts:
  - 'List all Python files'
  - 'Analyze the first file you found' # References previous response

providers:
  - id: openai:codex-sdk
    config:
      persist_threads: true
      working_dir: '.'
      skip_git_repo_check: true

tests:
  - assert:
      - type: llm-rubric
        value: 'Maintains context from previous prompt'
```

### Resume Existing Thread

```yaml
providers:
  - id: openai:codex-sdk
    config:
      thread_id: 'abc123' # Resume from ~/.codex/sessions/abc123
```

## Git Repository Requirement

By default, Codex requires the working directory to be a Git repository. This prevents unrecoverable errors during file operations.

To work in non-Git directories:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      working_dir: './my-folder'
      skip_git_repo_check: true
```

## Thread Persistence

Codex saves all threads to `~/.codex/sessions` automatically. You can:

1. **Ephemeral threads** (default): New thread per eval, auto-cleaned
2. **Persistent threads**: Reuse threads across prompts with `persist_threads: true`
3. **Resume threads**: Continue existing thread with `thread_id: 'abc123'`

## Environment Variables

By default, Codex inherits the Node.js process environment. Override with `cli_env`:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      cli_env:
        PATH: /usr/local/bin
        CUSTOM_VAR: value
```

The SDK injects required variables (`OPENAI_API_KEY`, `CODEX_API_KEY`) automatically.

## Streaming Events

Enable real-time progress updates:

```yaml
providers:
  - id: openai:codex-sdk
    config:
      enable_streaming: true
```

Available event types:

- `item.completed`: Tool call or response completed
- `turn.completed`: Full turn finished with usage stats

## Comparison to Claude Agent SDK

| Feature               | Claude Agent SDK         | OpenAI Codex SDK          |
| --------------------- | ------------------------ | ------------------------- |
| **Conversations**     | Stateless                | Thread-based (persisted)  |
| **Working Dir**       | Temp by default          | CWD by default            |
| **Tools**             | Configurable permissions | Built-in (managed by CLI) |
| **Git Requirement**   | No                       | Yes (can skip)            |
| **Structured Output** | No                       | Yes (JSON schemas)        |
| **Image Support**     | No                       | Yes (planned)             |

## Related

- [OpenAI Provider](/docs/providers/openai)
- [Claude Agent SDK Provider](/docs/providers/claude-agent-sdk)
- [GitHub: openai/codex](https://github.com/openai/codex)

````

---

### Phase 5: Additional Files

#### 5.1 TypeScript Types Export

**File**: `src/types/providers.ts`

Add to provider types:

```typescript
// OpenAI Codex SDK
export type { OpenAICodexSDKConfig } from '../providers/openai-codex-sdk';
````

#### 5.2 Provider Selector UI

**File**: `src/app/src/pages/eval-creator/components/ProviderSelector.tsx`

Add Codex SDK to provider options (search for "claude-agent-sdk" and add nearby):

```typescript
{
  value: 'openai:codex-sdk',
  label: 'OpenAI Codex SDK',
  description: 'Agentic code analysis with thread persistence',
},
```

#### 5.3 Red Team Integration

**File**: `src/app/src/pages/redteam/setup/components/Targets/consts.ts`

Add to `AGENT_SDK_PROVIDERS`:

```typescript
export const AGENT_SDK_PROVIDERS = ['anthropic:claude-agent-sdk', 'openai:codex-sdk'] as const;
```

#### 5.4 Changelog Entry

**File**: `CHANGELOG.md`

Add under `## [Unreleased]` → `### Added`:

```markdown
- feat(providers): add OpenAI Codex SDK provider with thread persistence and structured output (#XXXX)
```

---

## Implementation Checklist

### Phase 1: Core Provider (Week 1)

- [ ] Create `src/providers/openai-codex-sdk.ts`
- [ ] Implement `OpenAICodexSDKProvider` class
- [ ] Implement `loadCodexSDK()` module loader
- [ ] Implement thread management (ephemeral, persistent, resume)
- [ ] Implement working directory validation with Git check
- [ ] Implement `callApi()` with buffered and streaming modes
- [ ] Implement structured output support
- [ ] Add provider to registry (`src/providers/registry.ts`)

### Phase 2: Testing (Week 1-2)

- [ ] Create `test/providers/openai-codex-sdk.test.ts`
- [ ] Mock Codex SDK module
- [ ] Test constructor and config validation
- [ ] Test basic API calls
- [ ] Test working directory validation
- [ ] Test Git repository requirement
- [ ] Test thread management (ephemeral, persistent, resume)
- [ ] Test thread pool size limits
- [ ] Test structured output
- [ ] Test streaming events
- [ ] Test abort signal handling
- [ ] Test environment variable handling
- [ ] Test error cases
- [ ] Run tests: `npm test -- openai-codex-sdk --coverage --randomize`
- [ ] Achieve >90% coverage

### Phase 3: Examples (Week 2)

- [ ] Create `examples/openai-codex-sdk/README.md`
- [ ] Create `examples/openai-codex-sdk/basic/`
- [ ] Create `examples/openai-codex-sdk/working-dir/` with sample project
  - [ ] Initialize `.git` in sample project
  - [ ] Add sample code files with intentional bugs
- [ ] Create `examples/openai-codex-sdk/structured-output/`
- [ ] Create `examples/openai-codex-sdk/thread-continuation/`
- [ ] Create `examples/openai-codex-sdk/image-analysis/` (if supported)
- [ ] Test all examples with local build:
  ```bash
  npm run local -- eval -c examples/openai-codex-sdk/basic/promptfooconfig.yaml
  ```

### Phase 4: Documentation (Week 2)

- [ ] Create `site/docs/providers/openai-codex-sdk.md`
- [ ] Add provider to `site/docs/providers/index.md`
- [ ] Add comparison table vs Claude Agent SDK
- [ ] Document all configuration options
- [ ] Add troubleshooting section
- [ ] Add to releases page (`site/docs/releases.md`)

### Phase 5: Integration (Week 2-3)

- [ ] Update `src/types/providers.ts`
- [ ] Update provider selector UI (`src/app/src/pages/eval-creator/components/ProviderSelector.tsx`)
- [ ] Update red team targets (`src/app/src/pages/redteam/setup/components/Targets/consts.ts`)
- [ ] Update `CHANGELOG.md`
- [ ] Update `package.json` with peer dependency notice

### Phase 6: Testing & Refinement (Week 3)

- [ ] Integration test with real Codex SDK (manual)
- [ ] Test thread persistence across multiple evals
- [ ] Test Git repository detection
- [ ] Test structured output with complex schemas
- [ ] Test error handling and edge cases
- [ ] Lint: `npm run lint`
- [ ] Format: `npm run format`
- [ ] Build: `npm run build`
- [ ] Run full test suite: `npm test -- --coverage --randomize`

### Phase 7: PR & Review (Week 3-4)

- [ ] Create feature branch: `git checkout -b feat/openai-codex-sdk-provider`
- [ ] Commit changes with conventional commit messages
- [ ] Push branch: `git push -u origin feat/openai-codex-sdk-provider`
- [ ] Create PR with description and examples
- [ ] Address review feedback
- [ ] Ensure CI passes (tests, lint, build)
- [ ] Wait for approval and merge

---

## Open Questions & Considerations

### 1. **Image Support**

- Codex SDK supports `{ type: 'local_image', path: './ui.png' }`
- How do we expose this in promptfoo config?
- Options:
  - Add `images` field to provider config
  - Support special prompt syntax (e.g., `![](./ui.png)`)
  - Add to test vars/context

### 2. **Cost Calculation**

- Codex SDK may not return cost directly
- Need to calculate from usage + model pricing
- Can reuse OpenAI pricing from `src/providers/openai/util.ts`

### 3. **Thread Pool Management**

- Default `thread_pool_size: 1` to prevent concurrent issues
- Should we expose thread cleanup methods?
- Auto-cleanup on provider destruction?

### 4. **Streaming Events**

- Default to `enable_streaming: false` for simplicity
- Advanced users can opt-in for progress updates
- Need to decide how to surface events to users (logs? callbacks?)

### 5. **MCP Integration**

- Does Codex SDK support MCP servers?
- If yes, add `mcp` config similar to Claude Agent SDK
- If no, document limitation

### 6. **Caching Strategy**

- Codex has built-in thread persistence via `~/.codex/sessions`
- Do we need additional caching on top?
- Consider leveraging existing promptfoo cache for responses

### 7. **Error Handling**

- Codex CLI spawns subprocess - how do we handle crashes?
- Timeout handling for long-running operations?
- Graceful degradation if binary not found?

### 8. **Security Considerations**

- Codex operates on local file system (like Claude Agent SDK)
- Git requirement is a safety feature - document importance
- Add warnings about `skip_git_repo_check: true`

### 9. **Compatibility**

- Minimum Node.js version: 18+ (Codex requirement)
- Update package.json `engines` field if needed
- Test on Windows, macOS, Linux

### 10. **Performance**

- Thread startup overhead?
- Benchmark vs standard OpenAI provider
- Document performance characteristics

---

## Success Criteria

1. **Functionality**
   - ✅ Provider loads Codex SDK dynamically
   - ✅ Basic prompts execute successfully
   - ✅ Thread persistence works across multiple prompts
   - ✅ Git repository validation works
   - ✅ Structured output returns valid JSON
   - ✅ Abort signals properly cancel execution

2. **Testing**
   - ✅ >90% test coverage
   - ✅ All tests pass with `--randomize`
   - ✅ Mock tests don't require real API calls
   - ✅ Integration tests documented (manual)

3. **Documentation**
   - ✅ Complete provider documentation page
   - ✅ All config options documented
   - ✅ 5+ working examples
   - ✅ Comparison to Claude Agent SDK
   - ✅ Troubleshooting guide

4. **Code Quality**
   - ✅ Passes `npm run lint`
   - ✅ Passes `npm run format`
   - ✅ Follows existing patterns (Claude Agent SDK)
   - ✅ Proper TypeScript types
   - ✅ Sanitized logging (no API keys)

5. **User Experience**
   - ✅ Clear error messages
   - ✅ Sensible defaults (ephemeral threads, Git check enabled)
   - ✅ Works with `npx promptfoo@latest init --example openai-codex-sdk`
   - ✅ Appears in UI provider selector

---

## Timeline Estimate

**Total: 3-4 weeks**

- **Week 1**: Core implementation + basic tests (Phase 1-2)
- **Week 2**: Examples + documentation (Phase 3-4)
- **Week 3**: Integration + refinement (Phase 5-6)
- **Week 4**: PR review + iterations (Phase 7)

## References

- **Codex SDK Repo**: https://github.com/openai/codex
- **Codex SDK README**: sdk/typescript/README.md
- **Claude Agent SDK Provider**: `src/providers/claude-agent-sdk.ts`
- **OpenAI Provider**: `src/providers/openai/`
- **Provider Tests Pattern**: `test/providers/claude-agent-sdk.ts`
- **Examples Pattern**: `examples/claude-agent-sdk/`
