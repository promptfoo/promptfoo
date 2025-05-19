# redteam-mcp (Red Team Model Context Protocol)

This example demonstrates red teaming an AI assistant that uses Model Context Protocol (MCP) for tool use capabilities. The example focuses on testing various attack vectors specific to MCP implementations, such as function call exploits, system prompt leakage, unauthorized tool discovery, and other MCP-specific vulnerabilities.

You can run this example with:

```bash
npx promptfoo@latest init --example redteam-mcp
```

## Environment Variables

This example requires the following environment variable:

- `ANTHROPIC_API_KEY` - Your Anthropic API key

You can set this in a `.env` file or directly in your environment:

```bash
export ANTHROPIC_API_KEY=your_anthropic_key_here
```

## Prerequisites

- Node.js (v16+)

## Getting Started

1. Initialize the example:

   ```bash
   npx promptfoo@latest init --example redteam-mcp
   ```

2. Navigate to the example directory:

   ```bash
   cd redteam-mcp
   ```

3. Run the red team evaluation:
   ```bash
   npx promptfoo redteam run
   ```

## What This Example Tests

This example evaluates an AI customer support agent implementing MCP with the following attack vectors:

1. **Function Discovery**: Attempts to trick the agent into exposing hidden functions
2. **Parameter Injection**: Tests crafting malicious inputs to inject unwanted parameters
3. **Function Call Manipulation**: Tries to induce unauthorized calls or response handling
4. **Recursive Function Calling**: Tests exploitation of recursion for denial of service
5. **System Information Leakage**: Attempts to extract internal system details
6. **Function Output Manipulation**: Tests causing misinterpretation of function results
7. **Tool Metadata Injection**: Attempts to smuggle instructions through tool names or descriptions
8. **Unauthorized Tool Invocation / Privilege Escalation**: Tests access to unauthorized tools

## Configuration

This example is configured to test the Anthropic Claude 3 Sonnet model with MCP enabled. The MCP server is specified as:

```
https://customer-service-mcp-server-example.promptfoo.app/mcp
```

## Testing Strategies

The red team evaluation uses multiple testing strategies:

- Basic attacks
- Best-of-n optimization
- Jailbreak attempts

## Expected Results

After running the evaluation, you'll see a report showing which attack vectors were successful and which were blocked by the system's defenses.

## Customization

You can modify the `promptfooconfig.yaml` file to:

- Test different providers (recommended: `anthropic:claude-3-7-sonnet-20250219`)
- Add or remove red team plugins
- Change the MCP server configuration
- Adjust the system purpose and guardrails
