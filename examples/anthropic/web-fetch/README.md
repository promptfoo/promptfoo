# Anthropic Web Fetch Example

This example demonstrates how to use Claude with the web fetch tool to retrieve and analyze content from web pages.

## Overview

The web fetch tool allows Claude to:
- Retrieve full content from web pages and PDF documents
- Analyze and summarize web content
- Extract specific information from URLs provided by users
- Work with citations for better content attribution

## Configuration Features

This example showcases:
- **Domain filtering**: Restricts fetching to specific domains (`docs.anthropic.com`, `github.com`)
- **Citations**: Enables inline citations from fetched content
- **Content limits**: Limits web content to 10,000 tokens
- **Usage limits**: Limits to 3 web fetch calls per request

## Security Considerations

The web fetch tool includes several security features:
- Claude cannot dynamically construct URLs - only user-provided URLs can be fetched
- Domain filtering prevents access to unauthorized sites
- Content token limits prevent excessive data retrieval

## Running the Example

```bash
# Run the evaluation
promptfoo eval

# View results in the web UI
promptfoo view
```

## Example Configuration

```yaml
providers:
  - id: anthropic:messages:claude-sonnet-4-20250514
    config:
      tools:
        - type: web_fetch_20250910
          name: web_fetch
          max_uses: 3
          allowed_domains:
            - docs.anthropic.com
            - github.com
          citations:
            enabled: true
          max_content_tokens: 10000
```

## Advanced Usage

### Combined Web Search and Fetch

For more comprehensive web information gathering, you can combine web search with web fetch:

```yaml
tools:
  - type: web_search_20250305
    name: web_search
    max_uses: 2
  - type: web_fetch_20250910
    name: web_fetch
    max_uses: 5
    citations:
      enabled: true
```

This allows Claude to first search for relevant information, then fetch full content from the most promising results.

### Domain-Specific Research

Restrict fetching to trusted documentation sites:

```yaml
tools:
  - type: web_fetch_20250910
    name: web_fetch
    allowed_domains:
      - docs.python.org
      - developer.mozilla.org
      - github.com
    blocked_domains:
      - ads.example.com
      - tracker.example.com
```

## Related Examples

- [Tool Use](../tool-use/) - Basic tool usage with Claude
- [Claude Vision](../claude-vision/) - Using Claude's vision capabilities
- [OpenAI Vision](../openai-vision/) - Comparing vision capabilities across providers