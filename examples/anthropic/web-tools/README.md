# web-tools

This example demonstrates Anthropic's web search and web fetch tools, showing both basic URL fetching and comprehensive research workflows.

You can run this example with:

```bash
npx promptfoo@latest init --example web-tools
```

## Features Demonstrated

- **Web Search**: Find relevant information across the internet
- **Web Fetch**: Retrieve full content from specific web pages and PDFs
- **Combined Workflows**: Multi-step research processes
- **Security Controls**: Domain filtering for trusted sources
- **Citations**: Source attribution for transparency

## Configuration Highlights

```yaml
# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json
description: 'Web search and fetch tools'

prompts:
  - |
    {{task}}

providers:
  - id: anthropic:messages:claude-sonnet-4-5-20250929
    config:
      temperature: 0
      max_tokens: 2500
      tools:
        - type: web_search_20250305 # Search the web
          name: web_search
          max_uses: 2
        - type: web_fetch_20250910 # Fetch specific URLs
          name: web_fetch
          max_uses: 3
          allowed_domains: # Restrict to trusted domains
            - docs.anthropic.com
            - github.com
            - openai.com
            - arxiv.org
          citations:
            enabled: true # Enable source citations
          max_content_tokens: 12000 # Content size limit
```

## Required Environment Variables

This example requires the following environment variables:

- `ANTHROPIC_API_KEY` - Your Anthropic API key from [console.anthropic.com](https://console.anthropic.com/settings/keys)

You can set these in a `.env` file or directly in your environment.

## Running the Example

```bash
cd examples/anthropic/web-tools
promptfoo eval
```

## What It Tests

1. **Direct URL Fetch**: Retrieve and summarize specific documentation pages
2. **GitHub Repository Analysis**: Analyze code repositories and their purpose
3. **Research Workflow**: Multi-step research with search → fetch → synthesis
4. **Security Research**: Investigation of web tool security considerations

## Use Cases

Perfect for:

- Documentation analysis
- Competitive research
- Technical investigation
- Security assessment
- Academic literature review

## Security Notes

- Only allows fetching from trusted domains (docs.anthropic.com, github.com, openai.com, arxiv.org)
- Content limited to 12,000 tokens to prevent excessive usage
- Citations enabled for source transparency
- Usage limits prevent API abuse (2 searches, 3 fetches per evaluation)
