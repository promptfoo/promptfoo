# Documentation Writing Guidelines for Red Team Docs

This file provides guidance for writing and maintaining documentation in the site/docs/red-team directory.

Apply the [public documentation standard](../AGENTS.md) alongside these red team specifics.

## Core Writing Principles

### User-Centric Approach

- Write for developers who want to quickly understand and implement
- Lead with what the user needs to accomplish, not exhaustive feature lists
- Use concrete examples to explain concepts and procedures

### Conciseness Over Verbosity

- Eliminate LLM-generated fluff and redundant explanations
- Remove substantially redundant criteria across pages
- Keep examples focused and actionable
- Use precise, technical language without unnecessary elaboration

### Content Organization

- **Main overview pages**: High-level comparison tables linking to specific pages
- **Individual plugin pages**: Focused content with specific examples
- **Configuration**: Quick start first, then advanced options

## Source Alignment

Keep plugin pages aligned with `src/redteam/plugins/`, strategy pages aligned with
`src/redteam/strategies/`, and result interpretation aligned with current scoring and
report output.

## Technical Writing Tips

- Use `jailbreak:meta` (single-turn), `jailbreak:hydra` (multi-turn), and `jailbreak:composite` as the default strategies, unless you have a specific need for other strategies

## SEO Best Practices

### Technical Depth with Keywords

- Include "How It Works" details when they help readers configure tests or interpret results
- Use domain-specific keywords that developers actually search for
- Add content to answer a reader's question, not to repeat keywords or brand terms

### Content Format Guidelines

- Convert bullet-heavy sections to prose where appropriate for better readability
- Use tables for comparison and quick reference
- Add FAQ answers only for evidenced questions not already answered on the page
- Include cross-references to related concepts and plugins

## Anti-Patterns to Avoid

- Verbose, LLM-generated explanations
- Repetitive content across related pages
- Generic examples that don't illustrate the specific plugin
- Bullet point overuse where prose would be clearer
- Adding sections or FAQs solely for SEO
- Prescriptive test scenarios that limit user flexibility
