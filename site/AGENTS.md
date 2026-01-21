# Documentation Site

Docusaurus-based documentation at [promptfoo.dev](https://www.promptfoo.dev/).

**Key rules:**

- Don't start your own dev server for the site (ask user first)
- Don't edit `CHANGELOG.md` (auto-generated)
- **Commits:** Always use `docs(site):` scope for all site changes (docs, pages, components, plugins, styles)

## Key Principles

1. **Small edits** - Most updates should be 1-5 lines
2. **Search first** - Find existing docs before creating new ones
3. **Don't rewrite** - Improve incrementally
4. **Don't modify headings** - Often externally linked
5. **No fluff** - Avoid embellishment words like "sophisticated"

## Before Making Changes

```bash
# Search for existing docs
grep -r "topic" site/docs/
find site/docs -name "*keyword*"
```

## Terminology

- Use "eval" not "evaluation" in commands
- "Promptfoo" when referring to the company or product, "promptfoo" when referring to the CLI command or in code

## Front Matter (Required)

```markdown
---
title: Page Title (under 60 chars)
description: Summary (150-160 chars)
sidebar_position: 3
---
```

## Code Blocks

- Add `title="filename.yaml"` only for complete, runnable files
- No titles for code fragments
- Use `// highlight-next-line` for emphasis
- Never remove existing highlight directives

## Admonitions

```markdown
:::note
Content with empty lines around it.
:::
```

Types: `note`, `warning`, `danger`

## Development

```bash
cd site
npm run dev                            # localhost:3000
SKIP_OG_GENERATION=true npm run build  # Faster builds
```

## Anti-Patterns

- Verbose, LLM-generated explanations
- Repetitive content across pages
- Generic examples
- Bullet overuse where prose is clearer

## Red Team Docs

See `site/docs/red-team/AGENTS.md` for red-team specific documentation guidelines.
