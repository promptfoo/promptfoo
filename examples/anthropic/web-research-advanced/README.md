# Anthropic Web Research - Advanced Example

This example demonstrates sophisticated research workflows that combine web search and web fetch capabilities for comprehensive topic analysis.

## Features Demonstrated

- **Multi-Step Research**: Search → identify sources → fetch → synthesize
- **Combined Tools**: Both web search and web fetch working together
- **Research Methodology**: Structured approach to information gathering
- **Source Validation**: Domain filtering ensures quality sources
- **Comprehensive Analysis**: Deep synthesis of multiple sources

## Configuration Highlights

```yaml
tools:
  - type: web_search_20250305    # Find relevant sources
    name: web_search
    max_uses: 2
    
  - type: web_fetch_20250910     # Get detailed content  
    name: web_fetch
    max_uses: 3
    allowed_domains:             # Academic and official sources
      - docs.anthropic.com
      - github.com
      - openai.com
      - arxiv.org
    citations:
      enabled: true
    max_content_tokens: 15000    # Higher limit for research
```

## Research Workflow

1. **Discovery**: Web search identifies relevant sources
2. **Selection**: Claude evaluates search results for authority and relevance
3. **Deep Analysis**: Web fetch retrieves full content from selected sources
4. **Synthesis**: Information is combined into a structured research report

## Running the Example

```bash
cd examples/anthropic/web-research-advanced  
promptfoo eval
```

## What It Tests

1. **AI Model Research**: Comprehensive analysis of Claude 4 capabilities
2. **Security Research**: Investigation of web fetch tool security considerations

Both scenarios test the full research pipeline from search to final analysis.

## Performance Expectations

- **Token Usage**: 20K-50K tokens per research task
- **Duration**: 30-60 seconds per evaluation
- **Sources**: 2-5 sources typically analyzed per topic

## Security & Quality Controls

- **Trusted Domains**: Limited to academic and official sources
- **Content Limits**: 15K token cap prevents excessive processing
- **Source Attribution**: Citations provide transparency
- **Usage Limits**: Balanced search (2) and fetch (3) operations

## Use Cases

Perfect for:
- Competitive analysis
- Technical research
- Policy analysis  
- Academic literature review
- Due diligence investigations