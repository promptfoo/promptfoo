# Anthropic Web Research Example

This advanced example demonstrates how to combine Claude's web search and web fetch tools for comprehensive research tasks.

## Overview

This example shows how Claude can:
1. **Search** for relevant information on a topic using web search
2. **Identify** the most authoritative and relevant sources
3. **Fetch** full content from selected sources using web fetch
4. **Synthesize** information into a comprehensive research report
5. **Cite** sources properly with inline citations

## Workflow

The research workflow follows these steps:

1. **Initial Search**: Claude searches for recent information about the research topic
2. **Source Evaluation**: Identifies high-quality, authoritative sources from search results  
3. **Content Retrieval**: Uses web fetch to get full content from selected sources
4. **Analysis & Synthesis**: Analyzes the fetched content and synthesizes key findings
5. **Report Generation**: Creates a structured report with executive summary, key findings, and citations

## Configuration Features

This example includes:
- **Combined Tools**: Both web search and web fetch tools working together
- **Domain Filtering**: Restricts fetching to trusted academic and technical domains
- **Higher Token Limits**: Allows for comprehensive content analysis (20,000 tokens)
- **Citation Support**: Enables proper source attribution
- **Usage Limits**: Balanced limits for search (3) and fetch (5) operations

## Trusted Domains

The configuration restricts web fetching to authoritative sources:
- `docs.anthropic.com` - Official Anthropic documentation
- `github.com` - Code repositories and technical documentation  
- `arxiv.org` - Academic papers and research
- `openai.com` - AI research and documentation
- `huggingface.co` - ML models and datasets
- `papers.nips.cc` - Machine learning conference papers

## Running the Example

```bash
# Run the evaluation
promptfoo eval

# View results in the web UI
promptfoo view
```

## Example Output

When you run this evaluation, Claude will:

1. Search for information about your topic
2. Find relevant sources from the allowed domains
3. Fetch full content from the most promising sources
4. Generate a structured research report like:

```
# Research Report: Claude 4 AI Model Capabilities

## Executive Summary
Based on recent sources, Claude 4 represents significant advances in...

## Key Findings
- Enhanced reasoning capabilities compared to previous versions
- Improved tool use and function calling abilities
- Better performance on coding and mathematical tasks

## Recent Developments
- Release of Claude 4 Sonnet and Opus variants
- Introduction of web fetch capabilities
- Enhanced thinking and reasoning features

## Sources and References
[1] Anthropic Documentation - Claude 4 Overview
[2] Technical specifications from official GitHub repository
...
```

## Advanced Configuration

### Research-Specific Setup

```yaml
providers:
  - id: anthropic:messages:claude-sonnet-4-20250514
    config:
      tools:
        - type: web_search_20250305
          name: web_search
          max_uses: 5  # More searches for thorough research
        - type: web_fetch_20250910
          name: web_fetch
          max_uses: 10  # More fetches for comprehensive analysis
          allowed_domains:
            - scholar.google.com
            - arxiv.org
            - ieee.org
            - acm.org
          citations:
            enabled: true
          max_content_tokens: 50000  # Higher limit for academic papers
```

### Domain-Specific Research

For medical research:
```yaml
allowed_domains:
  - pubmed.ncbi.nlm.nih.gov
  - nejm.org
  - bmj.com
  - thelancet.com
```

For technical research:
```yaml
allowed_domains:
  - stackoverflow.com
  - developer.mozilla.org
  - docs.python.org
  - kubernetes.io
```

## Related Examples

- [Anthropic Web Fetch](../anthropic-web-fetch/) - Basic web fetching capabilities
- [Tool Use](../tool-use/) - General tool usage patterns
- [OpenAI Tools Call](../openai-tools-call/) - Comparing tool capabilities across providers