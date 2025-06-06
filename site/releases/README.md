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
image: /img/releases/vX.Y.Z-banner.png # Optional
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

# Monthly Release Roundups Guidelines

This directory contains monthly roundups of promptfoo releases. These comprehensive summaries are published automatically to the `/releases/` section of the website and highlight key developments, major features, and important updates from each month.

## File Naming Convention

Monthly roundup files should follow this naming pattern:

```YYYY-MM-DD-month-roundup.md

```

Where the date should be the last day of the month being summarized.

Examples:

- `2025-03-31-march-roundup.md`
- `2025-04-30-april-roundup.md`
- `2025-05-31-may-roundup.md`

## Front Matter Template

Each monthly roundup must include proper front matter:

```yaml
---
slug: month-YYYY-roundup
title: Month YYYY Roundup - Descriptive Theme Title
description: Brief summary of the month's key developments (under 160 chars for SEO)
authors: [promptfoo_team]
tags: [roundup, month-yyyy, key-feature1, key-feature2, monthly-summary]
keywords: [feature1, feature2, feature3, monthly, roundup]
image: /img/releases/month-YYYY-banner.png # Optional
date: YYYY-MM-DDTHH:MM
---
```

## Content Structure

Follow this structure for consistent monthly roundups:

1. **Title and Introduction** - Overview of the month's significance and theme
2. **<!-- truncate -->** - Docusaurus blog truncation marker
3. **📊 Month YYYY By The Numbers** - Key statistics (X releases, Y features, etc.)
4. **🚀 Major Breakthroughs** - Most significant new features and capabilities
5. **🛡️ Security & Safety Advances** - Red team and safety improvements
6. **⚡ Performance & Infrastructure** - Technical improvements and optimizations
7. **🎨 Developer Experience** - UX/DX enhancements and usability improvements
8. **🐛 Critical Fixes** - Important bug fixes and stability improvements
9. **📦 Getting Started** - Installation/upgrade instructions with examples
10. **🔗 See Also** - Links to relevant documentation and resources
11. **Community Engagement** - Call to action for feedback and discussion

## Writing Guidelines

### Monthly Summary Focus

- **Aggregate multiple releases** from the month into coherent themes
- **Highlight the biggest impacts** rather than listing every minor change
- **Show progression** and how features build on each other across releases
- **Include key statistics** like "X major releases" and "Y new features"
- **Create compelling narratives** with themed titles like "The Multimodal Security Revolution"

### Use Clear Headings

- Use descriptive section headings with emojis for visual appeal
- Organize content by impact (major breakthroughs > improvements > fixes)
- Group related features from different releases into cohesive sections

### Include Code Examples

When showcasing the month's key features:

```yaml title="promptfooconfig.yaml"
# Example showing major new capabilities from the month
redteam:
  plugins:
    - new-plugin-from-this-month
  strategies:
    - breakthrough-strategy
```

### Link to Resources

- Link to relevant documentation for featured capabilities
- Include GitHub issue/PR numbers for major features when relevant
- Reference specific version numbers within the roundup text
- Cross-link between monthly roundups for feature evolution stories

### Cross-Month Continuity

Always include references to feature progression:

```markdown
:::info Building on March's Foundation

The new validation command builds on March's model scanner, creating a comprehensive quality assurance toolkit.

:::
```

### Performance Claims

Include specific metrics when mentioning performance improvements:

- "40% faster evaluation runs with server-side pagination"
- "25% reduction in memory usage across WebUI components"
- "X major releases in Y days" statistics

## Best Practices

### SEO Optimization

- Write compelling titles with clear themes ("March 2025: The Multimodal Security Revolution")
- Keep descriptions under 160 characters for optimal search results
- Use relevant tags that group related months and features
- Include keywords naturally in the content
- Add structured data with proper categories

### Community Focus

- Thank contributors by name with GitHub links for major features
- Highlight community-requested features across multiple releases
- Include links to community resources (Discord, GitHub)
- Show progression on long-running community requests
- Aggregate community contributions across the month

### Monthly Narrative

- **Create themes** that tie the month's releases together
- **Show evolution** of how features built upon each other
- **Build excitement** for what the cumulative changes enable
- **Include "looking ahead"** references to next month's focus areas

## Publishing Process

1. **Collect release data** from all releases during the target month
2. **Create thematic narrative** that ties releases together
3. **Create the monthly roundup file** in this directory following naming convention
4. **Add high-quality banner image** to `/static/img/releases/` (optional)
5. **Review for accuracy** - verify all mentioned features exist in codebase
6. **Commit and push** to the main branch
7. **The roundup will automatically appear** at `/releases/`

## Monthly Timing

- **Publish monthly roundups** within the first few days of the following month
- **Use the last day of the month** as the date in filename and front matter
- **Cover all releases** that were tagged during that calendar month

## RSS Feed

Monthly roundups are automatically included in the RSS feed at `/releases/rss.xml`, allowing users to subscribe to monthly updates.

## Authors

Update the `authors.yml` file to add new team members who will be authoring monthly roundups.

---

**Note:** These are monthly roundups, not individual release notes. For detailed version-specific changes, refer to the [GitHub releases page](https://github.com/promptfoo/promptfoo/releases) or individual release changelogs.

For questions about release roundups, reach out to the documentation team or refer to the [Docusaurus documentation guidelines](https://docusaurus.io/docs/blog).
