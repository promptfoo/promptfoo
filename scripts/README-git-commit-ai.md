# Git Commit AI

Fast utilities to generate conventional commit messages using OpenAI's o4-mini model.

## Features

- Uses **o4-mini** - OpenAI's latest small reasoning model
- **Structured outputs** for consistent, valid commit messages
- Automatic detection of breaking changes
- Supports `.env` file for API key storage
- ~50ms startup time (shell script)
- Automatic clipboard copying (macOS)

## Setup

1. Set your OpenAI API key using one of these methods:

   **Option A:** Environment variable

   ```bash
   export OPENAI_API_KEY="your-api-key-here"
   ```

   **Option B:** Create a `.env` file in the parent directory

   ```bash
   # In ../.env (one directory up from scripts)
   OPENAI_API_KEY=your-api-key-here
   ```

2. Choose your preferred version:
   - `git-commit-ai.sh` - Shell script (fastest startup, ~50ms)
   - `git-commit-ai.js` - Node.js script (better error handling, ~150ms)

## Usage

Run the script when you have changes in your git repository:

```bash
# Using shell script (fastest)
./scripts/git-commit-ai.sh

# Using Node.js script
./scripts/git-commit-ai.js

# Or add to your PATH for global usage
ln -s $(pwd)/scripts/git-commit-ai.sh /usr/local/bin/git-commit-ai
```

The script will:

1. Check for staged changes (git diff --cached)
2. Fall back to unstaged changes if none are staged
3. Send the diff to o4-mini to generate a structured commit message
4. Output the message and copy it to clipboard (macOS only)

## Example

```bash
$ git add src/utils/auth.js
$ ./scripts/git-commit-ai.sh
feat(auth): add JWT token validation middleware

✓ Copied to clipboard
```

## Commit Message Format

The tool generates strict conventional commits with:

- **Type**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`
- **Scope** (optional): Component or module name
- **Description**: Present tense, under 50 characters
- **Breaking changes**: Automatically detected and marked with `!`

### Structured Output

Using o4-mini's structured outputs feature, the tool ensures:

- Valid commit types only
- Consistent formatting
- Automatic breaking change detection
- No extraneous text or explanations

## Model Details

**o4-mini** specifications:

- Context window: 200,000 tokens
- Max output: 100,000 tokens
- Cost: $1.10/1M input tokens, $4.40/1M output tokens
- Optimized for coding and reasoning tasks

## Performance

- Shell script: ~50-100ms startup + API call time
- Node.js script: ~150-200ms startup + API call time
- API calls with o4-mini: typically 800-1500ms
- Total time: Usually under 2 seconds from command to result

## Tips

1. Stage specific files for more focused commit messages
2. The tool conservatively limits diffs to 150K characters
3. Uses temperature 0.3 for consistent, predictable messages
4. Breaking changes are automatically detected when appropriate
