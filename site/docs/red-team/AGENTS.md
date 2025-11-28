# Documentation Writing Guidelines for Red Team Docs

This file provides guidance for writing and maintaining documentation in the site/docs/red-team directory.

## Core Writing Principles

### User-Centric Approach

- Write for developers who want to quickly understand and implement
- Lead with what the user needs to accomplish, not exhaustive feature lists
- Prioritize practical examples over theoretical explanations

### Conciseness Over Verbosity

- Eliminate LLM-generated fluff and redundant explanations
- Remove substantially redundant criteria across pages
- Keep examples focused and actionable
- Use precise, technical language without unnecessary elaboration

### Content Organization

- **Main overview pages**: High-level comparison tables linking to specific pages
- **Individual plugin pages**: Focused content with specific examples
- **Configuration**: Quick start first, then advanced options

## Technical Writing Tips

- Use `jailbreak:meta` (single-turn), `jailbreak:hydra` (multi-turn), and `jailbreak:composite` as the default strategies, unless you have a specific need for other strategies

## SEO Best Practices

### Technical Depth with Keywords

- "How It Works" sections include technical processes and terminology
- Include brand terms naturally (e.g., "Promptfoo's evaluation framework")
- Use domain-specific keywords that developers actually search for
- Maintain clean prose while incorporating search-optimized language

### Content Format Guidelines

- Convert bullet-heavy sections to prose where appropriate for better readability
- Use tables for comparison and quick reference
- Structure FAQ answers as complete, standalone explanations
- Include cross-references to related concepts and plugins

## Anti-Patterns to Avoid

- Verbose, LLM-generated explanations
- Repetitive content across related pages
- Generic examples that don't illustrate the specific plugin
- Bullet point overuse where prose would be clearer
- Missing SEO opportunities in favor of brevity
- Prescriptive test scenarios that limit user flexibility
