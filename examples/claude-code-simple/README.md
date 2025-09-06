# claude-code-simple

Simple example of Claude Code without file system access. This demonstrates the baseline functionality where Claude Code acts similarly to the regular Claude API but with potential tool use.

## Setup

```bash
export ANTHROPIC_API_KEY=your-key-here
npx promptfoo@latest eval
```

## What's happening?

- Tests Claude Code's code analysis abilities without file access
- Compares with standard Anthropic Messages API
- Shows that Claude Code works out-of-the-box with zero configuration