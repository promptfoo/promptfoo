# Groq Built-in Tools - Testing and Documentation Summary

## What Was Verified

### ✅ Working Features

**1. Compound Models (groq/compound, groq/compound-mini)**
- Code execution (automatic Python execution)
- Web search (automatic real-time searches)
- Visit website (automatic URL fetching)
- Explicit tool control via `compound_custom.tools.enabled_tools`
- All verified working with 100% test pass rate

**2. GPT-OSS Models (openai/gpt-oss-120b, openai/gpt-oss-20b)**
- browser_search tool (manual configuration required)
- Verified working with real web searches and citations

**3. Assistant Message Prefilling**
- Code generation with format control (````python`)
- JSON extraction with structured output (````json`)
- Works with `stop` parameter for precise output control
- Verified with 100% test pass rate

### ❌ Not Working

**code_interpreter on GPT-OSS**
- Documented by Groq but model refuses to execute
- Tested with both `tool_choice: auto` and `tool_choice: required`
- Model generates code as text but never executes it
- Even returns error: "Tool choice is required, but model did not call a tool"

### ⚠️ Not Tested

**Advanced Compound Features:**
- browser_automation (requires `compound_custom` config + additional setup)
- wolfram_alpha (requires `compound_custom` + Wolfram Alpha API key)

## Files Created/Updated

### Documentation
- **site/docs/providers/groq.md** - Updated with accurate, verified information only
  - Compound models section with automatic tools
  - GPT-OSS browser search section
  - Clear separation between automatic and manual tool configs
  - Real output examples from actual tests

### Test Examples
- **test-browser-search.yaml** - Working browser_search configuration
- **test-groq-compound.yaml** - Compound models with code execution and web search
- **test-compound-capabilities.yaml** - Comprehensive compound model tests
- **test-compound-custom.yaml** - Explicit tool control with compound_custom
- **test-prefilling.yaml** - Assistant message prefilling for output format control

All test files:
- Follow correct YAML field order (description, prompts, providers, tests)
- Have short descriptions (< 10 words)
- Include schema reference
- Verified working (100% pass rate)

### Existing Files
- **promptfooconfig.yaml** - Already correct, no changes needed
- **README.md** - Already follows standards, no changes needed

## Testing Methodology

1. **Fetched Official Docs**: Read Groq's API documentation for each tool
2. **Systematic Testing**: Tested each tool type individually
3. **API Request Analysis**: Examined actual API requests/responses
4. **Verification**: Only documented features that actually work
5. **Multiple Attempts**: Tried different configurations when things failed

## Key Findings

### Configuration Methods

Groq has THREE different ways to enable tools:

1. **Automatic (Compound Models)**
   ```yaml
   providers:
     - id: groq:groq/compound
   # Tools enabled automatically, no config needed
   ```

2. **Manual (GPT-OSS Models)**
   ```yaml
   providers:
     - id: groq:openai/gpt-oss-120b
       config:
         tools:
           - type: browser_search
         tool_choice: required
   ```

3. **compound_custom (Advanced Compound)**
   ```yaml
   providers:
     - id: groq:groq/compound
       compound_custom:
         tools:
           enabled_tools: ["browser_automation", "web_search"]
   ```

### Documentation Discrepancy

Groq's docs claim `code_interpreter` works on GPT-OSS models, but testing proves it doesn't. This is either:
- Not implemented yet
- Broken/disabled
- Requires undocumented setup

## Standards Compliance

### Example Files
✅ Correct field order (description, prompts, providers, tests)
✅ Short descriptions (3-10 words)
✅ Schema reference included
✅ README follows standards

### Documentation
✅ Code block titles only on complete files
✅ Clear, action-oriented language
✅ Progressive disclosure structure
✅ Accurate examples with real output

## Test Commands

```bash
# Browser search test
npm run local -- eval -c examples/groq/test-browser-search.yaml --env-file .env

# Compound models test
npm run local -- eval -c examples/groq/test-groq-compound.yaml --env-file .env

# Compound explicit tool control test
npm run local -- eval -c examples/groq/test-compound-custom.yaml --env-file .env

# Assistant message prefilling test
npm run local -- eval -c examples/groq/test-prefilling.yaml --env-file .env

# Main example
npm run local -- eval -c examples/groq/promptfooconfig.yaml --env-file .env
```

All tests verified working with 100% pass rate.
