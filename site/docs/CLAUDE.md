# Documentation Site

**What this is:** Docusaurus-based documentation deployed to [promptfoo.dev](https://www.promptfoo.dev/).

## 🎯 Making Documentation Changes

**MOST UPDATES SHOULD BE VERY SMALL** - typically 1-5 line changes.

### Before Making Changes

**ALWAYS search for existing documentation first:**

```bash
# Search for relevant docs about the topic
grep -r "provider" site/docs/providers/
grep -r "red team" site/docs/red-team/

# Find the right file to update
find site/docs -name "*openai*"
find site/docs -name "*jailbreak*"
```

### Update Strategy

1. **Search first** - Find existing documentation on the topic
2. **Small edits** - Fix typos, add clarifications, update examples
3. **Don't rewrite** - Improve existing content incrementally
4. **Don't create new files** unless absolutely necessary
5. **Check for duplicates** - Ensure info isn't already documented elsewhere

### Common Update Patterns

```bash
# Updating model names (very common)
# Find: openai:gpt-4
# Replace: openai:gpt-5

# Fixing terminology
# Find: evaluation
# Replace: eval

# Adding missing step to existing guide
# Add 1-2 lines to existing numbered list
```

## Critical Terminology

**Use "eval" not "evaluation":**
```bash
# ✅ Correct
npx promptfoo eval

# ❌ Wrong
npx promptfoo evaluation
```

**Capitalization:**
- "Promptfoo" (capital) - Start of sentences, headings
- "promptfoo" (lowercase) - Code, commands, package names

## Quick Context

- Markdown/MDX files in `site/docs/`
- Built with Docusaurus
- Front matter required: `title`, `description`
- Code blocks only get `title=` if complete runnable files
- Admonitions need empty lines around content (Prettier requirement)

## Key Principles

1. **Minimal edits** - Don't rewrite, improve incrementally
2. **Don't modify headings** - Often externally linked
3. **Progressive disclosure** - Essential info first
4. **Action-oriented** - Imperative mood ("Install the package")

## Development

```bash
cd site
npm run dev  # http://localhost:3000

# Skip OG images for faster builds
SKIP_OG_GENERATION=true npm run build
```

## Comprehensive Guidelines

See `.cursor/rules/docusaurus.mdc` for complete documentation standards including:
- Front matter requirements
- Code block formatting rules
- Admonition syntax
- SEO best practices
- Writing style guidelines
