# OpenHands Provider Integration Plan

## Executive Summary

This document outlines the plan to integrate [OpenHands](https://github.com/OpenHands/OpenHands) as a coding agent provider in promptfoo. OpenHands is an open-source AI-driven development platform with state-of-the-art performance on coding benchmarks (72.8% on SWE-Bench Verified with Claude Sonnet 4.5).

**Key differentiators from existing providers:**
- **100+ LLM providers** via LiteLLM (vs. single-provider lock-in)
- **Python-native SDK** with REST/WebSocket API
- **Built-in security analysis** for agent actions
- **Context compression** for unlimited conversations
- **Docker sandboxing** for isolated execution

---

## Architecture Overview

### OpenHands Components

```
┌─────────────────────────────────────────────────────────────┐
│                    OpenHands Architecture                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │ openhands.sdk │    │openhands.tools│   │  workspace   │  │
│  │              │    │              │    │              │  │
│  │ - Agent      │    │ - Terminal   │    │ - Local      │  │
│  │ - Conversation│   │ - FileEditor │    │ - Docker     │  │
│  │ - LLM        │    │ - TaskTracker│    │ - Remote     │  │
│  │ - Tool       │    │ - Browser    │    │              │  │
│  │ - MCP        │    │              │    │              │  │
│  └──────────────┘    └──────────────┘    └──────────────┘  │
│           │                   │                   │         │
│           └───────────────────┼───────────────────┘         │
│                               ▼                              │
│                    ┌──────────────────┐                     │
│                    │ openhands.agent  │                     │
│                    │     _server      │                     │
│                    │                  │                     │
│                    │ REST + WebSocket │                     │
│                    │      APIs        │                     │
│                    └────────┬─────────┘                     │
│                             │                               │
└─────────────────────────────┼───────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │    promptfoo     │
                    │ OpenHandsProvider│
                    └──────────────────┘
```

### Integration Approach: REST API Client

**Rationale:** OpenHands provides a Python SDK, but promptfoo is TypeScript. Rather than embedding Python or using complex IPC, we'll use OpenHands' Agent Server REST/WebSocket API, which:

1. Matches the client-server pattern used by OpenCode SDK
2. Provides structured JSON responses
3. Supports real-time event streaming
4. Enables session management
5. Works with Docker sandboxing

**Alternative considered:** Headless mode via subprocess (`python -m openhands.core.main -t "prompt"`). Rejected because:
- Limited control over execution
- No streaming support
- Harder to extract structured metrics

---

## Provider Interface Design

### Provider ID Patterns

```yaml
# Primary IDs
openhands:sdk                    # Uses OpenHands Agent Server REST API
openhands                        # Alias for openhands:sdk

# With explicit model
openhands:sdk:claude-sonnet-4-5  # Specific model override
```

### Configuration Schema

```typescript
interface OpenHandsConfig {
  // === Connection ===
  apiKey?: string;                    // API key for the underlying LLM provider
  baseUrl?: string;                   // URL for existing OpenHands server (default: auto-start)
  hostname?: string;                  // Server hostname when starting (default: 127.0.0.1)
  port?: number;                      // Server port when starting (default: auto-select)
  timeout?: number;                   // Server startup timeout in ms (default: 60000)

  // === LLM Configuration ===
  provider_id?: string;               // LLM provider: anthropic, openai, google, ollama, etc.
  model?: string;                     // Model ID (e.g., claude-sonnet-4-5-20250929)

  // === Workspace ===
  working_dir?: string;               // Directory for file operations (default: temp dir)
  workspace_type?: 'local' | 'docker' | 'remote';  // Execution environment (default: local)
  docker_image?: string;              // Docker image for sandboxed execution

  // === Tools ===
  tools?: {
    terminal?: boolean;               // Enable bash/shell execution (default: false without working_dir)
    file_editor?: boolean;            // Enable file editing (default: read-only with working_dir)
    task_tracker?: boolean;           // Enable task tracking (default: true)
    browser?: boolean;                // Enable web browsing (default: false)
  };

  // === Agent Configuration ===
  max_iterations?: number;            // Maximum agent iterations (default: 50)
  max_budget_usd?: number;            // Cost budget limit in USD
  skills?: string[];                  // Skills/microagents to load
  system_prompt?: string;             // Custom system prompt override
  append_system_prompt?: string;      // Append to default system prompt

  // === Session Management ===
  session_id?: string;                // Resume existing session
  persist_sessions?: boolean;         // Keep sessions between calls (default: false)

  // === Security ===
  security_analyzer?: boolean;        // Enable LLM-based security analysis (default: true)
  confirmation_policy?: 'none' | 'risky' | 'all';  // Action confirmation (default: none for evals)

  // === MCP Integration ===
  mcp?: MCPConfig;                    // MCP server configuration (reuse existing type)

  // === Advanced ===
  condenser?: boolean;                // Enable context compression (default: true)
  log_events?: boolean;               // Include events in response metadata
  enable_streaming?: boolean;         // Enable event streaming (default: false)
}
```

### Response Structure

```typescript
interface ProviderResponse {
  output: string;                     // Final agent response text
  tokenUsage?: {
    prompt: number;                   // Input tokens
    completion: number;               // Output tokens
    total: number;                    // Total tokens
  };
  cost?: number;                      // Cost in USD (from OpenHands metrics)
  sessionId?: string;                 // Session ID for resumption
  raw?: string;                       // Full JSON response
  metadata?: {
    events?: OpenHandsEvent[];        // All events if log_events enabled
    iterations?: number;              // Number of agent iterations
    tools_used?: string[];            // Tools invoked during execution
    condensed?: boolean;              // Whether context was compressed
  };
  error?: string;                     // Error message if failed
}
```

---

## Implementation Plan

### Phase 1: Core Provider Implementation

**File:** `src/providers/openhands-sdk.ts`

#### 1.1 Server Lifecycle Management

```typescript
class OpenHandsServer {
  private process?: ChildProcess;
  private baseUrl: string;

  async start(config: { hostname: string; port: number }): Promise<void> {
    // Start: python -m openhands.agent_server --host <hostname> --port <port>
    // Health check: GET /health until ready
  }

  async stop(): Promise<void> {
    // Graceful shutdown with SIGTERM, then SIGKILL
  }
}
```

**Key considerations:**
- Use `execa` or `child_process.spawn` for subprocess management
- Implement health check polling with configurable timeout
- Handle port conflicts with automatic port selection
- Clean up server on process exit (use `exitHook`)

#### 1.2 REST API Client

```typescript
class OpenHandsClient {
  constructor(private baseUrl: string) {}

  // Conversation endpoints
  async createConversation(config: ConversationConfig): Promise<ConversationResponse>;
  async sendMessage(conversationId: string, message: string): Promise<void>;
  async getState(conversationId: string): Promise<ConversationState>;
  async deleteConversation(conversationId: string): Promise<void>;

  // Workspace endpoints
  async executeCommand(command: string): Promise<CommandResult>;
  async readFile(path: string): Promise<string>;
  async writeFile(path: string, content: string): Promise<void>;
}
```

**REST Endpoints (based on SDK docs):**
- `POST /conversations` - Create conversation
- `GET /conversations/{id}` - Get conversation state
- `DELETE /conversations/{id}` - Delete conversation
- `POST /conversations/{id}/messages` - Send message
- `GET /health` - Health check

#### 1.3 WebSocket Event Streaming

```typescript
class OpenHandsEventStream {
  private ws: WebSocket;

  connect(conversationId: string): void;
  onEvent(callback: (event: OpenHandsEvent) => void): void;
  waitForCompletion(): Promise<ConversationResult>;
}
```

**Event types to handle:**
- `message` - Agent/user messages
- `action` - Tool invocations
- `observation` - Tool results
- `error` - Error events
- `state_change` - Conversation state changes

#### 1.4 Provider Class

```typescript
export class OpenHandsSDKProvider implements ApiProvider {
  private server?: OpenHandsServer;
  private client?: OpenHandsClient;
  private sessions: Map<string, string> = new Map();

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams
  ): Promise<ProviderResponse> {
    // 1. Initialize server if needed
    // 2. Create or resume conversation
    // 3. Send message and wait for completion
    // 4. Extract response and metrics
    // 5. Cache if enabled
    // 6. Return structured response
  }

  async cleanup(): Promise<void> {
    // Close all sessions
    // Stop server if we started it
  }
}
```

### Phase 2: Tool Configuration

#### 2.1 Default Tool Sets

```typescript
// No working_dir: chat-only mode
const NO_TOOLS = {
  terminal: false,
  file_editor: false,
  task_tracker: false,
  browser: false,
};

// With working_dir: read-only by default
const READ_ONLY_TOOLS = {
  terminal: false,         // No shell access
  file_editor: 'read',     // Read-only file access
  task_tracker: true,      // Planning/tracking
  browser: false,
};

// Full access (user must opt-in)
const FULL_TOOLS = {
  terminal: true,
  file_editor: true,
  task_tracker: true,
  browser: true,
};
```

#### 2.2 Security Defaults

```typescript
const EVAL_SECURITY_DEFAULTS = {
  security_analyzer: true,           // Analyze actions for safety
  confirmation_policy: 'none',       // Don't pause for confirmation in evals
  max_iterations: 50,                // Prevent infinite loops
  max_budget_usd: 10.0,              // Cost cap
};
```

### Phase 3: Caching Integration

Reuse `agentic-utils.ts` for consistent caching:

```typescript
const cacheResult = await initializeAgenticCache(
  {
    cacheKeyPrefix: 'openhands:sdk',
    workingDir: config.working_dir,
    bustCache: context?.bustCache,
  },
  {
    prompt,
    cacheKeyQueryOptions: {
      model: config.model,
      provider_id: config.provider_id,
      tools: config.tools,
      // ... other cache-relevant options
    },
  },
);
```

### Phase 4: Testing

**File:** `test/providers/openhands-sdk.test.ts`

#### Test Categories

1. **Unit Tests (mocked)**
   - Constructor/initialization
   - API key resolution
   - Config validation
   - Response parsing
   - Error handling

2. **Integration Tests (if OpenHands available)**
   - Server lifecycle
   - Basic conversation flow
   - Tool execution
   - Session persistence

#### Mock Structure

```typescript
// Mock the REST client
vi.mock('./openhands-client', () => ({
  OpenHandsClient: vi.fn().mockImplementation(() => ({
    createConversation: vi.fn(),
    sendMessage: vi.fn(),
    getState: vi.fn(),
  })),
}));

// Mock server startup
vi.mock('child_process', () => ({
  spawn: vi.fn().mockReturnValue({
    on: vi.fn(),
    kill: vi.fn(),
  }),
}));
```

### Phase 5: Documentation & Examples

#### 5.1 Documentation

**File:** `site/docs/providers/openhands-sdk.md`

Structure:
- Overview & key features
- Installation (Python + openhands-ai package)
- Quick start examples
- Configuration reference
- Tools & permissions
- Session management
- MCP integration
- Comparison with other agentic providers
- Troubleshooting

#### 5.2 Examples

**Directory:** `examples/openhands-sdk/`

```
examples/openhands-sdk/
├── README.md
├── basic/
│   └── promptfooconfig.yaml      # Chat-only mode
├── code-review/
│   └── promptfooconfig.yaml      # Read-only file analysis
└── full-agent/
    └── promptfooconfig.yaml      # Full tool access
```

---

## Technical Challenges & Solutions

### Challenge 1: Python Dependency

**Problem:** OpenHands is Python-only; promptfoo is TypeScript.

**Solution:** Use REST API approach. The Agent Server exposes all functionality via HTTP/WebSocket, eliminating need for Python IPC.

**Fallback:** If REST API proves insufficient, consider:
- Headless mode subprocess for simple cases
- `python-shell` npm package for direct SDK calls

### Challenge 2: Server Startup Time

**Problem:** OpenHands server may take 10-30 seconds to start.

**Solutions:**
1. **Server pooling**: Keep server running between calls when `persist_sessions: true`
2. **Health check polling**: Poll `/health` endpoint with exponential backoff
3. **Pre-warm option**: `baseUrl` config to connect to existing server
4. **Timeout configuration**: Configurable startup timeout (default: 60s)

### Challenge 3: Docker Sandbox Overhead

**Problem:** Docker workspace adds ~5-10s startup per conversation.

**Solutions:**
1. **Default to local**: Use `LocalWorkspace` by default
2. **Explicit opt-in**: Require `workspace_type: docker` for sandboxing
3. **Image pre-pulling**: Document image pre-pull for faster startup
4. **Container reuse**: Investigate session-based container reuse

### Challenge 4: Event Streaming vs Polling

**Problem:** Need to track progress for long-running agent tasks.

**Solution:** Implement both modes:
```typescript
if (config.enable_streaming) {
  // WebSocket event stream
  return await this.runWithStreaming(conversation);
} else {
  // Poll conversation state
  return await this.runWithPolling(conversation);
}
```

### Challenge 5: Token/Cost Tracking

**Problem:** Need accurate token usage and cost for eval metrics.

**Solution:** OpenHands tracks metrics in `conversation.conversation_stats`:
```python
cost = conversation.conversation_stats.get_combined_metrics().accumulated_cost
```

Extract via REST API and include in response.

---

## Dependencies

### Required Python Packages

```bash
# User must install
pip install openhands-ai
# or
uvx openhands-ai
```

### promptfoo Dependencies

No new npm dependencies required. Uses existing:
- `node:child_process` - Server subprocess
- `node:http` / `fetch` - REST API calls
- `ws` (if not already) - WebSocket for streaming

### Optional Dependencies

```bash
# For Docker sandboxing
docker pull docker.openhands.dev/openhands/runtime:latest
```

---

## Registry Integration

**File:** `src/providers/registry.ts`

```typescript
// Add to provider loading
case 'openhands':
case 'openhands:sdk':
  return import('./openhands-sdk').then(m => new m.OpenHandsSDKProvider(options));
```

---

## Comparison Table Update

Update `agentic-sdk-comparison` example and docs:

| Feature | OpenHands SDK | Claude Agent SDK | OpenCode SDK | Codex SDK |
|---------|--------------|------------------|--------------|-----------|
| LLM Providers | 100+ (LiteLLM) | Anthropic only | 75+ | OpenAI only |
| Architecture | REST/WebSocket | Direct SDK | Client-server | Thread-based |
| Local Models | Ollama, etc. | No | Ollama, etc. | No |
| Docker Sandbox | Built-in | No | No | Git required |
| Security Analysis | LLM-based | Permission modes | Permissions | No |
| Context Compression | Built-in | No | No | No |
| Benchmarks | SWE-Bench 72.8% | Unknown | Unknown | Unknown |

---

## Timeline Estimate

| Phase | Tasks | Dependencies |
|-------|-------|--------------|
| 1 | Core provider, server lifecycle, REST client | None |
| 2 | Tool configuration, security defaults | Phase 1 |
| 3 | Caching integration | Phase 1 |
| 4 | Testing (unit + integration) | Phases 1-3 |
| 5 | Documentation & examples | Phase 4 |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenHands API changes | High | Pin to stable version, add version checks |
| Python not installed | Medium | Clear error messages, installation docs |
| Server startup failures | Medium | Retry logic, detailed error logging |
| Docker not available | Low | Fallback to local workspace with warning |
| Cost overruns in evals | Medium | Default budget cap, clear docs |

---

## Open Questions

1. **Should we support headless mode as fallback?**
   - Pro: Simpler for basic use cases
   - Con: Two code paths to maintain

2. **WebSocket vs polling default?**
   - WebSocket: Better UX, real-time progress
   - Polling: Simpler, more reliable

3. **Should we bundle OpenHands or require user install?**
   - Bundle: Better UX
   - User install: Smaller package, user controls version

4. **MCP integration priority?**
   - OpenHands has native MCP support
   - Could share MCP config format with other providers

---

---

# Part 2: Code Reuse & Documentation Strategy

This section outlines a broader refactoring to establish shared patterns across all coding agent providers.

## Current State Analysis

### Existing Coding Agent Providers

| Provider | File | SDK Type | Architecture |
|----------|------|----------|--------------|
| Claude Agent SDK | `claude-agent-sdk.ts` | TypeScript | Direct SDK |
| OpenAI Codex SDK | `openai/codex-sdk.ts` | TypeScript | Thread-based |
| OpenCode SDK | `opencode-sdk.ts` | TypeScript | Client-server |
| OpenHands SDK | `openhands-sdk.ts` (planned) | Python REST | Client-server |

### Identified Duplication

**Code Patterns (repeated in each provider):**
1. Working directory validation & temp directory creation
2. API key resolution (config > env overrides > process.env)
3. Caching with working directory fingerprinting
4. Abort signal handling
5. Server lifecycle management (start/stop/health)
6. Response structure normalization
7. Session/thread management
8. MCP configuration transformation

**Documentation Patterns (repeated in each doc):**
1. Installation & setup sections
2. Working directory explanation
3. Tools & permissions tables
4. Caching behavior section
5. Managing side effects section
6. Session management section
7. Comparison tables (incomplete/scattered)
8. Examples linking

---

## Proposed Code Architecture

### Directory Structure

```
src/providers/
├── agentic/
│   ├── index.ts                    # Re-exports all coding agent providers
│   ├── base.ts                     # AgenticProviderBase abstract class
│   ├── types.ts                    # Shared types for all coding agents
│   ├── utils.ts                    # Shared utilities (rename agentic-utils.ts)
│   ├── server-lifecycle.ts         # Server start/stop/health utilities
│   ├── claude-agent-sdk.ts         # Claude Agent SDK (moved)
│   ├── codex-sdk.ts                # OpenAI Codex SDK (moved)
│   ├── opencode-sdk.ts             # OpenCode SDK (moved)
│   └── openhands-sdk.ts            # OpenHands SDK (new)
├── registry.ts                     # Updated to import from agentic/
└── ...
```

### Shared Types (`agentic/types.ts`)

```typescript
/**
 * Common configuration interface for all coding agent providers
 */
export interface AgenticProviderBaseConfig {
  // === Connection ===
  apiKey?: string;
  baseUrl?: string;                    // Connect to existing server

  // === Workspace ===
  working_dir?: string;                // Directory for file operations
  additional_directories?: string[];   // Extra accessible directories

  // === LLM Configuration ===
  model?: string;
  fallback_model?: string;

  // === Limits ===
  max_iterations?: number;             // Max agent iterations
  max_budget_usd?: number;             // Cost budget cap
  timeout?: number;                    // Operation timeout (ms)

  // === Session Management ===
  session_id?: string;                 // Resume existing session
  persist_sessions?: boolean;          // Keep sessions between calls

  // === System Prompt ===
  system_prompt?: string;              // Replace default
  append_system_prompt?: string;       // Append to default

  // === MCP ===
  mcp?: MCPConfig;
}

/**
 * Common tool configuration patterns
 */
export interface AgenticToolConfig {
  read?: boolean;       // Read files
  write?: boolean;      // Write files
  edit?: boolean;       // Edit files
  bash?: boolean;       // Execute shell commands
  search?: boolean;     // Search/grep files
  glob?: boolean;       // Find files by pattern
  list?: boolean;       // List directories
  browser?: boolean;    // Web browsing
}

/**
 * Normalized response for all coding agent providers
 */
export interface AgenticProviderResponse extends ProviderResponse {
  sessionId?: string;                  // Session ID for resumption
  metadata?: {
    iterations?: number;               // Agent iterations used
    tools_used?: string[];             // Tools invoked
    events?: unknown[];                // Raw events (if enabled)
    structured_output?: unknown;       // Structured output (if schema)
  };
}

/**
 * Server configuration for client-server providers
 */
export interface AgenticServerConfig {
  hostname?: string;                   // Server hostname (default: 127.0.0.1)
  port?: number;                       // Server port (default: auto)
  startupTimeout?: number;             // Startup timeout (ms)
  healthEndpoint?: string;             // Health check endpoint
}
```

### Base Class (`agentic/base.ts`)

```typescript
import type { ApiProvider, CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../../types';
import type { AgenticProviderBaseConfig, AgenticToolConfig } from './types';

/**
 * Abstract base class for all coding agent providers.
 * Provides shared functionality for caching, workspace handling, and response normalization.
 */
export abstract class AgenticProviderBase implements ApiProvider {
  protected config: AgenticProviderBaseConfig;
  protected sessions: Map<string, string> = new Map();

  constructor(
    protected providerId: string,
    options: { config?: AgenticProviderBaseConfig; env?: EnvOverrides }
  ) {
    this.config = options.config ?? {};
  }

  id(): string {
    return this.providerId;
  }

  // === Abstract methods (provider-specific) ===

  abstract callApiInternal(
    prompt: string,
    config: AgenticProviderBaseConfig,
    callOptions?: CallApiOptionsParams
  ): Promise<ProviderResponse>;

  abstract getApiKey(): string | undefined;

  abstract getDefaultTools(hasWorkingDir: boolean): AgenticToolConfig;

  // === Shared implementations ===

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callOptions?: CallApiOptionsParams
  ): Promise<ProviderResponse> {
    // 1. Merge configs (prompt config overrides provider config)
    const mergedConfig = this.mergeConfigs(context?.prompt?.config);

    // 2. Validate working directory
    const workingDir = await this.resolveWorkingDir(mergedConfig);

    // 3. Check abort signal
    if (callOptions?.abortSignal?.aborted) {
      return { error: `${this.providerId} call aborted before it started` };
    }

    // 4. Check cache
    const cacheResult = await this.initializeCache(mergedConfig, prompt, context?.bustCache);
    const cachedResponse = await this.getCachedResponse(cacheResult);
    if (cachedResponse) return cachedResponse;

    // 5. Call provider-specific implementation
    try {
      const response = await this.callApiInternal(prompt, { ...mergedConfig, working_dir: workingDir }, callOptions);

      // 6. Cache successful responses
      if (!response.error) {
        await this.cacheResponse(cacheResult, response);
      }

      return response;
    } finally {
      // 7. Cleanup temp directory if created
      await this.cleanupTempDir(workingDir, mergedConfig.working_dir);
    }
  }

  // === Shared utility methods ===

  protected mergeConfigs(promptConfig?: Record<string, unknown>): AgenticProviderBaseConfig {
    return { ...this.config, ...promptConfig };
  }

  protected async resolveWorkingDir(config: AgenticProviderBaseConfig): Promise<string> {
    if (config.working_dir) {
      return validateWorkingDirectory(config.working_dir);
    }
    return createTempDirectory(`promptfoo-${this.providerId}-`);
  }

  protected async initializeCache(
    config: AgenticProviderBaseConfig,
    prompt: string,
    bustCache?: boolean
  ) {
    return initializeAgenticCache(
      { cacheKeyPrefix: this.providerId, workingDir: config.working_dir, bustCache },
      { prompt, cacheKeyQueryOptions: this.getCacheKeyOptions(config) }
    );
  }

  protected abstract getCacheKeyOptions(config: AgenticProviderBaseConfig): Record<string, unknown>;

  // ... more shared methods
}
```

### Shared Utilities (`agentic/utils.ts`)

Expand existing `agentic-utils.ts`:

```typescript
// === Working Directory Utilities ===

export async function validateWorkingDirectory(workingDir: string): Promise<string> {
  const resolved = path.isAbsolute(workingDir)
    ? workingDir
    : path.resolve(process.cwd(), workingDir);

  const stats = await fs.promises.stat(resolved).catch(err => {
    throw new Error(`Working directory ${workingDir} does not exist or isn't accessible: ${err.message}`);
  });

  if (!stats.isDirectory()) {
    throw new Error(`Working directory ${workingDir} is not a directory`);
  }

  return resolved;
}

export function createTempDirectory(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function cleanupTempDirectory(tempDir: string, originalWorkingDir?: string): void {
  if (!originalWorkingDir && tempDir.startsWith(os.tmpdir())) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// === Server Lifecycle Utilities ===

export interface ManagedServer {
  process: ChildProcess;
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startManagedServer(options: {
  command: string;
  args: string[];
  healthEndpoint: string;
  startupTimeout: number;
  env?: Record<string, string>;
}): Promise<ManagedServer> {
  const { command, args, healthEndpoint, startupTimeout, env } = options;

  const process = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait for health endpoint
  const startTime = Date.now();
  while (Date.now() - startTime < startupTimeout) {
    try {
      const response = await fetch(healthEndpoint);
      if (response.ok) {
        return {
          process,
          baseUrl: new URL(healthEndpoint).origin,
          close: async () => {
            process.kill('SIGTERM');
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (!process.killed) process.kill('SIGKILL');
          },
        };
      }
    } catch {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  process.kill('SIGKILL');
  throw new Error(`Server failed to start within ${startupTimeout}ms`);
}

// === API Key Resolution ===

export function resolveApiKey(options: {
  configKey?: string;
  envOverrides?: EnvOverrides;
  envVars: string[];
}): string | undefined {
  if (options.configKey) return options.configKey;

  for (const envVar of options.envVars) {
    const value = options.envOverrides?.[envVar as keyof EnvOverrides] ?? getEnvString(envVar);
    if (value) return value;
  }

  return undefined;
}

// === Abort Signal Handling ===

export function createAbortHandler(
  externalSignal: AbortSignal | undefined,
  internalController: AbortController
): () => void {
  if (!externalSignal) return () => {};

  const handler = () => internalController.abort(externalSignal.reason);
  externalSignal.addEventListener('abort', handler);

  return () => externalSignal.removeEventListener('abort', handler);
}

// === Existing cache utilities ===
export { initializeAgenticCache, getCachedResponse, cacheResponse, getWorkingDirFingerprint };
```

### Server Lifecycle (`agentic/server-lifecycle.ts`)

```typescript
import { spawn, ChildProcess } from 'child_process';
import logger from '../../logger';

export interface ServerConfig {
  command: string;
  args: string[];
  healthEndpoint: string;
  startupTimeout: number;
  env?: Record<string, string>;
  cwd?: string;
}

export interface ManagedServer {
  process: ChildProcess;
  baseUrl: string;
  close: () => Promise<void>;
}

/**
 * Start a managed server process with health checking
 */
export async function startServer(config: ServerConfig): Promise<ManagedServer> {
  logger.debug(`Starting server: ${config.command} ${config.args.join(' ')}`);

  const proc = spawn(config.command, config.args, {
    env: { ...process.env, ...config.env },
    cwd: config.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Capture logs
  proc.stdout?.on('data', data => logger.debug(`[server stdout] ${data}`));
  proc.stderr?.on('data', data => logger.debug(`[server stderr] ${data}`));

  // Wait for health
  const baseUrl = await waitForHealth(config.healthEndpoint, config.startupTimeout);

  return {
    process: proc,
    baseUrl,
    close: () => gracefulShutdown(proc),
  };
}

async function waitForHealth(endpoint: string, timeout: number): Promise<string> {
  const start = Date.now();
  const pollInterval = 500;

  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(endpoint);
      if (res.ok) {
        logger.debug(`Server healthy at ${endpoint}`);
        return new URL(endpoint).origin;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise(r => setTimeout(r, pollInterval));
  }

  throw new Error(`Server failed to become healthy at ${endpoint} within ${timeout}ms`);
}

async function gracefulShutdown(proc: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    const forceKillTimeout = setTimeout(() => {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
      resolve();
    }, 5000);

    proc.on('exit', () => {
      clearTimeout(forceKillTimeout);
      resolve();
    });

    proc.kill('SIGTERM');
  });
}
```

---

## Documentation Strategy: Cross-References (Not Restructuring)

**Note:** Rather than creating a new `site/docs/providers/coding-agents/` directory structure, we will add cross-references between existing provider documentation and update the central guide.

### Already Updated

The **[Evaluate Coding Agents guide](/docs/guides/evaluate-coding-agents)** has been updated with:
- All three current coding agent providers (Claude Agent SDK, Codex SDK, OpenCode SDK)
- Comparison table covering LLM support, permissions, structured output, state management, safety, and ecosystem
- New example showcasing OpenCode SDK's multi-provider comparison capability
- "Choosing a provider" decision guide
- Comprehensive "See also" section with links to all provider docs and examples

### Cross-References to Add to Each Provider Doc

When OpenHands SDK is implemented, add this cross-reference pattern to each provider doc:

**Add to each provider doc's "See also" section:**

```markdown
## See also

### Other coding agent providers
- [Claude Agent SDK](/docs/providers/claude-agent-sdk) - Anthropic's agentic framework
- [OpenAI Codex SDK](/docs/providers/openai-codex-sdk) - OpenAI's thread-based agent
- [OpenCode SDK](/docs/providers/opencode-sdk) - Multi-provider agent (75+ LLMs)
- [OpenHands SDK](/docs/providers/openhands-sdk) - Docker sandbox, security analysis (100+ LLMs)

### Guides
- [Evaluate Coding Agents](/docs/guides/evaluate-coding-agents) - Comparison and best practices
```

### OpenHands Documentation (`openhands-sdk.md`)

Create as a standalone provider doc following existing patterns:

```markdown
---
title: OpenHands SDK
description: 'Evaluate coding agents with OpenHands - 100+ LLM providers, Docker sandboxing, and security analysis'
sidebar_label: OpenHands SDK
---

# OpenHands SDK

OpenHands is an open-source AI coding agent with state-of-the-art benchmark performance (72.8% on SWE-Bench Verified).

## Provider IDs

- `openhands:sdk` (full name)
- `openhands` (alias)

## Key Features

- **100+ LLM providers** via LiteLLM (Anthropic, OpenAI, Google, Ollama, etc.)
- **Docker sandboxing** for isolated code execution
- **LLM-based security analysis** for automated action review
- **Context compression** for unlimited conversation length

## Quick comparison with other agents

| Feature | OpenHands SDK | Claude Agent SDK | Codex SDK | OpenCode SDK |
|---------|---------------|------------------|-----------|--------------|
| LLM providers | 100+ | Anthropic only | OpenAI only | 75+ |
| Local models | ✅ Ollama | ❌ | ❌ | ✅ Ollama |
| Docker sandbox | ✅ Built-in | ❌ | ❌ | ❌ |
| Structured output | ❌ | ✅ | ✅ | ❌ |

→ See [Evaluate Coding Agents](/docs/guides/evaluate-coding-agents) for detailed comparison

## Installation

[Installation steps...]

## Quick Start

[Basic examples...]

## Configuration Reference

[Full configuration options...]

## See also

### Other coding agent providers
- [Claude Agent SDK](/docs/providers/claude-agent-sdk)
- [OpenAI Codex SDK](/docs/providers/openai-codex-sdk)
- [OpenCode SDK](/docs/providers/opencode-sdk)

### Guides
- [Evaluate Coding Agents](/docs/guides/evaluate-coding-agents) - Comparison and best practices
- [Sandboxed code evals](/docs/guides/sandboxed-code-evals)

### External resources
- [OpenHands Documentation](https://docs.openhands.dev)
- [OpenHands GitHub](https://github.com/OpenHands/OpenHands)
```

### Summary of Documentation Approach

1. **Central hub**: `site/docs/guides/evaluate-coding-agents.md` serves as the comparison and decision guide
2. **Individual docs**: Each provider has its own doc with provider-specific details
3. **Cross-references**: Each provider doc links to other providers and the central guide
4. **No restructuring**: Keep existing URL structure; don't create `coding-agents/` subdirectory

---

## Migration Plan

### Phase 1: Shared Utilities (Non-Breaking)

1. Create `src/providers/agentic/` directory
2. Move `agentic-utils.ts` → `agentic/utils.ts`
3. Add new utilities (`server-lifecycle.ts`, `types.ts`)
4. Update imports in existing providers (no behavior change)

### Phase 2: Base Class (Non-Breaking)

1. Create `AgenticProviderBase` abstract class
2. Refactor providers one-by-one to extend base
3. Ensure backward compatibility with existing configs

### Phase 3: Documentation Cross-References (COMPLETED ✅)

✅ Updated `site/docs/guides/evaluate-coding-agents.md`:
- Added OpenCode SDK alongside Claude Agent SDK and Codex SDK
- Updated capability tiers table with all three providers
- Updated comparison table (LLM providers, permissions, structured output, state, safety, ecosystem)
- Added new "Cross-provider comparison with OpenCode SDK" example
- Added "Choosing a provider" decision guide
- Expanded "See also" with all provider docs, examples, and related guides

✅ Updated `site/docs/providers/claude-agent-sdk.md`:
- Added "Other coding agent providers" section with links to Codex SDK and OpenCode SDK
- Added "Guides" section linking to the central Evaluate Coding Agents guide

✅ Updated `site/docs/providers/openai-codex-sdk.md`:
- Added "Other coding agent providers" section with links to Claude Agent SDK and OpenCode SDK
- Added "Guides" section linking to the central Evaluate Coding Agents guide

✅ Updated `site/docs/providers/opencode-sdk.md`:
- Reorganized "See Also" with consistent cross-references
- Added "Guides" section linking to the central Evaluate Coding Agents guide

### Phase 4: Add OpenHands Provider

1. Implement `openhands-sdk.ts` using shared utilities
2. Create documentation following existing patterns (standalone provider doc)
3. Add examples
4. Update `evaluate-coding-agents.md` to include OpenHands in comparisons

---

## Naming Conventions

### Provider IDs

```
<vendor>:<product>[-sdk]

Examples:
- anthropic:claude-agent-sdk
- openai:codex-sdk
- opencode:sdk
- openhands:sdk
```

### Config Properties

Use snake_case consistently across all providers:

```yaml
# Consistent naming
working_dir: ./src
additional_directories: [./tests]
persist_sessions: true
max_budget_usd: 10.0
system_prompt: "..."
append_system_prompt: "..."

# Tool configuration
tools:
  read: true
  write: false
  bash: false
```

### Response Properties

Use camelCase for response properties (TypeScript convention):

```typescript
{
  output: "...",
  tokenUsage: { prompt: 100, completion: 50 },
  sessionId: "abc123",
  cost: 0.05,
  metadata: {
    iterations: 5,
    toolsUsed: ["read", "write"],
  }
}
```

---

## References

- [OpenHands GitHub](https://github.com/OpenHands/OpenHands)
- [OpenHands SDK Documentation](https://docs.openhands.dev/sdk)
- [OpenHands Agent Server](https://docs.openhands.dev/sdk/guides/agent-server/local-server)
- [OpenHands SDK Paper](https://arxiv.org/html/2511.03690v1)
- [PyPI: openhands-ai](https://pypi.org/project/openhands-ai/)
- [OpenHands Headless Mode](https://docs.openhands.dev/usage/how-to/headless-mode)
