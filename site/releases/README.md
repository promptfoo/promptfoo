# Release Notes Guidelines

This directory contains release notes for promptfoo. Release notes are published automatically to the `/releases/` section of the website.

## File Naming Convention

Release note files should follow this naming pattern:
```YYYY-MM-DD-vX.Y.Z.md
```

Examples:
- `2025-01-15-v0.70.0.md`
- `2025-02-03-v0.70.1.md`
- `2025-03-10-v0.71.0.md`

## Front Matter Template

Each release note must include proper front matter:

```yaml
---
slug: vX.Y.Z
title: promptfoo vX.Y.Z
description: Brief description of key changes in this release
authors: [promptfoo_team]
tags: [release, feature1, feature2, bugfix]
image: /img/releases/vX.Y.Z-banner.png  # Optional
date: YYYY-MM-DDTHH:MM
---
```

## Content Structure

Follow this structure for consistent release notes:

1. **Title and Introduction** - Brief overview of the release
2. **<!-- truncate -->** - Docusaurus blog truncation marker
3. **🚀 New Features** - Major new functionality
4. **🐛 Bug Fixes** - Important fixes with issue links
5. **🔧 Improvements** - Enhancements and optimizations
6. **⚠️ Breaking Changes** - Any breaking changes with migration guidance
7. **📦 Installation** - Installation/upgrade instructions
8. **🙏 Community Contributions** - Thank contributors
9. **What's Next** - Preview of upcoming features

## Writing Guidelines

### Use Clear Headings
- Use descriptive section headings with emojis for visual appeal
- Organize content by impact (features > fixes > improvements)

### Include Code Examples
When showing configuration changes or new features:

```yaml title="promptfooconfig.yaml"
# Example configuration
```

### Link to Resources
- Link to relevant documentation
- Include GitHub issue numbers for bug fixes
- Reference migration guides for breaking changes

### Breaking Changes
Always include migration guidance for breaking changes:

```markdown
:::tip Migration Helper

Run `npx promptfoo@latest config migrate` to automatically update your configuration files.

:::
```

### Performance Claims
Include specific metrics when mentioning performance improvements:
- "40% faster evaluation runs"
- "25% reduction in memory usage"

## Best Practices

### SEO Optimization
- Write descriptive titles and descriptions
- Use relevant tags
- Include keywords naturally

### Community Focus
- Thank contributors by name with GitHub links
- Highlight community-requested features
- Include links to community resources (Discord, GitHub)

### Forward-Looking
- End with "What's Next" section
- Build excitement for future releases
- Encourage community engagement

## Publishing Process

1. Create the release note file in this directory
2. Add high-quality banner image to `/static/img/releases/` (optional)
3. Commit and push to the main branch
4. The release note will automatically appear at `/releases/`

## RSS Feed

Release notes are automatically included in the RSS feed at `/releases/rss.xml`, allowing users to subscribe to updates.

## Authors

Update the `authors.yml` file to add new team members who will be authoring release notes.

---

For questions about release notes, reach out to the documentation team or refer to the [Docusaurus documentation guidelines](https://docusaurus.io/docs/blog). 