# Gemini CLI Provider for Promptfoo - Implementation Plan

## Executive Summary

**Finding: Gemini CLI does NOT have a Node.js SDK interface like Claude Agent SDK.**

Unlike Claude Agent SDK which provides a clean `query()` function for programmatic access, Gemini CLI is primarily a CLI tool. There is no published SDK-style API for direct Node.js integration.

### Key Differences

| Feature                | Claude Agent SDK                              | Gemini CLI                                         |
| ---------------------- | --------------------------------------------- | -------------------------------------------------- |
| Package                | `@anthropic-ai/claude-agent-sdk`              | `@google/gemini-cli`                               |
| API Style              | `query({ prompt, options })` → AsyncGenerator | CLI binary only                                    |
| Programmatic Access    | ✅ First-class SDK                            | ❌ Shell execution required                        |
| Published Core Library | SDK is the interface                          | `@google/gemini-cli-core` (internal, undocumented) |
| Headless Mode          | Built into SDK                                | CLI flags: `-p`, `--output-format json`            |

## Available Integration Options

### Option A: Shell Execution (Recommended)

Spawn the `gemini` CLI process with headless mode flags and parse JSON output.

**Pros:**

- Uses stable, documented CLI interface
- Won't break with internal API changes
- Matches Gemini CLI's intended non-interactive usage pattern
- Supports all CLI features (auth, MCP, sandbox, etc.)

**Cons:**

- Process spawning overhead per call
- Less control over streaming/cancellation
- Requires `@google/gemini-cli` installed globally or in project

### Option B: Internal API (NOT Recommended)

Use `@google/gemini-cli-core` internal classes directly.

**Cons:**

- APIs are undocumented and internal
- Subject to breaking changes without notice
- Complex initialization (Config, ContentGenerator, GeminiClient, etc.)
- No official support

### Option C: A2A Server (Special Use Case)

The Gemini CLI includes an A2A (Agent-to-Agent) server, but this is designed for long-running agent tasks with HTTP APIs, not simple query/response patterns.

## Recommended Implementation: Shell Execution Provider

### Provider ID

```yaml
providers:
  - google:gemini-cli
```

### Implementation Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GeminiCLIProvider                        │
├─────────────────────────────────────────────────────────────┤
│  callApi(prompt, context, options)                         │
│    │                                                        │
│    ├─► Build CLI command with options                       │
│    │     gemini -p "prompt" --output-format json [flags]   │
│    │                                                        │
│    ├─► Spawn child process                                  │
│    │     - Set working directory                            │
│    │     - Pass environment variables                       │
│    │     - Handle timeout/abort                             │
│    │                                                        │
│    ├─► Parse JSON output                                    │
│    │     {                                                  │
│    │       response: string,                                │
│    │       stats: { models, tools, files },                 │
│    │       error?: { type, message, code }                  │
│    │     }                                                  │
│    │                                                        │
│    └─► Return ProviderResponse                              │
│          { output, tokenUsage, cost, error }               │
└─────────────────────────────────────────────────────────────┘
```

### Configuration Options

Based on Gemini CLI's headless mode capabilities:

```typescript
interface GeminiCLIOptions {
  // Authentication
  apiKey?: string; // GEMINI_API_KEY
  googleCloudProject?: string; // GOOGLE_CLOUD_PROJECT
  useVertexAI?: boolean; // GOOGLE_GENAI_USE_VERTEXAI

  // Model selection
  model?: string; // -m, --model

  // Working directory
  working_dir?: string; // --working-directory
  include_directories?: string[]; // --include-directories

  // Permissions
  approval_mode?: 'suggest' | 'auto_edit' | 'full_auto'; // --approval-mode
  yolo?: boolean; // -y, --yolo (auto-approve all)

  // Sandboxing
  sandbox?: 'docker' | 'podman' | false; // --sandbox

  // MCP servers (via settings file)
  mcp_settings_path?: string; // Path to settings.json with MCP config

  // Tool control
  disable_tools?: string[]; // --disable-tool (can repeat)

  // Execution limits
  timeout_ms?: number; // Process timeout
}
```

### Example Configuration

```yaml
providers:
  - id: google:gemini-cli
    config:
      working_dir: ./src
      model: gemini-2.5-pro
      approval_mode: auto_edit
      timeout_ms: 120000

prompts:
  - 'Review the TypeScript files and identify potential bugs'
```

### Implementation Files

1. **`src/providers/gemini-cli.ts`** - Main provider implementation
2. **`test/providers/gemini-cli.test.ts`** - Unit tests
3. **`site/docs/providers/gemini-cli.md`** - Documentation
4. **`examples/gemini-cli/`** - Example configurations

### Core Implementation

```typescript
// src/providers/gemini-cli.ts

import { spawn } from 'child_process';
import type {
  ApiProvider,
  ProviderResponse,
  CallApiContextParams,
  CallApiOptionsParams,
} from '../types';

export interface GeminiCLIOptions {
  apiKey?: string;
  model?: string;
  working_dir?: string;
  include_directories?: string[];
  approval_mode?: 'suggest' | 'auto_edit' | 'full_auto';
  yolo?: boolean;
  sandbox?: 'docker' | 'podman' | false;
  timeout_ms?: number;
  disable_tools?: string[];
}

export class GeminiCLIProvider implements ApiProvider {
  config: GeminiCLIOptions;

  constructor(options: { config?: GeminiCLIOptions } = {}) {
    this.config = options.config ?? {};
  }

  id(): string {
    return 'google:gemini-cli';
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const config = { ...this.config, ...context?.prompt?.config };

    // Build CLI arguments
    const args: string[] = ['-p', prompt, '--output-format', 'json'];

    if (config.model) {
      args.push('-m', config.model);
    }
    if (config.approval_mode) {
      args.push('--approval-mode', config.approval_mode);
    }
    if (config.yolo) {
      args.push('--yolo');
    }
    if (config.include_directories?.length) {
      args.push('--include-directories', config.include_directories.join(','));
    }
    if (config.sandbox === false) {
      args.push('--sandbox', 'none');
    } else if (config.sandbox) {
      args.push('--sandbox', config.sandbox);
    }
    if (config.disable_tools) {
      for (const tool of config.disable_tools) {
        args.push('--disable-tool', tool);
      }
    }

    // Set up environment
    const env = { ...process.env };
    if (config.apiKey) {
      env.GEMINI_API_KEY = config.apiKey;
    }

    // Spawn CLI process
    const workingDir = config.working_dir ?? process.cwd();
    const timeout = config.timeout_ms ?? 120000;

    try {
      const result = await this.runGeminiCLI(
        args,
        workingDir,
        env,
        timeout,
        callOptions?.abortSignal,
      );
      return this.parseOutput(result);
    } catch (error: any) {
      return { error: `Gemini CLI error: ${error.message}` };
    }
  }

  private async runGeminiCLI(
    args: string[],
    cwd: string,
    env: NodeJS.ProcessEnv,
    timeout: number,
    abortSignal?: AbortSignal,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('gemini', args, { cwd, env, timeout });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data;
      });
      proc.stderr.on('data', (data) => {
        stderr += data;
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Exit code ${code}: ${stderr || stdout}`));
        }
      });

      proc.on('error', reject);

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          proc.kill('SIGTERM');
        });
      }
    });
  }

  private parseOutput(stdout: string): ProviderResponse {
    const json = JSON.parse(stdout);

    // Extract token usage from stats
    let tokenUsage;
    if (json.stats?.models) {
      const models = Object.values(json.stats.models) as any[];
      tokenUsage = {
        prompt: models.reduce((sum, m) => sum + (m.tokens?.prompt || 0), 0),
        completion: models.reduce((sum, m) => sum + (m.tokens?.candidates || 0), 0),
        total: models.reduce((sum, m) => sum + (m.tokens?.total || 0), 0),
      };
    }

    if (json.error) {
      return {
        error: `${json.error.type}: ${json.error.message}`,
        tokenUsage,
        raw: JSON.stringify(json),
      };
    }

    return {
      output: json.response,
      tokenUsage,
      raw: JSON.stringify(json),
    };
  }

  toString(): string {
    return '[Google Gemini CLI Provider]';
  }
}
```

### Documentation Structure

```markdown
# Gemini CLI Provider

Provider for Google's Gemini CLI agentic coding tool.

## Provider ID

- `google:gemini-cli`

## Requirements

- `@google/gemini-cli` installed globally or in your project
- Google authentication (OAuth, API key, or Vertex AI)

## Quick Start

[examples]

## Configuration Options

[table of options]

## Authentication

[OAuth, API key, Vertex AI options]

## Tools and Permissions

[approval modes, yolo, sandbox]

## Working Directory

[how to set up test directories]

## Examples

[complete examples]
```

## Implementation Timeline

### Phase 1: Core Provider (MVP)

- [ ] Basic shell execution
- [ ] JSON output parsing
- [ ] Model selection
- [ ] Working directory support
- [ ] Basic tests

### Phase 2: Enhanced Features

- [ ] Token usage tracking
- [ ] Abort/cancellation support
- [ ] Timeout handling
- [ ] Multiple auth methods

### Phase 3: Advanced Features

- [ ] MCP server configuration
- [ ] Sandbox support
- [ ] Tool enable/disable
- [ ] Caching support

## Comparison: What We Can't Do (vs Claude Agent SDK)

| Feature              | Claude Agent SDK    | Gemini CLI Provider    |
| -------------------- | ------------------- | ---------------------- |
| Streaming responses  | ✅ AsyncGenerator   | ❌ Wait for completion |
| In-process execution | ✅ Direct API calls | ❌ Child process       |
| Programmatic hooks   | ✅ Hook callbacks   | ❌ No API access       |
| Fine-grained abort   | ✅ AbortController  | ⚠️ SIGTERM only        |
| Session resumption   | ✅ resume param     | ⚠️ Via CLI flags       |
| Structured output    | ✅ output_format    | ❌ Text only           |

## Alternative: Future SDK Support

Google may release an official Gemini CLI SDK in the future. The codebase has internal modular architecture that could support this:

- `@google/gemini-cli-core` already exports many components
- The `AgentExecutor` class provides a programmatic agent loop
- A2A server shows they're thinking about programmatic interfaces

**If/when Google releases an official SDK**, we should:

1. Create a new provider `google:gemini-agent-sdk` (similar naming to Claude)
2. Keep `google:gemini-cli` for CLI-based usage
3. Migrate users who want the SDK experience

## Conclusion

While Gemini CLI doesn't offer the same SDK-style access as Claude Agent SDK, a shell execution provider is a practical solution that:

1. Uses documented, stable CLI interface
2. Supports all Gemini CLI features
3. Provides reasonable functionality for evals
4. Can be enhanced if Google releases an SDK

The main tradeoffs are process spawning overhead and lack of streaming, which are acceptable for eval workloads.
