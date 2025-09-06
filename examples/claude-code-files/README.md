# claude-code-files

Example of Claude Code reading and analyzing files in a working directory. This demonstrates the typical use case where Claude Code analyzes an existing codebase.

## Setup

```bash
export ANTHROPIC_API_KEY=your-key-here
npx promptfoo@latest eval
```

## What's happening?

- Claude Code reads files from the `sample-project` directory
- Analyzes the code structure and functionality
- Uses read-only permissions (safe by default)
- Shows how Claude Code can understand project context from multiple files