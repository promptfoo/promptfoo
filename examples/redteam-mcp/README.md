# redteam-mcp

This example demonstrates red teaming an AI assistant that uses Model Context Protocol (MCP) for memory and tool use capabilities. The example focuses on testing various attack vectors specific to MCP implementations, such as memory poisoning, memory extraction, tool manipulation, and identity confusion.

## Prerequisites

- Node.js (v16+)
- An OpenAI API key
- An Anthropic API key (optional)

## Getting Started

You can run this example with:

```bash
npx promptfoo@latest redteam run -c examples/redteam-mcp
```

Then set up your API keys:

```bash
export OPENAI_API_KEY=your_openai_key_here
export ANTHROPIC_API_KEY=your_anthropic_key_here  # Optional
```

## Run the Red Team Evaluation

```bash
cd redteam-mcp
npx promptfoo redteam run
```

## What This Example Tests

This example evaluates an AI assistant implementing MCP with the following attack vectors:

1. **Memory Poisoning**: Attempts to inject harmful or malicious data into the MCP memory store
2. **Memory Extraction**: Tries to extract sensitive information stored in memory
3. **MCP Tool Manipulation**: Tests if the model can be tricked into misusing tools or executing unauthorized operations
4. **Identity Confusion**: Attempts to manipulate the model's understanding of user identity or permissions through memory

## Configuration

This example is configured to test two providers:

1. OpenAI's GPT-4o-mini with MCP enabled
2. Anthropic's Claude 3.7 Sonnet with MCP enabled

Both providers use the `@modelcontextprotocol/server-memory` package as the MCP server.

## Customization

You can modify the `promptfooconfig.yaml` file to:

- Test different models or providers
- Add or remove red team plugins
- Change the MCP server configuration
- Adjust the system purpose and guardrails

The `redteam.yaml` file contains custom attack vectors specific to MCP implementations that you can also modify or extend.
