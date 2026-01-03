# Recon Command E2E Testing Guide

This guide covers comprehensive testing for the `promptfoo redteam recon` command, including edge cases, corner cases, and manual E2E testing procedures.

## Architecture Overview

The recon command has three main phases:

1. **CLI Analysis Phase** - Agent analyzes codebase and produces `ReconResult`
2. **Browser Handoff Phase** - Config written to `pending-recon.json`, browser opens
3. **Frontend Display Phase** - Web UI reads pending config, displays `ReconSummaryBanner`

## Unit Test Coverage

### 1. `parseReconOutput` (providers.ts)

The function that parses raw agent output into a validated `ReconResult`.

**Tested scenarios:**
- Valid complete `ReconResult` objects
- Minimal valid objects (only `purpose`)
- Empty objects (all fields optional)
- JSON string inputs (valid and invalid)
- Non-JSON strings treated as `purpose`
- Partial schema validation with warnings
- Edge cases: null, undefined, arrays, numbers, booleans
- Unicode and special characters
- Very long strings

### 2. `selectProvider` (providers.ts)

Provider selection based on API keys.

**Tested scenarios:**
- OpenAI key only
- Anthropic key only
- Both keys (prefers OpenAI)
- No keys (throws)
- Forced provider overrides
- Missing required key for forced provider

### 3. `buildRedteamConfig` (config.ts)

Builds the red team config from recon results.

**Tested scenarios:**
- All application definition fields
- Plugin suggestions based on findings
- Strategy selection (stateful vs stateless)
- Invalid plugin filtering
- Entity extraction

### 4. `suggestPluginsFromFindings` (config.ts)

Maps recon findings to appropriate plugins.

**Tested scenarios:**
- PII detection triggers `pii:direct`, `pii:session`
- System prompt triggers `prompt-extraction`
- Tools trigger `excessive-agency`, `tool-discovery`
- Access control triggers `rbac`
- Security requirements trigger multiple plugins
- Agent persona triggers `hijacking`, `hallucination`

## CLI Edge Cases to Test

### Directory Validation

| Scenario | Expected Behavior |
|----------|-------------------|
| Non-existent directory | Error: "Directory not found: /path" |
| File instead of directory | Error: "Path is not a directory: /path" |
| Empty directory | Agent runs but may produce minimal results |
| Permission denied | Error with permission message |
| Symlink to directory | Should follow and analyze |
| Very deep nesting | Should handle (may be slow) |

### API Key Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| No API keys | Error listing required keys |
| Invalid OpenAI key | API error from provider |
| Invalid Anthropic key | API error from provider |
| Rate limited | Retry or clear error message |
| Expired key | Authentication error |

### Provider Options

| Scenario | Expected Behavior |
|----------|-------------------|
| `--provider openai` without key | Error about missing key |
| `--provider anthropic` without key | Error about missing key |
| `--model custom-model` | Uses specified model |
| Invalid provider name | Commander validation error |

### Output Options

| Scenario | Expected Behavior |
|----------|-------------------|
| `--output custom.yaml` | Writes to custom.yaml |
| Output path with spaces | Handles correctly (quoted) |
| Output to read-only dir | Error with permission message |
| `--yes` flag | Skips confirmation prompts |
| `--no-open` | Skips browser launch |

### Exclude Patterns

| Scenario | Expected Behavior |
|----------|-------------------|
| `--exclude node_modules` | Excludes node_modules |
| Multiple excludes | All patterns respected |
| Invalid glob pattern | Clear error message |

## Browser Handoff Edge Cases

### pending-recon.json

| Scenario | Expected Behavior |
|----------|-------------------|
| Config dir doesn't exist | Created automatically |
| File already exists | Overwritten |
| Invalid JSON written | Frontend shows error |
| File deleted before browser opens | Frontend shows "no pending" message |
| Stale file (hours old) | Frontend should still load it |

### Server State

| Scenario | Expected Behavior |
|----------|-------------------|
| Server not running | User sees instructions to start |
| Wrong port | URL shows wrong port, user navigates manually |
| Server on different host | Not supported (localhost only) |

### Browser Launch

| Scenario | Expected Behavior |
|----------|-------------------|
| No default browser | Error logged, URL printed |
| Browser blocks popup | URL printed for manual navigation |
| macOS/Linux/Windows | `open` package handles cross-platform |

## Frontend Edge Cases (ReconSummaryBanner)

### ReconContext Validation

| Scenario | Expected Behavior |
|----------|-------------------|
| `source` not 'recon-cli' | Banner not rendered |
| Missing `reconContext` | Banner not rendered |
| `timestamp` = 0 | Date shows epoch time |
| `timestamp` in future | Shows future date |
| `codebaseDirectory` undefined | Shows "Unknown" |
| Very long directory path | Truncated with `...` |
| `keyFilesAnalyzed` = 0 | Badge hidden |
| `fieldsPopulated` = 0 | Badge hidden |

### Path Truncation

| Input | Output |
|-------|--------|
| `/a/b` (2 parts) | `/a/b` (no truncation) |
| `/a/b/c` (3 parts) | `/a/b/c` (no truncation) |
| `/a/b/c/d` (4+ parts) | `.../c/d` (truncated) |
| undefined | "Unknown" |

## Manual E2E Testing Checklist

### Prerequisites

```bash
# Ensure you have API keys configured
export OPENAI_API_KEY=your-key
# OR
export ANTHROPIC_API_KEY=your-key

# Build the project
npm run build
```

### Happy Path Test

```bash
# 1. Navigate to a test codebase
cd /path/to/test-codebase

# 2. Run recon
npm run local -- redteam recon

# Expected:
# - Spinner shows progress updates
# - Analysis completes with results displayed
# - Prompted to write config file
# - Browser opens to redteam setup page
# - ReconSummaryBanner shows at top of page
# - Form fields populated from recon
```

### Verification Steps

1. **CLI Output**
   - [ ] Progress spinner updates during analysis
   - [ ] Purpose displayed after completion
   - [ ] Features listed (if discovered)
   - [ ] Discovered tools listed (if any)
   - [ ] Security notes shown (if any)
   - [ ] Confirmation prompt appears

2. **Config File**
   - [ ] YAML file created at specified path
   - [ ] Contains valid red team config
   - [ ] Plugins array populated
   - [ ] Strategies array populated
   - [ ] Purpose field set

3. **Browser UI**
   - [ ] Page loads without errors
   - [ ] ReconSummaryBanner visible with blue styling
   - [ ] Directory path shown (truncated if long)
   - [ ] Key files count shown (if > 0)
   - [ ] Fields populated count shown (if > 0)
   - [ ] Timestamp formatted correctly
   - [ ] Form fields pre-populated

### Error Path Tests

```bash
# Test: Non-existent directory
npm run local -- redteam recon --dir /nonexistent
# Expected: Error message about directory not found

# Test: No API keys
unset OPENAI_API_KEY ANTHROPIC_API_KEY
npm run local -- redteam recon
# Expected: Error listing required API keys

# Test: Abort at confirmation
npm run local -- redteam recon
# When prompted, type 'n'
# Expected: "Aborted. No config file written."
```

### Provider-Specific Tests

```bash
# Test: Force OpenAI
OPENAI_API_KEY=your-key npm run local -- redteam recon --provider openai

# Test: Force Anthropic
ANTHROPIC_API_KEY=your-key npm run local -- redteam recon --provider anthropic

# Test: Custom model
npm run local -- redteam recon --model gpt-4o
```

### Verbose and Output Tests

```bash
# Test: Verbose mode
npm run local -- redteam recon --verbose
# Expected: Additional key files listed

# Test: Custom output
npm run local -- redteam recon --output custom-config.yaml
# Expected: File created at custom-config.yaml

# Test: Skip confirmation
npm run local -- redteam recon --yes
# Expected: No prompt, file written directly

# Test: Skip browser
npm run local -- redteam recon --no-open
# Expected: No browser opens, next steps printed
```

## Integration Test Ideas

### Mock-Based Integration Tests

```typescript
// Test the full doRecon flow with mocked provider
it('should complete recon and write config', async () => {
  // Mock provider to return known result
  vi.mock('../providers', () => ({
    createOpenAIReconProvider: () => ({
      analyze: async () => ({
        purpose: 'Test app',
        features: 'Feature list',
      }),
    }),
    selectProvider: () => ({ type: 'openai', model: 'gpt-5.1-codex' }),
  }));

  // Run recon with --yes flag
  const result = await doRecon({
    dir: '/tmp/test-codebase',
    yes: true,
    open: false,
  });

  expect(result.purpose).toBe('Test app');
  // Verify config file written
  // Verify pending-recon.json created
});
```

### Real API Integration Tests (Expensive)

```bash
# Run with real API against minimal codebase
mkdir /tmp/test-recon && cd /tmp/test-recon
echo "console.log('hello')" > app.js
npm run local -- redteam recon --yes --no-open

# Verify:
# - promptfooconfig.yaml created
# - Contains reasonable plugins
# - pending-recon.json exists
```

## Known Limitations

1. **Large codebases**: May hit context limits or timeout
2. **Binary files**: Ignored by agents (expected)
3. **Non-code files**: May not provide useful results
4. **Network issues**: No retry logic for API calls
5. **Concurrent runs**: May overwrite pending-recon.json

## Debugging Tips

```bash
# Enable verbose logging
LOG_LEVEL=debug npm run local -- redteam recon

# Check pending config
cat ~/.promptfoo/pending-recon.json | jq .

# Check scratchpad (if debugging agent notes)
# Look in temp directory during analysis
```
