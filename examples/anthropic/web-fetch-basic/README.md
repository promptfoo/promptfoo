# Anthropic Web Fetch - Basic Example

This example demonstrates the core web fetch functionality with Claude, showing how to retrieve and analyze content from specific URLs.

## Features Demonstrated

- **Web Content Fetching**: Retrieve full content from web pages
- **Domain Security**: Restrict access to trusted domains only
- **Content Analysis**: Claude analyzes and summarizes fetched content
- **Citations**: Enable source attribution for better transparency

## Configuration Highlights

```yaml
tools:
  - type: web_fetch_20250910
    name: web_fetch
    max_uses: 2                    # Limit usage per request
    allowed_domains:               # Whitelist trusted domains
      - docs.anthropic.com
      - github.com  
    citations:
      enabled: true                # Enable source citations
    max_content_tokens: 8000       # Limit content size
```

## Running the Example

```bash
cd examples/anthropic/web-fetch-basic
promptfoo eval
```

## What It Tests

1. **Anthropic Documentation**: Fetches and summarizes tool use documentation
2. **GitHub Repository**: Analyzes the Anthropic TypeScript SDK repository

Both tests verify that Claude can successfully fetch content and provide meaningful summaries with proper understanding of the source material.

## Security Notes

- Only allows fetching from `docs.anthropic.com` and `github.com`
- Content is limited to 8,000 tokens to prevent excessive usage
- Citations are enabled for transparency about information sources

## Next Steps

For more advanced use cases, see:
- Combined web search + fetch workflows
- Multi-step research scenarios  
- Custom domain configurations