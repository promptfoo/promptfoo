# anthropic (Anthropic Claude Examples)

This directory contains examples demonstrating how to use Anthropic Claude models with promptfoo. These examples showcase various Claude capabilities such as basic completions, web search, tool use, and more.

You can run these examples with:

```bash
npx promptfoo@latest init --example anthropic
```

## Requirements

- An [Anthropic API key](https://console.anthropic.com/settings/keys)
- NodeJS 18+

## Environment Variables

This example requires the following environment variable:

- `ANTHROPIC_API_KEY` - Your Anthropic API key

You can set this in a `.env` file or directly in your environment:

```bash
export ANTHROPIC_API_KEY=your_api_key_here
```

## Examples Included

### Basic Prompt Completions

Simple example showing basic Claude completions with various models:

```bash
npx promptfoo@latest evaluate -c examples/anthropic/promptfooconfig.basic.yaml
```

### Web Search Capability

Claude can now search the web for up-to-date information:

```bash
npx promptfoo@latest evaluate -c examples/anthropic/promptfooconfig.web-search.yaml
```

Advanced web search options (domain filtering, location):

```bash
npx promptfoo@latest evaluate -c examples/anthropic/promptfooconfig.web-search-advanced.yaml
```

Tool choice options for web search (auto, forced, disabled):

```bash
npx promptfoo@latest evaluate -c examples/anthropic/promptfooconfig.tool-choice.yaml
```

### Extended Thinking

Claude can show its reasoning process with extended thinking:

```bash
npx promptfoo@latest evaluate -c examples/anthropic/promptfooconfig.thinking.yaml
```

### Multi-turn Conversations

Example of multi-turn conversations with Claude:

```bash
npx promptfoo@latest evaluate -c examples/anthropic/promptfooconfig.conversation.yaml
```

### Citations

Claude can provide citations from reference materials:

```bash
npx promptfoo@latest evaluate -c examples/anthropic/promptfooconfig.citations.yaml
```

### Vision Capabilities

Claude can analyze images (Claude 3+):

```bash
npx promptfoo@latest evaluate -c examples/anthropic/promptfooconfig.vision.yaml
```

## Configuration Examples

### Basic Model Configuration

```yaml
providers:
  - id: anthropic:messages:claude-3-7-sonnet-20250219
    config:
      temperature: 0.7
      max_tokens: 2048
```

### Web Search Configuration

```yaml
providers:
  - id: anthropic:messages:claude-3-7-sonnet-20250219
    config:
      tools:
        - type: 'web_search_20250305'
          name: 'web_search'
          max_uses: 5
```

#### Domain Filtering

You can filter search results to include only specific domains:

```yaml
tools:
  - type: 'web_search_20250305'
    name: 'web_search'
    allowed_domains: ['edu', 'gov', 'nature.com', 'science.org']
```

Or block specific domains from search results:

```yaml
tools:
  - type: 'web_search_20250305'
    name: 'web_search'
    blocked_domains: ['wikipedia.org', 'reddit.com']
```

Note: You can use either `allowed_domains` or `blocked_domains`, but not both in the same request.

#### Location Targeting

You can localize search results based on a specific location:

```yaml
tools:
  - type: 'web_search_20250305'
    name: 'web_search'
    user_location:
      type: 'approximate'
      city: 'San Francisco'
      region: 'California'
      country: 'US'
      timezone: 'America/Los_Angeles'
```

### Tool Choice Options

Control how Claude uses the web search tool:

```yaml
# Let Claude decide when to use web search (default)
tool_choice:
  type: "auto"

# Force Claude to use web search
tool_choice:
  type: "tool"
  name: "web_search"

# Prevent Claude from using web search even though it's defined
tool_choice:
  type: "none"
```

### Extended Thinking Configuration

```yaml
providers:
  - id: anthropic:messages:claude-3-7-sonnet-20250219
    config:
      thinking:
        type: 'enabled'
        budget_tokens: 1024
      showThinking: true
```

## Models Supported

This example includes configurations for various Claude models:

- `anthropic:messages:claude-3-7-sonnet-20250219`
- `anthropic:messages:claude-3-5-sonnet-latest`
- `anthropic:messages:claude-3-5-haiku-latest`

## Pricing Information

- Each model has different pricing for input and output tokens
- Web search is billed at $10 per 1,000 searches plus standard token costs
- Token usage tracking is included in promptfoo output

## Further Reading

- [Claude API Documentation](https://docs.anthropic.com/claude/reference/getting-started-with-the-api)
- [promptfoo Anthropic Provider Documentation](https://promptfoo.dev/docs/providers/anthropic/)
