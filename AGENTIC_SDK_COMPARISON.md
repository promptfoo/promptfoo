# Agentic SDK Provider Comparison

Comprehensive comparison of OpenAI Codex SDK and Claude Agent SDK (Claude Code) provider implementations in promptfoo.

## Test Results: gpt-5.1-codex

Successfully tested OpenAI Codex SDK with `gpt-5.1-codex` model:

**Evaluation Results:**
- Pass Rate: **100%**
- Duration: **4 seconds**
- Token Usage: **5,363 tokens** (4,942 prompt + 131 completion + 290 grading)
- Generated working Python factorial function with error handling

**Generated Code:**
```python
def factorial(n: int) -> int:
    if n < 0:
        raise ValueError("factorial is undefined for negative numbers")
    result = 1
    for i in range(2, n + 1):
        result *= i
    return result
```

## Overview Comparison

| Feature | OpenAI Codex SDK | Claude Agent SDK |
|---------|-----------------|------------------|
| **Package** | `@openai/codex-sdk` | `@anthropic-ai/claude-agent-sdk` |
| **License** | Apache-2.0 (public) | Proprietary |
| **Provider ID** | `openai:codex-sdk` | `anthropic:claude-agent-sdk` |
| **Primary Use Case** | Code generation & analysis | Agentic coding with tool use |
| **File Path** | `src/providers/openai-codex-sdk.ts` | `src/providers/claude-agent-sdk.ts` |
| **Lines of Code** | 474 lines | 546 lines |

## Architecture Comparison

### Session Management

**OpenAI Codex SDK:**
- **Thread-based** with three modes:
  1. **Ephemeral (default)**: New thread per call, auto-cleanup
  2. **Persistent pooling**: Configurable thread pool with LRU eviction
  3. **Thread resumption**: Resume by ID from `~/.codex/sessions`
- Cache key based on: working_dir + model + output_schema + prompt
- Thread pool size: Configurable via `thread_pool_size` (default: 1)

```typescript
private async getOrCreateThread(config: OpenAICodexSDKConfig, cacheKey?: string): Promise<any> {
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

  // Use pooled thread with size limit
  if (config.persist_threads && cacheKey) {
    // Enforce pool size limit with LRU eviction
    const poolSize = config.thread_pool_size ?? 1;
    if (this.threads.size >= poolSize) {
      const oldestKey = this.threads.keys().next().value;
      if (oldestKey) this.threads.delete(oldestKey);
    }
  }

  // Create new thread
  const thread = this.codexInstance!.startThread({
    workingDirectory: config.working_dir,
    skipGitRepoCheck: config.skip_git_repo_check ?? false,
    ...(config.model ? { model: config.model } : {}),
  });

  if (config.persist_threads && cacheKey) {
    this.threads.set(cacheKey, thread);
  }

  return thread;
}
```

**Claude Agent SDK:**
- **Streaming query-based** with automatic session IDs
- No explicit thread management - SDK handles internally
- Each call gets unique session ID in response
- Relies on external caching layer for performance

```typescript
const res = await this.claudeCodeModule.query(queryParams);

for await (const msg of res) {
  if (msg.type == 'result') {
    const sessionId = msg.session_id;
    // ... process result
  }
}
```

### Caching Strategy

**OpenAI Codex SDK:**
- **In-memory thread pooling** for request-level reuse
- Cache key: `SHA256(working_dir + model + output_schema + prompt)`
- No disk-based caching
- Cleanup handled in `finally` block for ephemeral threads

**Claude Agent SDK:**
- **Disk-based caching** via promptfoo's cache layer
- Cache key: `SHA256(prompt + queryOptions + workingDirFingerprint)`
- Working directory fingerprinting: Recursive file mtime checksums (2s timeout)
- Supports cache busting via `context.bustCache`

```typescript
// Claude Agent SDK working directory fingerprinting
const getAllFiles = (dir: string, files: string[] = []): string[] => {
  if (Date.now() - startTime > FINGERPRINT_TIMEOUT_MS) {
    throw new Error('Working directory fingerprint timed out');
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      getAllFiles(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
};
```

### Working Directory Handling

**OpenAI Codex SDK:**
- **Git repository requirement** (safety feature)
- Validation: Checks `.git` directory exists
- Bypass: `skip_git_repo_check: true`
- User must provide directory - no temp dir fallback

```typescript
private validateWorkingDirectory(workingDir: string, skipGitCheck: boolean = false): void {
  const stats = fs.statSync(workingDir);
  if (!stats.isDirectory()) {
    throw new Error(`Working directory ${workingDir} is not a directory`);
  }

  if (!skipGitCheck) {
    const gitDir = path.join(workingDir, '.git');
    if (!fs.existsSync(gitDir)) {
      throw new Error(
        `Working directory ${workingDir} is not a Git repository.
        Codex requires a Git repository by default to prevent unrecoverable errors.
        To bypass this check, set skip_git_repo_check: true in your provider config.`
      );
    }
  }
}
```

**Claude Agent SDK:**
- **No Git requirement** - more flexible
- Automatic temp directory creation if not provided
- Two default modes:
  - **No working_dir**: Empty temp dir with no tools (plain chat mode)
  - **With working_dir**: User directory with read-only tools
- Automatic cleanup in `finally` block for temp dirs

```typescript
let isTempDir = false;
let workingDir: string | undefined;

if (config.working_dir) {
  workingDir = config.working_dir;
} else {
  isTempDir = true;
}

// ... later
if (workingDir) {
  // verify the working dir exists
  const stats = fs.statSync(workingDir);
  if (!stats.isDirectory()) {
    throw new Error(`Working dir ${config.working_dir} is not a directory`);
  }
} else if (isTempDir) {
  // use a temp dir
  workingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-claude-agent-sdk-'));
}

// ... finally
if (isTempDir && workingDir) {
  fs.rmSync(workingDir, { recursive: true, force: true });
}
```

### Tool Management

**OpenAI Codex SDK:**
- **No explicit tool configuration**
- SDK handles tools internally based on working directory
- No user-facing tool permissions
- Focus: Code generation and analysis

**Claude Agent SDK:**
- **Granular tool permissions** with multiple configuration options:
  - `custom_allowed_tools`: Full replacement
  - `append_allowed_tools`: Extend defaults
  - `allow_all_tools`: Enable all tools
  - `disallowed_tools`: Explicit blocklist (takes precedence)
- **Default read-only tools** when working_dir provided:
  - `Read`, `Grep`, `Glob`, `LS`
- **Permission modes**: `default`, `plan`, `acceptEdits`, `bypassPermissions`

```typescript
// De-dupe and sort allowed/disallowed tools for cache key consistency
const defaultAllowedTools = config.working_dir ? FS_READONLY_ALLOWED_TOOLS : [];

let allowedTools = config.allow_all_tools ? undefined : defaultAllowedTools;
if ('custom_allowed_tools' in config) {
  allowedTools = Array.from(new Set(config.custom_allowed_tools ?? [])).sort();
} else if (config.append_allowed_tools) {
  allowedTools = Array.from(
    new Set([...defaultAllowedTools, ...config.append_allowed_tools]),
  ).sort();
}

const disallowedTools = config.disallowed_tools
  ? Array.from(new Set(config.disallowed_tools)).sort()
  : undefined;
```

## Configuration Comparison

### Model Configuration

**OpenAI Codex SDK:**
```typescript
{
  model?: string;              // e.g., 'gpt-4o', 'gpt-5.1-codex'
  fallback_model?: string;     // Fallback if primary fails
  max_tokens?: number;
}
```

Known models: `gpt-4`, `gpt-4-turbo`, `gpt-4o`, `gpt-4o-mini`, `o1`, `o1-mini`, `o3-mini`

**Claude Agent SDK:**
```typescript
{
  model?: string;              // Full name or alias
  fallback_model?: string;
  max_turns?: number;          // Max conversation turns
  max_thinking_tokens?: number; // Extended thinking
}
```

Known models: All Anthropic models + aliases: `default`, `sonnet`, `opus`, `haiku`, `sonnet[1m]`, `opusplan`

### Output Schema Support

**OpenAI Codex SDK:**
- **Native JSON schema support**
- Zod compatibility via `zod-to-json-schema`
- Passed directly to SDK's `outputSchema` option

```typescript
config: {
  output_schema: {
    type: 'object',
    properties: {
      function_name: { type: 'string' },
      parameters: { type: 'array', items: { type: 'string' } },
      return_type: { type: 'string' }
    },
    required: ['function_name', 'parameters', 'return_type']
  }
}
```

**Claude Agent SDK:**
- **No native schema support**
- User must use prompt engineering for structured output
- Can achieve similar results via detailed prompts

### System Prompts

**OpenAI Codex SDK:**
- **Single system prompt**
- `system_prompt?: string`
- SDK handles defaults internally

**Claude Agent SDK:**
- **Flexible system prompt configuration**:
  - `custom_system_prompt`: Full replacement
  - `append_system_prompt`: Append to default
- Default preset: `'claude_code'`

```typescript
systemPrompt: config.custom_system_prompt
  ? config.custom_system_prompt
  : {
      type: 'preset',
      preset: 'claude_code',
      append: config.append_system_prompt,
    }
```

### Environment Variables

**OpenAI Codex SDK:**
```typescript
{
  cli_env?: Record<string, string>; // Custom env vars
}
```

- Defaults to inheriting `process.env`
- API key: `OPENAI_API_KEY` or `CODEX_API_KEY`

**Claude Agent SDK:**
- **Full environment passthrough**
- Sorted for cache key stability
- API key: `ANTHROPIC_API_KEY`
- Alternative backends: `CLAUDE_CODE_USE_BEDROCK`, `CLAUDE_CODE_USE_VERTEX`

```typescript
// Pass through entire environment like claude-agent-sdk CLI does
const env: Record<string, string> = {};
for (const key of Object.keys(process.env).sort()) {
  if (process.env[key] !== undefined) {
    env[key] = process.env[key];
  }
}

// EnvOverrides take precedence
if (this.env) {
  for (const key of Object.keys(this.env).sort()) {
    const value = this.env[key as keyof typeof this.env];
    if (value !== undefined) {
      env[key] = value;
    }
  }
}
```

### MCP Server Support

**OpenAI Codex SDK:**
- **No MCP support**

**Claude Agent SDK:**
- **Full MCP integration**
- Transform promptfoo MCP config to Claude Code format
- `strict_mcp_config: true` by default (only explicitly configured servers)
- `setting_sources` for CLAUDE.md discovery

```typescript
// Transform MCP config to Claude Agent SDK MCP servers
const mcpServers = config.mcp ? transformMCPConfigToClaudeCode(config.mcp) : {};

const options: QueryOptions = {
  // ...
  mcpServers,
  strictMcpConfig: config.strict_mcp_config ?? true,
};
```

### Additional Claude Agent SDK Features

**Setting Sources:**
```typescript
setting_sources?: SettingSource[]; // 'user', 'project', 'local'
```

Controls where SDK looks for settings, CLAUDE.md, and slash commands.

## ESM Module Loading

Both providers use the same pattern for loading ESM-only packages in CommonJS environment:

**OpenAI Codex SDK:**
```typescript
async function loadCodexSDK(): Promise<any> {
  const basePath = cliState.basePath && path.isAbsolute(cliState.basePath)
    ? cliState.basePath
    : process.cwd();
  const modulePath = path.join(
    basePath,
    'node_modules',
    '@openai',
    'codex-sdk',
    'dist',
    'index.js'
  );
  return await importModule(modulePath);
}
```

**Claude Agent SDK:**
```typescript
async function loadClaudeCodeSDK(): Promise<typeof import('@anthropic-ai/claude-agent-sdk')> {
  const basePath = cliState.basePath && path.isAbsolute(cliState.basePath)
    ? cliState.basePath
    : process.cwd();
  const resolveFrom = path.join(basePath, 'package.json');
  const require = createRequire(resolveFrom);
  const claudeCodePath = require.resolve('@anthropic-ai/claude-agent-sdk');
  return importModule(claudeCodePath);
}
```

**Key difference**: Claude Agent SDK uses `require.resolve()` for better resolution, while Codex SDK constructs path directly.

## Token Usage Mapping

**OpenAI Codex SDK:**
```typescript
// Codex SDK uses Anthropic-style field names
const tokenUsage: ProviderResponse['tokenUsage'] = turn.usage
  ? {
      prompt: turn.usage.input_tokens + (turn.usage.cached_input_tokens || 0),
      completion: turn.usage.output_tokens,
      total:
        turn.usage.input_tokens +
        (turn.usage.cached_input_tokens || 0) +
        turn.usage.output_tokens,
    }
  : undefined;
```

**Claude Agent SDK:**
```typescript
const tokenUsage: ProviderResponse['tokenUsage'] = {
  prompt: msg.usage?.input_tokens,
  completion: msg.usage?.output_tokens,
  total:
    msg.usage?.input_tokens && msg.usage?.output_tokens
      ? msg.usage?.input_tokens + msg.usage?.output_tokens
      : undefined,
};
```

**Note**: OpenAI Codex SDK uses Anthropic's token usage format (`input_tokens`, `output_tokens`), not OpenAI's (`prompt_tokens`, `completion_tokens`). This was a critical bug discovered during E2E testing.

## Streaming Support

**OpenAI Codex SDK:**
- **Optional streaming** via `enable_streaming: true`
- Manual event processing for `item.completed` and `turn.completed`
- Filters `agent_message` items for final response
- Supports abort signals during streaming

```typescript
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
        break;
      case 'turn.completed':
        usage = event.usage;
        break;
    }
  }

  // Extract text from agent_message items
  const agentMessages = items.filter((i) => i.type === 'agent_message');
  const finalResponse = agentMessages.length > 0
    ? agentMessages.map((i) => i.text).join('\n')
    : '';

  return { finalResponse, items, usage };
}
```

**Claude Agent SDK:**
- **Always streaming** via async generator
- Processes message stream for `result` type
- Handles `success` and failure subtypes

```typescript
for await (const msg of res) {
  if (msg.type == 'result') {
    if (msg.subtype == 'success') {
      return {
        output: msg.result,
        tokenUsage,
        cost,
        raw,
        sessionId,
      };
    } else {
      return {
        error: `Claude Agent SDK call failed: ${msg.subtype}`,
        tokenUsage,
        cost,
        raw,
        sessionId,
      };
    }
  }
}
```

## Cost Tracking

**OpenAI Codex SDK:**
- **No cost tracking** (returns 0)
- TODO comment in code for future implementation

```typescript
// TODO: Calculate cost from usage
const cost = 0;
```

**Claude Agent SDK:**
- **Native cost tracking** from SDK
- Returns `msg.total_cost_usd` from result

```typescript
const cost = msg.total_cost_usd ?? 0;
```

## Abort Signal Handling

Both providers implement abort signal propagation, but with different patterns:

**OpenAI Codex SDK:**
- Pre-call abort check
- In-stream abort checking (when streaming enabled)
- Error name check: `error?.name === 'AbortError'`

```typescript
// Check abort signal before starting
if (callOptions?.abortSignal?.aborted) {
  return { error: 'OpenAI Codex SDK call aborted before it started' };
}

// ... execute turn
const isAbort = error?.name === 'AbortError' || callOptions?.abortSignal?.aborted;
if (isAbort) {
  logger.warn('OpenAI Codex SDK call aborted');
  return { error: 'OpenAI Codex SDK call aborted' };
}
```

**Claude Agent SDK:**
- AbortController wrapper
- Event listener registration/cleanup
- Propagates abort reason

```typescript
const abortController = new AbortController();
let abortHandler: (() => void) | undefined;
if (callOptions?.abortSignal) {
  abortHandler = () => {
    abortController.abort(callOptions.abortSignal!.reason);
  };
  callOptions.abortSignal.addEventListener('abort', abortHandler);
}

// ... finally
if (callOptions?.abortSignal && abortHandler) {
  callOptions.abortSignal.removeEventListener('abort', abortHandler);
}
```

## Error Handling

**OpenAI Codex SDK:**
- Dedicated ESM loading errors with installation instructions
- Working directory validation errors
- Git repository requirement errors
- API key validation

**Claude Agent SDK:**
- More comprehensive error messages with `dedent`
- Working directory fingerprint timeout handling
- Tool configuration conflict validation
- Multi-backend API key support (Anthropic/Bedrock/Vertex)

## Testing Coverage

**OpenAI Codex SDK Tests:**
- **Unit tests**: 28 tests, 94.11% coverage
- **E2E tests**: 6 real API tests
- Total: 946 lines of test code

**Claude Agent SDK Tests:**
- Similar comprehensive coverage
- Mock-based unit tests
- Real SDK integration tests

## Configuration Examples

### OpenAI Codex SDK Basic Config

```yaml
prompts:
  - 'Write a Python function that calculates the factorial of a number.'

providers:
  - id: openai:codex-sdk
    config:
      model: gpt-5.1-codex
      working_dir: /path/to/project
      skip_git_repo_check: false
```

### OpenAI Codex SDK Advanced Config

```yaml
providers:
  - id: openai:codex-sdk
    config:
      model: gpt-4o
      fallback_model: gpt-4o-mini
      max_tokens: 4000
      working_dir: ./src
      skip_git_repo_check: true
      persist_threads: true
      thread_pool_size: 3
      enable_streaming: true
      output_schema:
        type: object
        properties:
          code: { type: string }
          language: { type: string }
        required: [code, language]
```

### Claude Agent SDK Basic Config

```yaml
prompts:
  - 'Analyze the codebase and suggest improvements.'

providers:
  - id: anthropic:claude-agent-sdk
    config:
      model: sonnet
      working_dir: /path/to/project
```

### Claude Agent SDK Advanced Config

```yaml
providers:
  - id: anthropic:claude-agent-sdk
    config:
      model: opus
      fallback_model: sonnet
      working_dir: ./src
      max_turns: 10
      max_thinking_tokens: 10000
      permission_mode: acceptEdits
      append_allowed_tools: [Write, Edit]
      disallowed_tools: [Bash]
      append_system_prompt: |
        Focus on TypeScript best practices.
        Prioritize type safety and maintainability.
      mcp:
        servers:
          - name: filesystem
            transport: stdio
            command: npx
            args: ['-y', '@modelcontextprotocol/server-filesystem', './']
```

## Performance Characteristics

### OpenAI Codex SDK
- **Faster cold start**: Direct model access without tool overhead
- **Lower latency**: Optimized for code generation
- **Thread reuse**: In-memory pooling for repeated calls
- **No disk I/O**: Unless caching enabled externally

### Claude Agent SDK
- **Slower cold start**: Tool initialization and permission setup
- **Higher latency**: Agentic loop with tool use
- **Working dir fingerprinting**: 2s timeout for recursive file scanning
- **Disk caching**: Built-in cache layer with SHA256 keys

## Use Case Recommendations

### Use OpenAI Codex SDK when:
- Primary goal is **code generation** or **code completion**
- Need **structured JSON output** with schemas
- Want **thread persistence** across multiple calls
- Working in **Git repositories** (safety feature)
- Performance is critical (lower latency)

### Use Claude Agent SDK when:
- Need **agentic tool use** (file operations, analysis)
- Want **granular tool permissions**
- Working with **MCP servers** for extended capabilities
- Need **extended thinking** with high max_thinking_tokens
- Want **flexible working directory** handling (temp dirs)

## Summary Table

| Aspect | OpenAI Codex SDK | Claude Agent SDK |
|--------|-----------------|------------------|
| **Session Model** | Thread-based with pooling | Query-based streaming |
| **Caching** | In-memory thread pool | Disk-based with fingerprinting |
| **Working Dir** | Git repo required (bypass available) | Flexible, auto temp dir |
| **Tools** | Implicit | Explicit permissions |
| **Schema Support** | Native JSON schema | Prompt engineering |
| **Streaming** | Optional | Always |
| **Cost Tracking** | No (TODO) | Yes |
| **MCP** | No | Yes |
| **Performance** | Lower latency | Higher capability |
| **License** | Apache-2.0 | Proprietary |

## Key Implementation Insights

### OpenAI Codex SDK Critical Bugs Fixed
1. **Token field names**: Used `input_tokens`/`output_tokens` (not `prompt_tokens`/`completion_tokens`)
2. **Streaming item access**: Used `event.item.text` (not `event.item.content`)
3. **ESM loading**: Required `importModule` with direct path construction
4. **Model parameter**: Must pass to `startThread()`, not just to query

### Claude Agent SDK Design Patterns
1. **Working dir fingerprinting**: Recursive mtime hashing with 2s timeout
2. **Tool deduplication**: Array.from(new Set()).sort() for cache consistency
3. **Environment sorting**: Sorted keys for stable cache keys
4. **Temp dir cleanup**: Always in finally block for safety

## Conclusion

Both providers offer powerful agentic coding capabilities with different trade-offs:

- **OpenAI Codex SDK** excels at pure code generation with structured output, lower latency, and thread persistence
- **Claude Agent SDK** provides richer tool use, MCP integration, and more flexible working directory handling

The choice depends on whether you need focused code generation (Codex) or broader agentic capabilities with tool use (Claude Agent).
