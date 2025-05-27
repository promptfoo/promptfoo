# OpenAI MCP (Model Context Protocol) Examples

This directory contains examples demonstrating how to use OpenAI's MCP integration with the Responses API in promptfoo.

## What is MCP?

Model Context Protocol (MCP) is an open protocol that standardizes how applications provide tools and context to LLMs. OpenAI's MCP integration allows models to use remote MCP servers to perform tasks like searching repositories, accessing APIs, and more.

## Examples

### Basic MCP Usage (`promptfooconfig.yaml`)

Demonstrates basic MCP integration using the public DeepWiki MCP server to search GitHub repositories.

**Features:**

- Remote MCP server integration
- Tool filtering with `allowed_tools`
- No approval required for faster execution
- Repository search and information retrieval

**Usage:**

```bash
npx promptfoo eval -c promptfooconfig.yaml
```

### Authenticated MCP (`promptfooconfig.authenticated.yaml`)

Shows how to use MCP servers that require authentication, using Stripe as an example.

**Features:**

- Authentication headers configuration
- Environment variable usage for API keys
- Payment processing tools
- Secure API key handling

**Prerequisites:**

- Valid Stripe API key set in `STRIPE_API_KEY` environment variable

**Usage:**

```bash
export STRIPE_API_KEY="sk-test_your_stripe_key_here"
npx promptfoo eval -c promptfooconfig.authenticated.yaml
```

### Approval Workflows (`promptfooconfig.approval.yaml`)

Demonstrates different approval settings for MCP tool usage.

**Features:**

- Default approval required behavior
- Selective approval for specific tools
- No approval required configuration
- Comparison of different approval strategies

**Usage:**

```bash
npx promptfoo eval -c promptfooconfig.approval.yaml
```

## MCP Configuration Options

### Basic MCP Tool Configuration

```yaml
tools:
  - type: mcp
    server_label: server_name
    server_url: https://mcp.example.com/mcp
    require_approval: never
```

### Authentication

```yaml
tools:
  - type: mcp
    server_label: authenticated_server
    server_url: https://mcp.example.com
    headers:
      Authorization: 'Bearer ${API_KEY}'
    require_approval: never
```

### Tool Filtering

```yaml
tools:
  - type: mcp
    server_label: filtered_server
    server_url: https://mcp.example.com/mcp
    allowed_tools: ['specific_tool_1', 'specific_tool_2']
    require_approval: never
```

### Selective Approval

```yaml
tools:
  - type: mcp
    server_label: selective_server
    server_url: https://mcp.example.com/mcp
    require_approval:
      never:
        tool_names: ['safe_tool_1', 'safe_tool_2']
```

## Available MCP Servers

Some popular remote MCP servers include:

- **DeepWiki** (`https://mcp.deepwiki.com/mcp`) - GitHub repository search (no auth required)
- **Stripe** (`https://mcp.stripe.com`) - Payment processing (requires API key)
- **Cloudflare** - Cloud infrastructure management
- **HubSpot** - CRM and marketing tools
- **Intercom** - Customer messaging
- **PayPal** - Payment processing
- **Shopify** - E-commerce platform
- **Twilio** - Communications APIs

## Security Considerations

1. **Trust MCP Servers**: Only connect to trusted MCP servers as they can access data in the model's context
2. **Use Approvals**: Enable approvals for sensitive operations to review data sharing
3. **Secure API Keys**: Store authentication tokens securely using environment variables
4. **Log Data Sharing**: Monitor what data is sent to third-party MCP servers
5. **Review Tool Definitions**: Understand what tools are available and what data they require

## Troubleshooting

### Common Issues

1. **Authentication Errors**: Ensure API keys are correctly set in environment variables
2. **Tool Not Found**: Check that `allowed_tools` includes the tools you want to use
3. **Approval Required**: If tools require approval, you'll see approval requests in the output
4. **Network Errors**: Verify MCP server URLs are accessible

### Debugging

Enable debug logging to see detailed MCP interactions:

```bash
DEBUG=1 npx promptfoo eval -c promptfooconfig.yaml
```

## Running the Examples

1. **Set up environment variables** (for authenticated examples):

   ```bash
   export OPENAI_API_KEY="your_openai_api_key"
   export STRIPE_API_KEY="your_stripe_api_key"  # For authenticated example
   ```

2. **Run basic example**:

   ```bash
   npx promptfoo eval -c promptfooconfig.yaml
   ```

3. **Run authenticated example**:

   ```bash
   npx promptfoo eval -c promptfooconfig.authenticated.yaml
   ```

4. **Run approval workflow example**:

   ```bash
   npx promptfoo eval -c promptfooconfig.approval.yaml
   ```

5. **View results**:
   ```bash
   npx promptfoo view
   ```

## Learn More

- [OpenAI MCP Documentation](https://platform.openai.com/docs/guides/mcp)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Promptfoo OpenAI Provider Documentation](../../site/docs/providers/openai.md)
- [MCP Server Registry](https://github.com/modelcontextprotocol/servers)
