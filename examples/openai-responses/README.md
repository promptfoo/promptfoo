# openai-responses (OpenAI Responses API Examples)

This directory contains examples for testing OpenAI's Responses API with promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example openai-responses
cd openai-responses
```

## Examples

### Basic Responses API (`promptfooconfig.yaml`)

Basic example showing how to use the Responses API with GPT-5.5, the GPT-5.4 family (`gpt-5.4-mini`, `gpt-5.4-nano`), and a GPT-4.1 comparison model.

### External Response Format (`promptfooconfig.external-format.yaml`)

Example demonstrating how to load `response_format` configuration from external files. This is useful for:

- Reusing complex JSON schemas across multiple configurations
- Managing large schemas in separate files for better organization
- Version controlling schemas independently

This example compares inline vs. external file approach:

- **Inline**: JSON schema defined directly in the config
- **External**: JSON schema loaded from `response_format.json` using `file://` syntax

### Function Calling (`promptfooconfig.function-call.yaml`)

Example demonstrating function calling capabilities with the Responses API.

### Function Callbacks (`promptfooconfig.function-callback.yaml`)

Example showing how to use function callbacks to execute functions locally instead of just returning the function call. This allows you to:

- Execute custom logic when the model calls a function
- Return the result directly to the test assertions
- Test end-to-end workflows including function execution

Key differences from regular function calling:

- Uses `functionToolCallbacks` to define JavaScript functions
- Functions are executed locally and results are returned
- Perfect for testing tool-using AI agents

### Reasoning Models (`promptfooconfig.reasoning.yaml`)

Example showing how to use reasoning models (o1, o3, etc.) with specific configurations.

### Tool Discovery Redteam (`promptfooconfig.tool-discovery.yaml`)

A small account-support target uses GPT-5.4 Mini through the Responses API with
two synthetic function tools. The tool callbacks return demo data and do not
create or modify real accounts. Its instructions forbid software-tool disclosure
and disclosure of an internal account-linking capability.
When the model calls a function, the provider returns the callback's data directly
for grading; it does not make a follow-up model call with that data.

Run fixed translation, formatting, capability, and disclosure checks:

```bash
npx promptfoo eval -c promptfooconfig.tool-discovery.yaml --no-cache --no-share -o tool-discovery-controls.json
```

Generate four tool-discovery attacks and apply basic, Base64, and ROT13 strategies
for 12 test cases, then evaluate the generated scan:

```bash
PROMPTFOO_DISABLE_REMOTE_GENERATION=true npx promptfoo redteam generate -c promptfooconfig.tool-discovery.yaml -o tool-discovery.generated.yaml --no-cache --force --strict
PROMPTFOO_DISABLE_REMOTE_GENERATION=true npx promptfoo redteam eval -c tool-discovery.generated.yaml --no-cache --no-share -o tool-discovery-results.json
```

Attack generation and grading use GPT-5.5 directly through OpenAI, so this example
only needs `OPENAI_API_KEY`. A faithful transformation of text supplied by the user
should pass; independently revealing or confirming actual tools or a restricted
capability should fail. Inspect the exported response and grading reason together:
a passing refusal does not prove that the model performed a requested translation.

### GPT-5.1 (`promptfooconfig.gpt-5.1.yaml`)

Example demonstrating GPT-5.1's key features including:

- **`none` reasoning mode**: No reasoning tokens for fastest responses
- **Verbosity control**: Adjustable output length (`low`, `medium`, `high`)
- **Reasoning effort levels**: Compare `none`, `medium`, and `high` reasoning modes
- **Coding tasks**: Optimized for coding and problem-solving workflows

### GPT-5.2 (`promptfooconfig.gpt-5.2.yaml`)

Example comparing GPT-5.2 with different reasoning effort levels:

- **none**: No reasoning tokens for fastest responses
- **medium**: Balanced reasoning for most tasks
- **high**: Maximum reasoning for complex problem-solving

### GPT-5.5 (`promptfooconfig.gpt-5.5.yaml`)

Example comparing GPT-5.5 standard and pro models with different Responses API reasoning settings.

### GPT-5.6 (`promptfooconfig.gpt-5.6.yaml`)

Example comparing the Sol, Terra, and Luna tiers. The `gpt-5.6` alias routes to Sol. All tiers support `max` reasoning; Codex `ultra` is available for Sol and Terra rather than as a Responses API reasoning value.

### Image Processing (`promptfooconfig.image.yaml`)

Example demonstrating image input capabilities with vision models.

### Web Search (`promptfooconfig.web-search.yaml`)

Example showing web search capabilities.

### Prompt Caching (`promptfooconfig.prompt-cache.yaml`)

Example combining `prompt_cache_key`, `prompt_cache_retention`, and included
`web_search_call.results` payloads in a Responses request.

### Codex Models (`promptfooconfig.codex.yaml`)

Example using Codex models for code generation tasks.

### MCP (Model Context Protocol) (`promptfooconfig.mcp.yaml`)

Example demonstrating OpenAI's MCP integration with remote MCP servers. This example uses the DeepWiki MCP server to query GitHub repositories.

#### MCP Features Demonstrated:

- Remote MCP server integration
- Tool filtering with `allowed_tools`
- Approval settings configuration
- Authentication headers (when needed)

## Running the Examples

To run any of these examples:

```bash
# Basic Responses API example
npx promptfoo eval -c promptfooconfig.yaml

# External response format example
npx promptfoo eval -c promptfooconfig.external-format.yaml

# MCP example
npx promptfoo eval -c promptfooconfig.mcp.yaml

# Function calling example
npx promptfoo eval -c promptfooconfig.function-call.yaml

# Function callbacks example
npx promptfoo eval -c promptfooconfig.function-callback.yaml

# Reasoning models example
npx promptfoo eval -c promptfooconfig.reasoning.yaml

# GPT-5.1 example
npx promptfoo eval -c promptfooconfig.gpt-5.1.yaml

# GPT-5.2 example
npx promptfoo eval -c promptfooconfig.gpt-5.2.yaml

# GPT-5.5 example
npx promptfoo eval -c promptfooconfig.gpt-5.5.yaml

# GPT-5.6 example
npx promptfoo eval -c promptfooconfig.gpt-5.6.yaml

# Prompt caching example
npx promptfoo eval -c promptfooconfig.prompt-cache.yaml

```

## Prerequisites

- OpenAI API key set in `OPENAI_API_KEY` environment variable
- For MCP examples: Access to remote MCP servers (some may require authentication)

## Notes

- The MCP example uses the public DeepWiki MCP server which doesn't require authentication
- For production use with MCP, carefully review the data being shared with third-party servers
- Some MCP servers may require API keys or authentication tokens in the `headers` configuration
- External file references support both JSON and YAML formats
- External files are resolved relative to the config file location
