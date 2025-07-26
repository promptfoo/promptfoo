# openai-mcp (OpenAI MCP Integration)

This example demonstrates how to use OpenAI's Model Context Protocol (MCP) integration with the Responses API in promptfoo.

You can run this example with:

```bash
npx promptfoo@latest init --example openai-mcp
```

## What is MCP?

Model Context Protocol (MCP) is an open protocol that standardizes how applications provide tools and context to LLMs. OpenAI's MCP integration allows models to use remote MCP servers to perform tasks like searching repositories, accessing APIs, and more.

## Environment Variables

This example requires the following environment variables:

- `OPENAI_API_KEY` - Your OpenAI API key from the OpenAI platform
- `STRIPE_API_KEY` - Your Stripe API key (for authenticated examples only)

You can set these in a `.env` file or directly in your environment.

## Running the Examples

1. **Set up environment variables**:

   ```bash
   export OPENAI_API_KEY="your_openai_api_key"
   export STRIPE_API_KEY="your_stripe_api_key"  # For authenticated example only
   ```

2. **Run individual examples**:

   ```bash
   # Basic MCP integration
   npx promptfoo eval -c promptfooconfig.yaml

   # Authenticated MCP servers
   npx promptfoo eval -c promptfooconfig.authenticated.yaml

   # Approval workflow examples
   npx promptfoo eval -c promptfooconfig.approval.yaml
   ```

3. **View results**:
   ```bash
   npx promptfoo view
   ```

## Examples

### Basic MCP Usage (`promptfooconfig.yaml`)

Demonstrates basic MCP integration using the public DeepWiki MCP server to search GitHub repositories.

### Authenticated MCP (`promptfooconfig.authenticated.yaml`)

Shows how to use MCP servers that require authentication, using Stripe as an example.

### Approval Workflows (`promptfooconfig.approval.yaml`)

Demonstrates different approval settings for MCP tool usage.

## MCP Configuration

### Basic Configuration

```yaml
tools:
  - type: mcp
    server_label: deepwiki
    server_url: https://mcp.deepwiki.com/mcp
    require_approval: never
```

### With Authentication

```yaml
tools:
  - type: mcp
    server_label: stripe
    server_url: https://mcp.stripe.com
    headers:
      Authorization: 'Bearer ${STRIPE_API_KEY}'
    require_approval: never
```

### Tool Filtering

```yaml
tools:
  - type: mcp
    server_label: deepwiki
    server_url: https://mcp.deepwiki.com/mcp
    allowed_tools: ['ask_question', 'read_wiki_structure']
    require_approval: never
```

### Selective Approval

```yaml
tools:
  - type: mcp
    server_label: deepwiki
    server_url: https://mcp.deepwiki.com/mcp
    require_approval:
      never:
        tool_names: ['ask_question']
```

## Assertion Patterns

The examples demonstrate assertion patterns for validating MCP tool interactions:

### Enhanced OpenAI Tools Validation

```yaml
assert:
  - type: is-valid-openai-tools-call # Validates both function and MCP tools
```

### MCP-Specific Content Validation

```yaml
assert:
  - type: contains
    value: 'MCP Tool Result' # Verify MCP tools were used
  - type: not-contains
    value: 'MCP Tool Error' # Ensure no MCP errors occurred
```

### Multi-layered Validation

```yaml
assert:
  - type: is-valid-openai-tools-call
    weight: 0.4
  - type: contains-any
    value: ['expected', 'content']
    weight: 0.3
  - type: llm-rubric
    value: 'Response quality criteria'
    weight: 0.3
```

## Learn More

- [OpenAI MCP Documentation](https://platform.openai.com/docs/guides/mcp)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Promptfoo OpenAI Provider Documentation](/docs/providers/openai)
- [MCP Server Registry](https://github.com/modelcontextprotocol/servers)
