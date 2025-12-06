# OpenCode SDK Provider Integration Plan

## Executive Summary

This plan outlines the integration of the [@opencode-ai/sdk](https://www.npmjs.com/package/@opencode-ai/sdk) as a new provider in promptfoo. OpenCode is an open-source AI coding agent built for the terminal with 30k+ GitHub stars and support for 75+ LLM providers.

**Key differentiator from existing agentic providers:**

- **Client-server architecture**: Unlike Claude Agent SDK (direct API) or Codex SDK (thread-based), OpenCode runs a local server that manages sessions, tools, and AI interactions
- **Provider agnostic**: Works with 75+ providers including Anthropic, OpenAI, Google, local models (Ollama, llama.cpp), and more
- **Built-in tool ecosystem**: Native tools (bash, read, write, edit, grep, glob) with granular permissions

## Research Summary

### OpenCode SDK Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Promptfoo      │ --> │  OpenCode       │ --> │  LLM Provider   │
│  Provider       │     │  Server         │     │  (Anthropic,    │
│                 │     │  (localhost)    │     │   OpenAI, etc)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                              │
                              v
                        ┌─────────────────┐
                        │  Tools          │
                        │  (bash, read,   │
                        │   write, etc)   │
                        └─────────────────┘
```

### SDK Initialization Options

| Option         | Type    | Description             | Default                 |
| -------------- | ------- | ----------------------- | ----------------------- |
| `baseUrl`      | string  | Server URL              | `http://localhost:4096` |
| `hostname`     | string  | Server hostname         | `127.0.0.1`             |
| `port`         | number  | Server port             | `4096`                  |
| `timeout`      | number  | Startup timeout (ms)    | `5000`                  |
| `config`       | object  | Configuration overrides | `{}`                    |
| `throwOnError` | boolean | Error handling mode     | `false`                 |
| `maxRetries`   | number  | Auto-retry count        | `2`                     |
| `logLevel`     | string  | Logging level           | `'warn'`                |

### Core API Methods

```typescript
// Session management
client.session.create() → Session
client.session.list() → SessionListResponse
client.session.delete(id) → SessionDeleteResponse
client.session.chat(id, { ...params }) → AssistantMessage
client.session.messages(id) → SessionMessagesResponse
client.session.abort(id) → SessionAbortResponse
client.session.summarize(id, { ...params }) → SessionSummarizeResponse

// File operations
client.file.read({ ...params }) → FileReadResponse
client.file.status() → FileStatusResponse

// Search
client.find.text({ ...params }) → FindTextResponse
client.find.files({ ...params }) → FindFilesResponse
client.find.symbols({ ...params }) → FindSymbolsResponse

// Configuration
client.config.get() → Config
client.app.providers() → AppProvidersResponse
client.app.modes() → AppModesResponse

// Events (SSE streaming)
client.event.list() → EventListResponse (async iterable)
```

### Tools Configuration

OpenCode provides these built-in tools:

| Tool        | Purpose                   | Default |
| ----------- | ------------------------- | ------- |
| `bash`      | Execute shell commands    | enabled |
| `edit`      | Modify existing files     | enabled |
| `write`     | Create/overwrite files    | enabled |
| `read`      | Retrieve file contents    | enabled |
| `grep`      | Regex search across files | enabled |
| `glob`      | Find files by pattern     | enabled |
| `list`      | List directory contents   | enabled |
| `patch`     | Apply patch files         | enabled |
| `todowrite` | Create task lists         | enabled |
| `todoread`  | Read task lists           | enabled |
| `webfetch`  | Fetch web content         | enabled |

### Agent Configuration

```json
{
  "agent": {
    "custom-agent": {
      "description": "Agent purpose",
      "mode": "primary",
      "model": "anthropic/claude-sonnet-4-20250514",
      "temperature": 0.7,
      "tools": { "write": true, "bash": false },
      "permission": {
        "bash": { "git push": "ask", "*": "allow" },
        "edit": "allow"
      },
      "prompt": "{file:./prompts/custom.txt}"
    }
  }
}
```

### Provider Configuration

OpenCode supports 75+ providers with this config pattern:

```json
{
  "provider": {
    "anthropic": {
      "options": {
        "baseURL": "https://api.anthropic.com/v1",
        "apiKey": "{env:ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

---

## Implementation Plan

### Phase 1: Core Provider Implementation

#### 1.1 Create Provider File Structure

**File:** `src/providers/opencode-sdk.ts`

```typescript
export interface OpenCodeSDKConfig {
  // Server connection
  baseUrl?: string;
  hostname?: string;
  port?: number;
  timeout?: number;

  // Working directory (for tools)
  working_dir?: string;

  // Model configuration
  model?: string;
  provider_id?: string; // e.g., 'anthropic', 'openai'

  // Tool configuration
  tools?: {
    bash?: boolean;
    edit?: boolean;
    write?: boolean;
    read?: boolean;
    grep?: boolean;
    glob?: boolean;
    list?: boolean;
    patch?: boolean;
    todowrite?: boolean;
    todoread?: boolean;
    webfetch?: boolean;
    [key: string]: boolean | undefined; // MCP tools: mcp_*
  };

  // Permissions
  permission?: {
    bash?: 'ask' | 'allow' | 'deny' | Record<string, 'ask' | 'allow' | 'deny'>;
    edit?: 'ask' | 'allow' | 'deny';
    webfetch?: 'ask' | 'allow' | 'deny';
  };

  // Agent configuration
  agent?: string; // Use specific agent (e.g., 'plan', 'build')
  custom_agent?: {
    description: string;
    model?: string;
    temperature?: number;
    tools?: Record<string, boolean>;
    permission?: Record<string, 'ask' | 'allow' | 'deny' | Record<string, string>>;
    prompt?: string;
  };

  // Session management
  session_id?: string; // Resume existing session
  persist_sessions?: boolean; // Keep sessions between calls

  // MCP configuration
  mcp?: {
    [serverName: string]: {
      type: 'local' | 'remote';
      command?: string;
      args?: string[];
      url?: string;
      headers?: Record<string, string>;
    };
  };

  // Advanced options
  max_retries?: number;
  log_level?: 'debug' | 'info' | 'warn' | 'error' | 'off';
  enable_streaming?: boolean;

  // Provider-specific auth (alternative to env vars)
  api_key?: string;
}
```

#### 1.2 Provider Class Implementation

Key implementation decisions based on existing patterns:

1. **Lazy SDK loading** (like `claude-agent-sdk.ts:69-95`):

   ```typescript
   async function loadOpenCodeSDK(): Promise<typeof import('@opencode-ai/sdk')> {
     // Use importModule pattern for ESM compatibility
   }
   ```

2. **Server management**:
   - Start OpenCode server if not running
   - Connect to existing server if `baseUrl` provided
   - Clean shutdown on provider cleanup

3. **Session lifecycle**:
   - Create session per eval (default, like ephemeral threads in Codex)
   - Support session resumption via `session_id`
   - Support session persistence via `persist_sessions`

4. **Tool permission mapping**:
   - Default: read-only tools when `working_dir` specified (like Claude Agent SDK)
   - Configurable via `tools` and `permission` options

5. **Caching**:
   - Use same cache key pattern as Claude Agent SDK
   - Include working directory fingerprint

#### 1.3 Default Configurations

**No working_dir (temp directory, no tools):**

```yaml
providers:
  - opencode:sdk
```

**With working_dir (read-only tools):**

```yaml
providers:
  - id: opencode:sdk
    config:
      working_dir: ./src
```

Default tools: `read`, `grep`, `glob`, `list`

**With side effects:**

```yaml
providers:
  - id: opencode:sdk
    config:
      working_dir: ./project
      tools:
        write: true
        edit: true
        bash: true
      permission:
        bash: allow
        edit: allow
```

#### 1.4 Provider Registration

**File:** `src/providers/index.ts`

Add to provider map:

```typescript
'opencode:sdk': OpenCodeSDKProvider,
'opencode': OpenCodeSDKProvider,  // alias
```

---

### Phase 2: Testing

#### 2.1 Unit Tests

**File:** `test/providers/opencode-sdk.test.ts`

```typescript
describe('OpenCodeSDKProvider', () => {
  describe('constructor', () => {
    it('should accept valid config');
    it('should warn for unknown models');
    it('should set default values');
  });

  describe('id()', () => {
    it('should return provider id');
    it('should use custom id when provided');
  });

  describe('getApiKey()', () => {
    it('should prioritize config apiKey');
    it('should fall back to env vars');
  });

  describe('callApi()', () => {
    describe('session management', () => {
      it('should create ephemeral session by default');
      it('should resume session when session_id provided');
      it('should persist sessions when enabled');
    });

    describe('tools', () => {
      it('should enable read-only tools with working_dir');
      it('should disable all tools without working_dir');
      it('should respect custom tool config');
      it('should apply permissions correctly');
    });

    describe('error handling', () => {
      it('should handle connection errors');
      it('should handle abort signals');
      it('should handle timeout');
      it('should handle rate limits');
    });

    describe('caching', () => {
      it('should cache responses');
      it('should bust cache when requested');
      it('should include working_dir in cache key');
    });

    describe('streaming', () => {
      it('should handle SSE events');
      it('should abort stream on signal');
    });
  });

  describe('cleanup()', () => {
    it('should delete ephemeral sessions');
    it('should preserve persistent sessions');
    it('should handle server shutdown');
  });
});
```

Mock patterns from existing tests:

- `test/providers/openai.test.ts` - API mocking
- `test/providers/anthropic/index.test.ts` - SDK mocking

#### 2.2 Integration Tests

**File:** `test/providers/opencode-sdk.integration.test.ts`

```typescript
describe.skip('OpenCodeSDKProvider integration', () => {
  // Skip in CI, run manually with API keys

  it('should complete basic prompt');
  it('should read files from working directory');
  it('should handle multi-turn conversation');
  it('should respect tool permissions');
});
```

#### 2.3 Test Fixtures

**Directory:** `test/providers/fixtures/opencode-sdk/`

- `test-codebase/` - Sample files for tool testing
- `mock-responses.json` - Canned API responses

---

### Phase 3: Documentation

#### 3.1 Provider Documentation

**File:** `site/docs/providers/opencode-sdk.md`

````markdown
---
sidebar_position: 42
title: OpenCode SDK
description: 'Use OpenCode SDK for evals with 75+ providers, built-in tools, and terminal-native AI agent'
---

# OpenCode SDK

This provider integrates [OpenCode](https://opencode.ai/), an open-source AI coding agent for the terminal with support for 75+ LLM providers.

## Provider IDs

- `opencode:sdk` (full name)
- `opencode` (alias)

## Installation

The OpenCode SDK provider requires the `@opencode-ai/sdk` package:

```bash
npm install @opencode-ai/sdk
```
````

## Quick Start

### Basic Usage

By default, runs in a temporary directory with no tools:

```yaml
providers:
  - opencode:sdk

prompts:
  - 'Write a Python function for binary search'
```

### With Working Directory

Enable read-only file tools:

```yaml
providers:
  - id: opencode:sdk
    config:
      working_dir: ./src

prompts:
  - 'Review the TypeScript files for bugs'
```

### With Full Tool Access

```yaml
providers:
  - id: opencode:sdk
    config:
      working_dir: ./project
      tools:
        write: true
        edit: true
        bash: true
      permission:
        bash: allow
        edit: allow
```

## Supported Parameters

[Full parameter table...]

## Model Configuration

OpenCode supports 75+ providers. Configure the model:

```yaml
providers:
  - id: opencode:sdk
    config:
      provider_id: anthropic
      model: claude-sonnet-4-20250514
```

Supported providers include:

- Anthropic (Claude)
- OpenAI
- Google Vertex AI
- Amazon Bedrock
- Groq
- Together AI
- Ollama (local)
- And 70+ more...

## Tools and Permissions

[Tool configuration documentation...]

## Agent Configuration

[Agent configuration documentation...]

## MCP Integration

[MCP server configuration...]

## Comparison with Other Agentic Providers

| Feature               | OpenCode SDK     | Claude Agent SDK | Codex SDK         |
| --------------------- | ---------------- | ---------------- | ----------------- |
| Provider flexibility  | 75+ providers    | Anthropic only   | OpenAI only       |
| Architecture          | Client-server    | Direct API       | Thread-based      |
| Tool ecosystem        | Native + MCP     | Native + MCP     | Native            |
| Local models          | ✅ (Ollama, etc) | ❌               | ❌                |
| Working dir isolation | ✅               | ✅               | ✅ (Git required) |

## Examples

- [Basic usage](examples/opencode-sdk/basic)
- [Multi-provider comparison](examples/opencode-sdk/multi-provider)
- [Agent configuration](examples/opencode-sdk/agents)

````

#### 3.2 Update Existing Docs

**Files to update:**
- `site/docs/providers/index.md` - Add to provider list
- `site/docs/guides/evaluate-coding-agents.md` - Add OpenCode examples

---

### Phase 4: Examples

#### 4.1 Basic Example

**Directory:** `examples/opencode-sdk/basic/`

```yaml
# promptfooconfig.yaml
description: Basic OpenCode SDK usage
providers:
  - opencode:sdk
prompts:
  - 'Write a TypeScript function that validates email addresses'
tests:
  - assert:
      - type: contains
        value: 'function'
      - type: contains
        value: 'email'
````

#### 4.2 Multi-Provider Comparison

**Directory:** `examples/opencode-sdk/multi-provider/`

```yaml
# promptfooconfig.yaml
description: Compare providers through OpenCode
providers:
  - id: opencode:sdk
    label: claude-via-opencode
    config:
      provider_id: anthropic
      model: claude-sonnet-4-20250514
  - id: opencode:sdk
    label: gpt4o-via-opencode
    config:
      provider_id: openai
      model: gpt-4o
  - id: opencode:sdk
    label: gemini-via-opencode
    config:
      provider_id: google
      model: gemini-2.5-pro
```

#### 4.3 Agent Configuration Example

**Directory:** `examples/opencode-sdk/agents/`

```yaml
# promptfooconfig.yaml
description: Custom agents with OpenCode
providers:
  - id: opencode:sdk
    label: code-reviewer
    config:
      working_dir: ./test-codebase
      custom_agent:
        description: Reviews code for security issues
        tools:
          read: true
          grep: true
          write: false
          bash: false
        prompt: |
          You are a security-focused code reviewer.
          Analyze code for vulnerabilities and report findings.
```

#### 4.4 Update Agentic SDK Comparison

**File:** `examples/agentic-sdk-comparison/promptfooconfig.yaml`

Add OpenCode provider:

```yaml
providers:
  # ... existing providers ...

  # OpenCode SDK with multiple providers
  - id: opencode:sdk
    label: opencode-claude
    config:
      provider_id: anthropic
      model: claude-sonnet-4-20250514
      working_dir: examples/agentic-sdk-comparison/test-codebase
```

---

### Phase 5: QA Checklist

#### 5.1 Functional Testing

- [ ] Provider initialization with default config
- [ ] Provider initialization with custom config
- [ ] Session creation and cleanup
- [ ] Session resumption
- [ ] Tool execution (read, grep, glob, list)
- [ ] Tool permissions (ask, allow, deny)
- [ ] Multiple provider backends (anthropic, openai, etc.)
- [ ] Streaming responses
- [ ] Abort signal handling
- [ ] Error handling (connection, timeout, auth)
- [ ] Caching behavior
- [ ] Working directory validation

#### 5.2 Edge Cases

- [ ] Empty prompt
- [ ] Very long prompt
- [ ] Non-existent working directory
- [ ] Permission denied on working directory
- [ ] Server not running
- [ ] Server crash during request
- [ ] Network timeout
- [ ] Rate limiting
- [ ] Invalid model name
- [ ] Invalid provider name

#### 5.3 Documentation QA

- [ ] All config options documented
- [ ] Examples work as documented
- [ ] Links are valid
- [ ] Code samples are correct
- [ ] Comparison table is accurate

#### 5.4 Integration QA

- [ ] Works with `promptfoo eval`
- [ ] Works with `promptfoo view`
- [ ] Appears correctly in UI
- [ ] Metrics display correctly
- [ ] Cost tracking works

---

## Implementation Order

### Week 1: Core Implementation

1. Create `src/providers/opencode-sdk.ts` with basic structure
2. Implement `loadOpenCodeSDK()` for ESM loading
3. Implement `OpenCodeSDKProvider` class with `callApi()`
4. Add provider registration in `src/providers/index.ts`
5. Write basic unit tests

### Week 2: Features & Testing

1. Implement tool configuration
2. Implement session management
3. Implement caching
4. Add streaming support
5. Write comprehensive unit tests
6. Write integration tests

### Week 3: Documentation & Examples

1. Write provider documentation
2. Create basic example
3. Create multi-provider example
4. Create agent configuration example
5. Update agentic-sdk-comparison example
6. Update existing docs (provider list, guides)

### Week 4: QA & Polish

1. Run full QA checklist
2. Fix any issues found
3. Performance testing
4. Review and refine documentation
5. Final code review
6. Create PR

---

## Open Questions

1. **Server lifecycle**: Should we start/stop the OpenCode server per eval, or require users to run it separately?
   - Recommendation: Support both - auto-start by default, but allow connecting to existing server via `baseUrl`

2. **Default model**: What should be the default model when none specified?
   - Recommendation: Require explicit model specification to avoid confusion

3. **Provider auth**: How to handle auth for different providers?
   - Recommendation: Use environment variables following OpenCode conventions (e.g., `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`)

4. **Pricing/cost tracking**: How to calculate costs across 75+ providers?
   - Recommendation: Start with major providers (Anthropic, OpenAI), add others incrementally

---

## References

- [OpenCode Documentation](https://opencode.ai/docs/)
- [OpenCode SDK](https://opencode.ai/docs/sdk/)
- [OpenCode GitHub](https://github.com/sst/opencode)
- [SDK GitHub](https://github.com/sst/opencode-sdk-js)
- [npm package](https://www.npmjs.com/package/@opencode-ai/sdk)
- Existing providers:
  - `src/providers/claude-agent-sdk.ts`
  - `src/providers/openai/codex-sdk.ts`
  - `site/docs/providers/claude-agent-sdk.md`
  - `site/docs/providers/openai-codex-sdk.md`
