# OpenAI Codex SDK Provider - Comprehensive Integration Plan

> **Based on**: Contributing guidelines, Codex SDK v1 API, Claude Agent SDK implementation patterns

## Executive Summary

**Goal**: Add OpenAI Codex SDK as a first-class provider in promptfoo with thread persistence, structured output, and Git-aware file operations.

**Timeline**: 3-4 weeks (detailed breakdown below)

**Key Differentiators vs Claude Agent SDK**:

- Thread-based conversations (persistent state in `~/.codex/sessions`)
- Git repository requirement (safety feature)
- Native JSON schema output with Zod support
- CLI subprocess pattern (not pure Node.js API)

---

## Pre-Implementation Discoveries

### From Actual Codex SDK Code

```typescript
// Real SDK usage pattern (from samples/)
import { Codex } from '@openai/codex-sdk';
import z from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

const codex = new Codex({
  codexPathOverride: codexPathOverride(), // ⚠️ Missing from original plan!
});

const thread = codex.startThread();
const schema = z.object({
  summary: z.string(),
  status: z.enum(['ok', 'action_required']),
});

const turn = await thread.run('Summarize repository status', {
  outputSchema: zodToJsonSchema(schema, { target: 'openAi' }),
});
```

**Key Findings**:

1. ✅ `codexPathOverride` option for custom binary path
2. ✅ Zod is first-class citizen (add to examples)
3. ✅ `target: "openAi"` required for zodToJsonSchema
4. ✅ Thread API is Promise-based (not callback)

### Updated Configuration Interface

```typescript
export interface OpenAICodexSDKConfig {
  apiKey?: string;

  // Working directory
  working_dir?: string;
  skip_git_repo_check?: boolean;

  // Binary path override (NEW!)
  codex_path_override?: string; // Path to custom codex binary

  // Model configuration
  model?: string;
  fallback_model?: string;
  max_tokens?: number;

  // Thread management
  thread_id?: string;
  persist_threads?: boolean;
  thread_pool_size?: number;

  // Structured output (JSON schemas or Zod)
  output_schema?: Record<string, any>;
  use_zod?: boolean; // Auto-detect Zod schemas

  // Environment
  cli_env?: Record<string, string>;

  // Advanced
  system_prompt?: string;
  enable_streaming?: boolean;
  setting_sources?: string[];
}
```

---

## Phase 1: Core Provider Implementation (Days 1-5)

### 1.1 Provider File Structure

**File**: `src/providers/openai-codex-sdk.ts`

**Required Imports**:

```typescript
import { createRequire } from 'node:module';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dedent from 'dedent';

import { getCache, isCacheEnabled } from '../cache';
import cliState from '../cliState';
import { getEnvString } from '../envars';
import { importModule } from '../esm';
import logger from '../logger';

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderResponse,
} from '../types/index';
import type { EnvOverrides } from '../types/env';
```

### 1.2 Module Loader (Critical)

```typescript
/**
 * Load the OpenAI Codex SDK ESM module
 * Pattern: Matches Claude Agent SDK loader exactly
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
    if ((err as any).stack) {
      logger.error((err as any).stack);
    }
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

### 1.3 Provider Class Implementation

```typescript
export class OpenAICodexSDKProvider implements ApiProvider {
  static OPENAI_MODELS = [
    'gpt-4',
    'gpt-4-turbo',
    'gpt-4o',
    'gpt-4o-mini',
    'o1',
    'o1-mini',
    'o3-mini',
  ];

  config: OpenAICodexSDKConfig;
  env?: EnvOverrides;
  apiKey?: string;

  private providerId = 'openai:codex-sdk';
  private codexModule?: typeof import('@openai/codex-sdk');
  private codexInstance?: any; // Codex instance
  private threads: Map<string, any> = new Map(); // Thread pool

  constructor(
    options: {
      id?: string;
      config?: OpenAICodexSDKConfig;
      env?: EnvOverrides;
    } = {},
  ) {
    const { config, env, id } = options;
    this.config = config ?? {};
    this.env = env;
    this.apiKey = this.getApiKey();
    this.providerId = id ?? this.providerId;

    // Validate model if provided
    if (this.config.model && !OpenAICodexSDKProvider.OPENAI_MODELS.includes(this.config.model)) {
      logger.warn(`Using unknown model for OpenAI Codex SDK: ${this.config.model}`);
    }
  }

  id(): string {
    return this.providerId;
  }

  getApiKey(): string | undefined {
    return (
      this.config?.apiKey ||
      this.env?.OPENAI_API_KEY ||
      this.env?.CODEX_API_KEY ||
      getEnvString('OPENAI_API_KEY') ||
      getEnvString('CODEX_API_KEY')
    );
  }

  toString(): string {
    return '[OpenAI Codex SDK Provider]';
  }

  async cleanup(): Promise<void> {
    // Clean up thread pool
    this.threads.clear();
  }
}
```

### 1.4 Core `callApi()` Implementation

```typescript
async callApi(
  prompt: string,
  context?: CallApiContextParams,
  callOptions?: CallApiOptionsParams,
): Promise<ProviderResponse> {
  // 1. Merge configs (prompt config takes precedence)
  const config: OpenAICodexSDKConfig = {
    ...this.config,
    ...context?.prompt?.config,
  };

  // 2. Prepare environment
  const env: Record<string, string> = this.prepareEnvironment(config);

  if (!this.apiKey && !env.OPENAI_API_KEY && !env.CODEX_API_KEY) {
    throw new Error(
      'OpenAI API key is not set. Set OPENAI_API_KEY or CODEX_API_KEY environment variable or add "apiKey" to provider config.'
    );
  }

  // 3. Validate working directory
  if (config.working_dir) {
    this.validateWorkingDirectory(config.working_dir, config.skip_git_repo_check);
  }

  // 4. Check abort signal
  if (callOptions?.abortSignal?.aborted) {
    return { error: 'OpenAI Codex SDK call aborted before it started' };
  }

  // 5. Load SDK module (lazy)
  if (!this.codexModule) {
    this.codexModule = await loadCodexSDK();
  }

  // 6. Initialize Codex instance (lazy)
  if (!this.codexInstance) {
    this.codexInstance = new this.codexModule.Codex({
      env,
      codexPathOverride: config.codex_path_override,
    });
  }

  // 7. Get or create thread
  const cacheKey = this.generateCacheKey(config, prompt);
  const thread = await this.getOrCreateThread(config, cacheKey);

  // 8. Prepare run options
  const runOptions: any = {};
  if (config.output_schema) {
    runOptions.outputSchema = config.output_schema;
  }

  // 9. Execute turn
  try {
    const turn = config.enable_streaming
      ? await this.runStreaming(thread, prompt, runOptions, callOptions)
      : await thread.run(prompt, runOptions);

    // 10. Extract response
    const output = turn.finalResponse || '';
    const raw = JSON.stringify(turn);

    const tokenUsage: ProviderResponse['tokenUsage'] = turn.usage
      ? {
          prompt: turn.usage.prompt_tokens,
          completion: turn.usage.completion_tokens,
          total: turn.usage.total_tokens,
        }
      : undefined;

    // TODO: Calculate cost from usage
    const cost = 0;

    logger.debug(`OpenAI Codex SDK response`, { output, usage: turn.usage });

    return {
      output,
      tokenUsage,
      cost,
      raw,
      sessionId: thread.id,
    };
  } catch (error: any) {
    const isAbort = error?.name === 'AbortError' || callOptions?.abortSignal?.aborted;

    if (isAbort) {
      logger.warn('OpenAI Codex SDK call aborted');
      return { error: 'OpenAI Codex SDK call aborted' };
    }

    logger.error('Error calling OpenAI Codex SDK', { error: error.message });
    return {
      error: `Error calling OpenAI Codex SDK: ${error.message}`,
    };
  } finally {
    // Clean up ephemeral threads
    if (!config.persist_threads && !config.thread_id && cacheKey) {
      this.threads.delete(cacheKey);
    }
  }
}
```

### 1.5 Helper Methods

```typescript
private prepareEnvironment(config: OpenAICodexSDKConfig): Record<string, string> {
  const env: Record<string, string> = config.cli_env
    ? { ...config.cli_env }
    : { ...process.env as Record<string, string> };

  // Sort keys for stable cache key generation
  const sortedEnv: Record<string, string> = {};
  for (const key of Object.keys(env).sort()) {
    if (env[key] !== undefined) {
      sortedEnv[key] = env[key];
    }
  }

  // Inject API key
  if (this.apiKey) {
    sortedEnv.OPENAI_API_KEY = this.apiKey;
    sortedEnv.CODEX_API_KEY = this.apiKey;
  }

  // Inject env overrides
  if (this.env) {
    for (const key of Object.keys(this.env).sort()) {
      const value = this.env[key as keyof typeof this.env];
      if (value !== undefined) {
        sortedEnv[key] = value;
      }
    }
  }

  return sortedEnv;
}

private validateWorkingDirectory(workingDir: string, skipGitCheck: boolean = false): void {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(workingDir);
  } catch (err: any) {
    throw new Error(
      `Working directory ${workingDir} does not exist or isn't accessible: ${err.message}`
    );
  }

  if (!stats.isDirectory()) {
    throw new Error(`Working directory ${workingDir} is not a directory`);
  }

  if (!skipGitCheck) {
    const gitDir = path.join(workingDir, '.git');
    if (!fs.existsSync(gitDir)) {
      throw new Error(
        dedent`Working directory ${workingDir} is not a Git repository.

        Codex requires a Git repository by default to prevent unrecoverable errors.

        To bypass this check, set skip_git_repo_check: true in your provider config.`
      );
    }
  }
}

private async getOrCreateThread(
  config: OpenAICodexSDKConfig,
  cacheKey?: string,
): Promise<any> {
  // Resume specific thread
  if (config.thread_id) {
    const cached = this.threads.get(config.thread_id);
    if (cached) return cached;

    const thread = this.codexInstance!.resumeThread(config.thread_id);
    if (config.persist_threads) {
      this.threads.set(config.thread_id, thread);
    }
    return thread;
  }

  // Use pooled thread
  if (config.persist_threads && cacheKey) {
    const cached = this.threads.get(cacheKey);
    if (cached) return cached;

    // Enforce pool size limit
    const poolSize = config.thread_pool_size ?? 1;
    if (this.threads.size >= poolSize) {
      const oldestKey = this.threads.keys().next().value;
      this.threads.delete(oldestKey);
    }
  }

  // Create new thread
  const thread = this.codexInstance!.startThread({
    workingDirectory: config.working_dir,
    skipGitRepoCheck: config.skip_git_repo_check ?? false,
  });

  if (config.persist_threads && cacheKey) {
    this.threads.set(cacheKey, thread);
  }

  return thread;
}

private async runStreaming(
  thread: any,
  prompt: string,
  runOptions: any,
  callOptions?: CallApiOptionsParams,
): Promise<any> {
  const { events } = await thread.runStreamed(prompt, runOptions);
  const items: any[] = [];
  let usage: any = undefined;

  for await (const event of events) {
    // Check abort signal
    if (callOptions?.abortSignal?.aborted) {
      throw new Error('AbortError');
    }

    switch (event.type) {
      case 'item.completed':
        items.push(event.item);
        logger.debug('Codex item completed', { item: event.item });
        break;
      case 'turn.completed':
        usage = event.usage;
        logger.debug('Codex turn completed', { usage });
        break;
    }
  }

  return {
    finalResponse: items.map(i => i.content).join('\n'),
    items,
    usage,
  };
}

private generateCacheKey(config: OpenAICodexSDKConfig, prompt: string): string {
  const keyData = {
    working_dir: config.working_dir,
    model: config.model,
    output_schema: config.output_schema,
    prompt,
  };

  const hash = crypto.createHash('sha256').update(JSON.stringify(keyData)).digest('hex');
  return `openai:codex-sdk:${hash}`;
}
```

### 1.6 Registry Integration

**File**: `src/providers/registry.ts`

Add after Claude Agent SDK entry (~line 210):

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

### 1.7 CHANGELOG Entry

**File**: `CHANGELOG.md`

Add under `## [Unreleased]` → `### Added`:

```markdown
- feat(providers): add OpenAI Codex SDK provider with thread persistence, structured output, and Git-aware operations (#XXXX)
```

**Commit Message Pattern**:

```
feat(providers): add OpenAI Codex SDK provider

- Thread-based conversations with persistence
- Native JSON schema output with Zod support
- Git repository requirement for safety
- Custom binary path override support
- Streaming event support
```

---

## Phase 2: Comprehensive Testing (Days 6-8)

### 2.1 Test File Setup

**File**: `test/providers/openai-codex-sdk.test.ts`

**Required Test Execution**:

```bash
# ALWAYS run with both flags
npx jest openai-codex-sdk --coverage --randomize

# This ensures:
# 1. Test coverage is tracked
# 2. Tests don't depend on execution order
```

### 2.2 Mock Setup (Jest Pattern)

```typescript
import fs from 'fs';
import { clearCache, disableCache, enableCache } from '../../src/cache';
import logger from '../../src/logger';
import { OpenAICodexSDKProvider } from '../../src/providers/openai-codex-sdk';

jest.mock('../../src/cliState', () => ({ basePath: '/test/basePath' }));
jest.mock('../../src/esm', () => ({
  importModule: jest.fn(),
}));
jest.mock('node:module', () => ({
  createRequire: jest.fn(() => ({
    resolve: jest.fn(() => '@openai/codex-sdk'),
  })),
}));

// Mock thread instance
const mockThread = {
  id: 'test-thread-123',
  run: jest.fn(),
  runStreamed: jest.fn(),
};

// Mock Codex class
const MockCodex = jest.fn().mockImplementation(() => ({
  startThread: jest.fn().mockReturnValue(mockThread),
  resumeThread: jest.fn().mockReturnValue(mockThread),
}));

describe('OpenAICodexSDKProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // ⚠️ REQUIRED - prevents test pollution

    const { importModule } = require('../../src/esm');
    importModule.mockResolvedValue({
      Codex: MockCodex,
    });
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await clearCache();
  });

  // Tests here...
});
```

### 2.3 Required Test Coverage

**Minimum 90% coverage** across:

1. **Constructor Tests**
   - ✅ Default config
   - ✅ Custom config
   - ✅ Custom ID
   - ✅ Model validation warnings
   - ✅ API key resolution (config > env)

2. **Working Directory Tests**
   - ✅ Default CWD behavior
   - ✅ Custom working_dir validation
   - ✅ Non-existent directory error
   - ✅ Non-directory file error
   - ✅ Git repo requirement enforcement
   - ✅ `skip_git_repo_check: true` bypass

3. **Thread Management Tests**
   - ✅ Ephemeral threads (default)
   - ✅ Thread persistence with cache key
   - ✅ Thread resumption by ID
   - ✅ Thread pool size limits
   - ✅ Thread cleanup on error

4. **API Call Tests**
   - ✅ Successful call with token usage
   - ✅ Error handling (network, API errors)
   - ✅ Missing API key error
   - ✅ Abort signal (pre-abort, during execution)
   - ✅ Config merging (provider + prompt)

5. **Structured Output Tests**
   - ✅ JSON schema validation
   - ✅ Zod schema conversion
   - ✅ Invalid schema error

6. **Streaming Tests**
   - ✅ `enable_streaming: true` behavior
   - ✅ Event types (item.completed, turn.completed)
   - ✅ Abort during streaming

7. **Environment Tests**
   - ✅ Default env inheritance
   - ✅ Custom `cli_env` override
   - ✅ API key injection priority

8. **Edge Cases**
   - ✅ Empty response handling
   - ✅ Malformed API responses
   - ✅ Cache errors (graceful degradation)

### 2.4 Example Test Case

```typescript
describe('working directory management', () => {
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

  it('should bypass Git check when skip_git_repo_check is true', async () => {
    mockThread.run.mockResolvedValue({
      finalResponse: 'Response',
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    });

    const statSyncSpy = jest.spyOn(fs, 'statSync').mockReturnValue({
      isDirectory: () => true,
    } as fs.Stats);

    const provider = new OpenAICodexSDKProvider({
      config: {
        working_dir: '/path/to/non-git-dir',
        skip_git_repo_check: true, // Bypass check
      },
      env: { OPENAI_API_KEY: 'test-api-key' },
    });

    const result = await provider.callApi('Test prompt');

    expect(result.output).toBe('Response');
    expect(result.error).toBeUndefined();

    statSyncSpy.mockRestore();
  });
});
```

### 2.5 Testing Checklist

- [ ] Run tests: `npx jest openai-codex-sdk --coverage --randomize`
- [ ] Verify >90% coverage in console output
- [ ] Check coverage report: `coverage/lcov-report/index.html`
- [ ] All tests pass with `--randomize` (no order dependencies)
- [ ] No `console.log` statements in tests (use logger mocks)
- [ ] All mocks cleaned up with `jest.resetAllMocks()` in `afterEach`
- [ ] Tests use entire object assertions (not individual fields)
- [ ] No test timeouts increased (fix slow tests instead)

---

## Phase 3: Examples (Days 9-11)

### 3.1 Directory Structure

```
examples/openai-codex-sdk/
├── README.md
├── basic/
│   └── promptfooconfig.yaml
├── working-dir/
│   ├── promptfooconfig.yaml
│   └── sample-project/
│       ├── .git/              # ⚠️ REQUIRED - initialize with git init
│       ├── package.json
│       ├── src/
│       │   ├── index.ts
│       │   └── utils.py
│       └── README.md
├── structured-output/
│   ├── promptfooconfig.yaml
│   └── zod-example.ts        # Zod schema demo
├── thread-continuation/
│   ├── promptfooconfig.yaml
│   └── hooks.js
└── git-operations/
    ├── promptfooconfig.yaml
    └── target-repo/
        └── .git/
```

### 3.2 Example 1: Basic Usage

**File**: `examples/openai-codex-sdk/basic/promptfooconfig.yaml`

**CRITICAL**: Follow exact field order from examples.mdc

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Simple code generation with Codex SDK'

prompts:
  - 'Write a Python function that calculates the factorial of a number. Output only the code.'

providers:
  - openai:codex-sdk

tests:
  - vars: {}
    assert:
      - type: contains
        value: 'def factorial'
      - type: llm-rubric
        value: 'Should generate working Python code for factorial calculation'
```

**Testing**:

```bash
# ✅ ALWAYS use local build when developing
npm run local -- eval -c examples/openai-codex-sdk/basic/promptfooconfig.yaml

# ❌ NEVER use published version during development
# npx promptfoo@latest eval -c ...
```

### 3.3 Example 2: Working Directory with Git

**File**: `examples/openai-codex-sdk/working-dir/promptfooconfig.yaml`

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Code analysis in Git repository'

prompts:
  - 'Analyze the code in this repository and identify potential bugs. List them with file paths and line numbers.'

providers:
  - id: openai:codex-sdk
    config:
      working_dir: './sample-project'
      # Git check is automatic - sample-project must have .git/

tests:
  - vars: {}
    assert:
      - type: contains-any
        value: ['bug', 'issue', 'error', 'TODO', 'FIXME']
      - type: llm-rubric
        value: 'Should identify specific code issues with file references'
```

**Setup Instructions** (README.md):

````markdown
## Setup

Initialize the sample project as a Git repository:

```bash
cd sample-project
git init
git add .
git commit -m "Initial commit"
cd ..
```
````

This is required because Codex SDK enforces Git repository checks by default.

````

### 3.4 Example 3: Structured Output with Zod

**File**: `examples/openai-codex-sdk/structured-output/promptfooconfig.yaml`

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'JSON schema output with Zod'

prompts:
  - 'Analyze this repository and provide a structured summary'

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
            enum: ['ok', 'needs_attention', 'critical']
          issues:
            type: array
            items:
              type: object
              properties:
                file:
                  type: string
                line:
                  type: number
                severity:
                  type: string
                  enum: ['low', 'medium', 'high']
                description:
                  type: string
              required: ['file', 'severity', 'description']
        required: ['summary', 'status']
        additionalProperties: false

tests:
  - vars: {}
    assert:
      - type: is-json
      - type: javascript
        value: |
          const result = JSON.parse(output);
          return result.status && ['ok', 'needs_attention', 'critical'].includes(result.status);
      - type: llm-rubric
        value: 'Should return valid JSON matching the schema with file analysis'
````

**Companion File**: `examples/openai-codex-sdk/structured-output/zod-example.ts`

```typescript
/**
 * Example: Using Zod with OpenAI Codex SDK in promptfoo
 *
 * This shows how to define schemas with Zod and convert them
 * for use with Codex SDK's structured output.
 */

import z from 'zod';
import zodToJsonSchema from 'zod-to-json-schema';

// Define schema with Zod (provides type safety)
const RepositorySummarySchema = z.object({
  summary: z.string(),
  file_count: z.number(),
  languages: z.array(z.string()),
  status: z.enum(['ok', 'needs_attention', 'critical']),
  issues: z.array(
    z.object({
      file: z.string(),
      line: z.number().optional(),
      severity: z.enum(['low', 'medium', 'high']),
      description: z.string(),
    }),
  ),
});

// Convert to JSON Schema for Codex SDK
const jsonSchema = zodToJsonSchema(RepositorySummarySchema, {
  target: 'openAi', // ⚠️ Important: use 'openAi' target
});

console.log('Generated JSON Schema:');
console.log(JSON.stringify(jsonSchema, null, 2));

// Use in promptfoo config:
// providers:
//   - id: openai:codex-sdk
//     config:
//       output_schema: <paste jsonSchema here>

// Type-safe parsing
type RepositorySummary = z.infer<typeof RepositorySummarySchema>;

const exampleOutput = {
  summary: 'Repository contains 15 files',
  file_count: 15,
  languages: ['TypeScript', 'Python'],
  status: 'ok' as const,
  issues: [],
};

const validated: RepositorySummary = RepositorySummarySchema.parse(exampleOutput);
console.log('Validated:', validated);
```

### 3.5 Example 4: Thread Continuation

**File**: `examples/openai-codex-sdk/thread-continuation/promptfooconfig.yaml`

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Multi-turn conversations with thread persistence'

prompts:
  - 'List all Python files in this repository'
  - 'Now analyze the first Python file you found and suggest improvements'
  - 'Implement one of your suggested improvements'

providers:
  - id: openai:codex-sdk
    config:
      working_dir: '.'
      skip_git_repo_check: true
      persist_threads: true # ⚠️ Enable thread reuse
      thread_pool_size: 1 # One thread for all prompts

tests:
  - vars: {}
    assert:
      - type: llm-rubric
        value: 'Should maintain context across all three prompts and reference specific files by name'
```

### 3.6 Main Example README

**File**: `examples/openai-codex-sdk/README.md`

**REQUIRED FORMAT** (from examples.mdc):

````markdown
# openai-codex-sdk (OpenAI Codex SDK Examples)

The OpenAI Codex SDK provider enables agentic code analysis and generation evals with thread-based conversations and Git-aware operations.

You can run this example with:

```bash
npx promptfoo@latest init --example openai-codex-sdk
```
````

## Setup

Install the OpenAI Codex SDK:

```bash
npm install @openai/codex-sdk
```

**Requirements**: Node.js 18+

Set your OpenAI API key:

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

Analyze code in a Git repository. The sample project must be initialized as a Git repo:

```bash
cd working-dir/sample-project
git init
git add .
git commit -m "Initial commit"
cd ../..
```

**Location**: `./working-dir/`

**Usage**:

```bash
(cd working-dir && promptfoo eval)
```

### Structured Output

Generate JSON responses conforming to schemas. Includes Zod example.

**Location**: `./structured-output/`

**Usage**:

```bash
(cd structured-output && promptfoo eval)

# Run Zod example:
ts-node zod-example.ts
```

### Thread Continuation

Multi-turn conversations with persistent state.

**Location**: `./thread-continuation/`

**Usage**:

```bash
(cd thread-continuation && promptfoo eval)
```

## Key Features

- **Thread Persistence**: Conversations saved to `~/.codex/sessions`
- **Git Integration**: Automatic repository detection (can be disabled)
- **Structured Output**: Native JSON schema support with Zod
- **Streaming Events**: Real-time progress updates
- **Custom Binary**: Override Codex binary path with `codex_path_override`

## Configuration Options

See [documentation](https://www.promptfoo.dev/docs/providers/openai-codex-sdk/) for full details.

````

### 3.7 Example Testing Checklist

- [ ] All examples use `# yaml-language-server: $schema=...` at top
- [ ] Field order: `description` → `prompts` → `providers` → `tests`
- [ ] Descriptions are SHORT (3-10 words)
- [ ] Latest models used (`gpt-4o`, `o3-mini`, etc.)
- [ ] Test with local build: `npm run local -- eval -c ...`
- [ ] Git repos initialized in `working-dir/sample-project/`
- [ ] All examples produce meaningful output
- [ ] README includes `npx promptfoo@latest init --example ...`

---

## Phase 4: Documentation (Days 12-14)

### 4.1 Provider Documentation

**File**: `site/docs/providers/openai-codex-sdk.md`

**CRITICAL TERMINOLOGY** (from site/docs/CLAUDE.md):
- ✅ Use "eval" (not "evaluation")
- ✅ Use "promptfoo" (lowercase in code/commands)
- ✅ Use "Promptfoo" (capital at start of sentences)

**Front Matter**:
```yaml
---
sidebar_label: OpenAI Codex SDK
---
````

**Structure**:

1. **Introduction** (1-2 paragraphs)
   - What is Codex SDK
   - Key capabilities
   - When to use vs standard OpenAI provider

2. **Installation**

   ```bash
   npm install @openai/codex-sdk
   ```

3. **Configuration** (tables)
   - Basic options
   - Thread management
   - Advanced options
   - Each with type, description, default

4. **Examples** (progressive complexity)
   - Basic code generation
   - Git repository analysis
   - Structured output (JSON schemas)
   - Zod integration
   - Thread persistence
   - Custom binary path

5. **Git Repository Requirement**
   - Why it exists (safety)
   - How to bypass (`skip_git_repo_check`)
   - Best practices

6. **Thread Management**
   - Ephemeral (default)
   - Persistent threads
   - Resume threads
   - Performance implications

7. **Structured Output**
   - JSON schema format
   - Zod integration with example
   - Schema validation

8. **Advanced Topics**
   - Streaming events
   - Custom binary path
   - Environment variables
   - Cost calculation

9. **Comparison Table**

   ```markdown
   | Feature               | Claude Agent SDK | OpenAI Codex SDK   |
   | --------------------- | ---------------- | ------------------ |
   | **State**             | Stateless        | Thread-based       |
   | **Git Req**           | No               | Yes (can skip)     |
   | **Structured Output** | No               | Yes (JSON schemas) |
   | **Binary**            | Bundled          | Subprocess CLI     |
   ```

10. **Troubleshooting**
    - Binary not found
    - Git repo errors
    - Thread not resuming
    - Schema validation failures

11. **Related Documentation**
    - Link to OpenAI provider
    - Link to Claude Agent SDK
    - Link to examples

### 4.2 Update Provider Index

**File**: `site/docs/providers/index.md`

Add entry in alphabetical order:

```markdown
## OpenAI Codex SDK

Agentic code analysis and generation with thread-based conversations.

- **Features**: Thread persistence, structured output, Git-aware operations
- **Use Cases**: Code review, bug detection, multi-file analysis
- **Requirements**: Node.js 18+, Git repository (optional)

[OpenAI Codex SDK Documentation →](/docs/providers/openai-codex-sdk/)
```

### 4.3 Documentation Testing

```bash
cd site
npm run dev  # http://localhost:3000

# For faster builds during development:
SKIP_OG_GENERATION=true npm run build
```

**Checklist**:

- [ ] All links work (internal and external)
- [ ] Code blocks have proper syntax highlighting
- [ ] Admonitions have empty lines around content
- [ ] No broken image references
- [ ] Search finds relevant keywords
- [ ] Mobile responsive (check on narrow viewport)
- [ ] No console errors in browser
- [ ] OpenGraph preview looks good

---

## Phase 5: Integration & Polish (Days 15-17)

### 5.1 Type Exports

**File**: `src/types/providers.ts`

```typescript
// OpenAI Codex SDK
export type { OpenAICodexSDKConfig } from '../providers/openai-codex-sdk';
```

### 5.2 UI Integration - Provider Selector

**File**: `src/app/src/pages/eval-creator/components/ProviderSelector.tsx`

Find the provider options array and add:

```typescript
{
  value: 'openai:codex-sdk',
  label: 'OpenAI Codex SDK',
  description: 'Agentic code analysis with thread persistence',
  category: 'Agent SDKs',
},
```

### 5.3 Red Team Integration

**File**: `src/app/src/pages/redteam/setup/components/Targets/consts.ts`

```typescript
export const AGENT_SDK_PROVIDERS = ['anthropic:claude-agent-sdk', 'openai:codex-sdk'] as const;
```

### 5.4 Environment Variables

**File**: `src/envars.ts`

Add documentation:

```typescript
/**
 * OpenAI Codex SDK
 */
export const CODEX_API_KEY = getEnvString('CODEX_API_KEY');
// Falls back to OPENAI_API_KEY if not set
```

### 5.5 Package.json Notice

**File**: `package.json`

Add to `peerDependenciesMeta` (optional dependencies):

```json
{
  "peerDependenciesMeta": {
    "@openai/codex-sdk": {
      "optional": true
    }
  }
}
```

**OR** add installation note in README (preferred for proprietary packages).

### 5.6 Final CHANGELOG Update

**File**: `CHANGELOG.md`

Ensure entry is comprehensive:

```markdown
## [Unreleased]

### Added

- feat(providers): add OpenAI Codex SDK provider with thread persistence, structured JSON output, Git-aware operations, and Zod integration (#XXXX)
```

---

## Phase 6: Testing & Quality Assurance (Days 18-20)

### 6.1 Unit Tests

```bash
# Run provider tests with required flags
npx jest openai-codex-sdk --coverage --randomize

# Check coverage report
open coverage/lcov-report/index.html

# Ensure >90% coverage
```

**Checklist**:

- [ ] All tests pass
- [ ] Coverage >90%
- [ ] No test order dependencies (passes with `--randomize`)
- [ ] All mocks cleaned up (`jest.resetAllMocks()`)
- [ ] No console.log statements
- [ ] Error messages are descriptive

### 6.2 Integration Tests (Manual)

**Setup**:

```bash
# Install Codex SDK in test environment
npm install @openai/codex-sdk

# Set API key
export OPENAI_API_KEY=sk-...

# Build local version
npm run build

# Link for global testing
npm link
```

**Test Cases**:

1. **Basic Eval**

   ```bash
   npm run local -- eval -c examples/openai-codex-sdk/basic/promptfooconfig.yaml
   ```

   - ✅ Provider loads without errors
   - ✅ Response contains code
   - ✅ Token usage reported
   - ✅ Assertions pass

2. **Git Repository**

   ```bash
   cd examples/openai-codex-sdk/working-dir/sample-project
   git init && git add . && git commit -m "test"
   cd ../../..

   npm run local -- eval -c examples/openai-codex-sdk/working-dir/promptfooconfig.yaml
   ```

   - ✅ Git check passes
   - ✅ Code analysis includes file paths
   - ✅ No errors accessing files

3. **Structured Output**

   ```bash
   npm run local -- eval -c examples/openai-codex-sdk/structured-output/promptfooconfig.yaml
   ```

   - ✅ Output is valid JSON
   - ✅ Schema validation passes
   - ✅ Required fields present

4. **Thread Persistence**

   ```bash
   npm run local -- eval -c examples/openai-codex-sdk/thread-continuation/promptfooconfig.yaml
   ```

   - ✅ Context maintained across prompts
   - ✅ Thread ID consistent
   - ✅ Second prompt references first

5. **Error Handling**

   ```bash
   # Test without API key
   unset OPENAI_API_KEY
   npm run local -- eval -c examples/openai-codex-sdk/basic/promptfooconfig.yaml
   ```

   - ✅ Clear error message about missing API key
   - ✅ No stack traces (unless debug mode)

   ```bash
   # Test non-existent working directory
   # (Modify config to point to /fake/path)
   ```

   - ✅ Clear error about directory not existing

   ```bash
   # Test non-Git directory
   # (Modify config to point to /tmp without skip_git_repo_check)
   ```

   - ✅ Clear error about Git requirement
   - ✅ Suggests using skip_git_repo_check

### 6.3 Linting & Formatting

```bash
# Fix linting issues
npm run lint -- --fix

# Format code
npm run format

# Check no remaining issues
npm run lint
npm run format:check
```

**Checklist**:

- [ ] No Biome errors
- [ ] No Prettier formatting issues
- [ ] Imports sorted correctly
- [ ] No unused variables
- [ ] Consistent code style

### 6.4 Build Verification

```bash
# Clean build
npm run build:clean

# Full build
npm run build

# Check for TypeScript errors
npm run tsc

# Verify dist/ contains compiled files
ls -la dist/src/providers/openai-codex-sdk.js
```

**Checklist**:

- [ ] No TypeScript errors
- [ ] Provider compiles successfully
- [ ] No circular dependencies
- [ ] Bundle size acceptable (check vs main branch)

### 6.5 Documentation Build

```bash
cd site

# Build docs (skip OG for speed)
SKIP_OG_GENERATION=true npm run build

# Check for broken links
npm run build 2>&1 | grep -i "broken"

# Start production preview
npm run serve
```

**Checklist**:

- [ ] Docs build without errors
- [ ] No broken links
- [ ] All images load
- [ ] Code blocks render correctly
- [ ] Search works

### 6.6 Regression Testing

Test that existing functionality still works:

```bash
# Run full test suite
npm test -- --coverage --randomize

# Test other providers still work
npm run local -- eval -c examples/openai/chat_config.yaml
npm run local -- eval -c examples/anthropic/chat.yaml
npm run local -- eval -c examples/claude-agent-sdk/basic/promptfooconfig.yaml
```

**Checklist**:

- [ ] All existing tests pass
- [ ] Other providers unaffected
- [ ] No new warnings/errors
- [ ] Performance not degraded

---

## Phase 7: Pull Request (Days 21-25)

### 7.1 Pre-PR Checklist

**Code Quality**:

- [ ] All tests pass: `npm test -- --coverage --randomize`
- [ ] Coverage >90%: Check `coverage/lcov-report/index.html`
- [ ] Lint passes: `npm run lint`
- [ ] Format passes: `npm run format:check`
- [ ] Build succeeds: `npm run build`
- [ ] TypeScript compiles: `npm run tsc`

**Documentation**:

- [ ] Provider docs complete (`site/docs/providers/openai-codex-sdk.md`)
- [ ] Examples documented (`examples/openai-codex-sdk/README.md`)
- [ ] CHANGELOG.md updated
- [ ] Code comments comprehensive
- [ ] All configuration options documented

**Examples**:

- [ ] All examples tested with `npm run local`
- [ ] Git repos initialized where needed
- [ ] README instructions accurate
- [ ] Config files follow field order
- [ ] Descriptions are SHORT (3-10 words)

**Integration**:

- [ ] Provider registered in `src/providers/registry.ts`
- [ ] Types exported in `src/types/providers.ts`
- [ ] UI selector updated
- [ ] Red team integration added
- [ ] Environment variables documented

### 7.2 Create Feature Branch

```bash
# Ensure on main and up-to-date
git checkout main
git pull origin main

# Create feature branch
git checkout -b feat/openai-codex-sdk-provider

# Verify no uncommitted changes
git status
```

### 7.3 Commit Strategy

**Follow Conventional Commits** (squash merged with single message):

```bash
# Stage related files together
git add src/providers/openai-codex-sdk.ts
git add src/providers/registry.ts
git commit -m "feat(providers): add OpenAI Codex SDK provider core"

git add test/providers/openai-codex-sdk.test.ts
git commit -m "test(providers): add comprehensive Codex SDK tests"

git add examples/openai-codex-sdk/
git commit -m "feat(examples): add Codex SDK examples with Zod"

git add site/docs/providers/openai-codex-sdk.md
git add site/docs/providers/index.md
git commit -m "docs(providers): add Codex SDK documentation"

git add src/app/src/pages/eval-creator/components/ProviderSelector.tsx
git add src/app/src/pages/redteam/setup/components/Targets/consts.ts
git commit -m "feat(ui): integrate Codex SDK in provider selector and red team"

git add CHANGELOG.md
git commit -m "chore: update CHANGELOG for Codex SDK provider"
```

### 7.4 Push and Create PR

````bash
# Push branch
git push -u origin feat/openai-codex-sdk-provider

# Create PR using GitHub CLI
gh pr create \
  --title "feat(providers): add OpenAI Codex SDK provider with thread persistence and structured output" \
  --body "$(cat <<'EOF'
## Summary

Adds OpenAI Codex SDK as a first-class provider with:

- **Thread-based conversations** with persistence in `~/.codex/sessions`
- **Structured JSON output** with native schema support and Zod integration
- **Git-aware operations** with automatic repository detection (can be disabled)
- **Custom binary path** override for advanced setups
- **Streaming events** for real-time progress updates

## Implementation Details

### Core Features
- Lazy-loading of `@openai/codex-sdk` package (proprietary license)
- Thread pooling with configurable size limits
- Thread resumption by ID for continued conversations
- Working directory validation with Git repository checks
- Environment variable passthrough with stable sorting for cache keys

### Testing
- **90%+ test coverage** with comprehensive unit tests
- All tests pass with `--coverage --randomize` flags
- Mock-based tests (no real API calls)
- Edge case coverage (errors, abort signals, malformed responses)

### Examples
- `basic/` - Simple code generation
- `working-dir/` - Git repository analysis
- `structured-output/` - JSON schemas with Zod integration
- `thread-continuation/` - Multi-turn conversations

### Documentation
- Complete provider documentation with all options
- Comparison table vs Claude Agent SDK
- Troubleshooting guide
- Zod integration examples

## Testing Instructions

```bash
# Install Codex SDK
npm install @openai/codex-sdk

# Set API key
export OPENAI_API_KEY=sk-...

# Run unit tests
npm test -- openai-codex-sdk --coverage --randomize

# Test basic example
npm run local -- eval -c examples/openai-codex-sdk/basic/promptfooconfig.yaml

# Test with Git repo
cd examples/openai-codex-sdk/working-dir/sample-project
git init && git add . && git commit -m "test"
cd ../../..
npm run local -- eval -c examples/openai-codex-sdk/working-dir/promptfooconfig.yaml
````

## Checklist

- [x] Tests pass (`npm test -- --coverage --randomize`)
- [x] Coverage >90%
- [x] Lint passes (`npm run lint`)
- [x] Format passes (`npm run format`)
- [x] Build succeeds (`npm run build`)
- [x] All examples tested with local build
- [x] Documentation complete
- [x] CHANGELOG.md updated
- [x] UI integration complete
- [x] No regression in existing providers

## Breaking Changes

None - this is a new provider.

## Related Issues

Closes #XXXX (if applicable)

## Screenshots

(If UI changes were made, include screenshots)

---

**Note**: This PR follows the patterns established in the Claude Agent SDK provider implementation (src/providers/claude-agent-sdk.ts).
EOF
)"

# Add reviewers (optional)

# gh pr edit --add-reviewer username1,username2

````

### 7.5 PR Description Template

Use the template above, ensuring:

1. **Summary** - Clear description of what's added
2. **Implementation Details** - Technical highlights
3. **Testing Instructions** - Step-by-step commands
4. **Checklist** - All items checked
5. **Breaking Changes** - None for new provider
6. **Related Issues** - Link if applicable

### 7.6 Responding to Review Feedback

**Common Review Comments**:

1. **"Add tests for X edge case"**
   ```bash
   # Add test
   # Commit
   git add test/providers/openai-codex-sdk.test.ts
   git commit -m "test: add coverage for X edge case"
   git push
````

2. **"Documentation unclear about Y"**

   ```bash
   # Update docs
   git add site/docs/providers/openai-codex-sdk.md
   git commit -m "docs: clarify Y in Codex SDK docs"
   git push
   ```

3. **"Linting issues in file Z"**
   ```bash
   npm run lint -- --fix
   git add -u
   git commit -m "style: fix linting issues in Z"
   git push
   ```

**Response Template**:

```
Thanks for the review! I've addressed your comments:

1. ✅ Added tests for edge case X in commit abc1234
2. ✅ Clarified Y in documentation in commit def5678
3. ✅ Fixed linting issues in commit ghi9012

Please let me know if anything else needs attention.
```

### 7.7 CI Checks

GitHub Actions will run:

1. **Tests** - Must pass with coverage
2. **Lint** - Must have no errors
3. **Build** - Must compile successfully
4. **TypeScript** - Must type-check
5. **Changelog** - Must have entry or bypass label

**If CI Fails**:

```bash
# Pull latest changes
git pull origin feat/openai-codex-sdk-provider

# Fix issues locally
npm test -- --coverage --randomize
npm run lint -- --fix
npm run build

# Commit fixes
git add -u
git commit -m "fix: resolve CI failures"
git push
```

### 7.8 Merge Requirements

**Before Merge**:

- [ ] All CI checks pass (green checkmarks)
- [ ] At least 1 approving review
- [ ] All review comments addressed
- [ ] No merge conflicts with main
- [ ] CHANGELOG.md updated
- [ ] Documentation built successfully

**Merge Process**:

1. Maintainer approves PR
2. GitHub Actions runs final checks
3. **Squash and merge** with conventional commit message:

   ```
   feat(providers): add OpenAI Codex SDK provider with thread persistence and structured output (#XXXX)

   - Thread-based conversations with persistence
   - Native JSON schema output with Zod support
   - Git repository requirement for safety
   - Custom binary path override support
   - Streaming event support
   ```

### 7.9 Post-Merge

1. **Delete branch**:

   ```bash
   git checkout main
   git pull origin main
   git branch -d feat/openai-codex-sdk-provider
   ```

2. **Verify in main**:

   ```bash
   npm test -- openai-codex-sdk --coverage --randomize
   npm run build
   ```

3. **Update CHANGELOG** (if releasing soon):
   - Move entry from `[Unreleased]` to version section
   - Follow Keep a Changelog format

---

## Risk Assessment & Mitigation

### High Risk Items

| Risk                           | Impact | Likelihood | Mitigation                                        |
| ------------------------------ | ------ | ---------- | ------------------------------------------------- |
| Codex SDK API changes          | High   | Medium     | Pin to specific version; document in package.json |
| Binary subprocess crashes      | High   | Low        | Comprehensive error handling; timeout protection  |
| Thread state corruption        | Medium | Low        | Thread cleanup on errors; pool size limits        |
| Git repo check false negatives | Medium | Low        | Thorough validation; clear error messages         |

### Testing Gaps

1. **Cross-platform** - Limited testing on Windows
   - **Mitigation**: Document platform requirements; add CI matrix

2. **Large repositories** - Performance not tested at scale
   - **Mitigation**: Document performance characteristics; suggest Git repo size limits

3. **Network failures** - Limited real-world API error testing
   - **Mitigation**: Mock various API errors; document retry strategies

### Dependency Concerns

1. **`@openai/codex-sdk`** - Proprietary license
   - **Mitigation**: Make optional; clear installation docs

2. **`zod-to-json-schema`** - External dependency
   - **Mitigation**: Document as optional; show both Zod and plain JSON examples

---

## Success Metrics

### Technical Metrics

- ✅ **Test Coverage**: >90%
- ✅ **CI Pass Rate**: 100%
- ✅ **Build Time**: <5% increase vs main
- ✅ **Bundle Size**: <50KB added

### User Metrics

- ✅ **Example Success Rate**: All examples run without errors
- ✅ **Documentation Clarity**: No follow-up questions in first week
- ✅ **Issue Rate**: <1 bug per 100 users

### Adoption Metrics

- ✅ **Usage**: >10 users in first month
- ✅ **Feedback**: Positive sentiment in Discord/GitHub
- ✅ **Contributions**: At least 1 community contribution (example or doc)

---

## Timeline Summary

| Phase                | Days  | Deliverables                                  |
| -------------------- | ----- | --------------------------------------------- |
| **1. Core Provider** | 1-5   | Provider implementation, registry integration |
| **2. Testing**       | 6-8   | Comprehensive unit tests (>90% coverage)      |
| **3. Examples**      | 9-11  | 5+ examples with Git repos, Zod integration   |
| **4. Documentation** | 12-14 | Provider docs, index update, troubleshooting  |
| **5. Integration**   | 15-17 | UI selector, red team, type exports, polish   |
| **6. QA**            | 18-20 | Integration tests, regression, performance    |
| **7. PR**            | 21-25 | PR creation, review, revisions, merge         |

**Total**: 3-4 weeks (25 days)

---

## Additional Resources

### Reference Files

- **Claude Agent SDK**: `src/providers/claude-agent-sdk.ts`
- **Claude SDK Tests**: `test/providers/claude-agent-sdk.test.ts`
- **OpenAI Provider**: `src/providers/openai/`
- **Contributing Guide**: `site/docs/contributing.md`
- **Examples Guidelines**: `.cursor/rules/examples.mdc`
- **Jest Guidelines**: `.cursor/rules/jest.mdc`

### External Documentation

- **Codex SDK Repo**: https://github.com/openai/codex
- **Codex TypeScript SDK**: https://github.com/openai/codex/tree/main/sdk/typescript
- **Zod**: https://zod.dev
- **zod-to-json-schema**: https://github.com/StefanTerdell/zod-to-json-schema

### Community Resources

- **Discord**: https://discord.gg/promptfoo
- **GitHub Issues**: https://github.com/promptfoo/promptfoo/issues

---

## Appendix: Complete Code Samples

### A. Full Provider Class

See Phase 1 sections 1.1-1.5 for complete implementation.

### B. Test Suite Structure

```typescript
describe('OpenAICodexSDKProvider', () => {
  describe('constructor', () => {
    /* 5 tests */
  });
  describe('callApi', () => {
    describe('basic functionality', () => {
      /* 4 tests */
    });
    describe('working directory management', () => {
      /* 6 tests */
    });
    describe('thread management', () => {
      /* 5 tests */
    });
    describe('structured output', () => {
      /* 3 tests */
    });
    describe('streaming', () => {
      /* 3 tests */
    });
    describe('config merging', () => {
      /* 2 tests */
    });
    describe('abort signal', () => {
      /* 3 tests */
    });
    describe('environment variables', () => {
      /* 3 tests */
    });
  });
});
```

**Total**: 34+ test cases

### C. Example Config Template

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'SHORT description (3-10 words)'

prompts:
  - 'Your prompt here'

providers:
  - id: openai:codex-sdk
    config:
      working_dir: '.'
      skip_git_repo_check: true
      # Add other options as needed

tests:
  - vars: {}
    assert:
      - type: llm-rubric
        value: 'Your assertion here'
```

---

## Final Checklist

**Before Starting Implementation**:

- [ ] Read this entire plan
- [ ] Review Claude Agent SDK implementation
- [ ] Set up local environment (`npm install`)
- [ ] Install Codex SDK (`npm install @openai/codex-sdk`)
- [ ] Test Codex SDK works locally

**Daily Workflow**:

- [ ] Pull latest main (`git pull origin main`)
- [ ] Run tests before coding (`npm test -- --randomize`)
- [ ] Code in small increments
- [ ] Test frequently (`npm run local`)
- [ ] Commit logical chunks
- [ ] End of day: push to feature branch

**Before PR**:

- [ ] All checklists in Phase 6 complete
- [ ] All examples tested
- [ ] Documentation reviewed
- [ ] CHANGELOG updated
- [ ] No console.log statements
- [ ] No commented-out code

**After Merge**:

- [ ] Verify in main branch
- [ ] Update local clone
- [ ] Monitor Discord/GitHub for user feedback
- [ ] Prepare to iterate based on feedback

---

**Ready to implement! 🚀**

For questions or clarification, reference:

- This plan
- Contributing guide (`site/docs/contributing.md`)
- Claude Agent SDK implementation
- Promptfoo Discord (#contributors channel)
