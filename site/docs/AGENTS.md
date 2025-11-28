# Documentation Site

**What this is:** Docusaurus-based documentation deployed to [promptfoo.dev](https://www.promptfoo.dev/).

## Making Documentation Changes

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

## Key Principles

1. **Minimal edits** - Don't rewrite, improve incrementally
2. **Don't modify headings** - Often externally linked
3. **Progressive disclosure** - Essential info first
4. **Action-oriented** - Imperative mood ("Install the package")
5. **No bullshit** - Never use embellishment words like "sophisticated"

## Terminology

**Use "eval" not "evaluation":**

```bash
# Correct
npx promptfoo eval

# Wrong
npx promptfoo evaluation
```

**Capitalization:**

- "Promptfoo" (capital) - Start of sentences, headings
- "promptfoo" (lowercase) - Code, commands, package names

## Front Matter (Required)

Every documentation page needs front matter:

```markdown
---
title: Configuring Promptfoo for Multiple Models
description: Learn how to set up evaluations across different LLM providers
sidebar_position: 3
---
```

- `title` - Page title (under 60 characters for SEO)
- `description` - Summary (150-160 characters)
- `sidebar_position` - Order in sidebar navigation

## Code Block Formatting

### Titles

**Only add titles to complete, runnable files:**

```yaml title="promptfooconfig.yaml"
# Complete YAML configuration file
description: Basic evaluation setup
prompts:
  - file://prompts/my-prompt.txt
providers:
  - openai:responses:gpt-5.1
```

**No titles for code fragments:**

```yaml
# YAML fragment - no title
prompts:
  - 'What is the capital of {{country}}?'
```

### Highlighting

Use comment directives to highlight lines:

```javascript
// highlight-next-line
const result = calculateScore(input);
console.log(result);
```

Or highlight ranges:

```javascript
function example() {
  // highlight-start
  const a = 1;
  const b = 2;
  return a + b;
  // highlight-end
}
```

**Never remove existing highlight directives when editing.**

## Admonitions

Use callout blocks for important information:

```markdown
:::note

Some **content** with _Markdown_ `syntax`.

:::

:::warning

Important caution message.

:::

:::danger

Critical warning.

:::
```

**Always include empty lines around content inside admonitions** (Prettier requirement).

## Writing Style

- Clear, concise language
- Write for international audience (avoid idioms)
- Spell out acronyms on first use
- Active voice over passive voice
- User-centric: lead with what users need to accomplish

## Development

```bash
cd site
npm run dev  # http://localhost:3000

# Skip OG images for faster builds
SKIP_OG_GENERATION=true npm run build
```

## Anti-Patterns to Avoid

- Verbose, LLM-generated explanations
- Repetitive content across pages
- Generic examples that don't illustrate the specific feature
- Bullet point overuse where prose would be clearer
- Prescriptive test scenarios that limit user flexibility
