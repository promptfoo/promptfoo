# Git Workflow

## Critical Rules

1. **NEVER** commit directly to main
2. **NEVER** merge branches into main directly
3. **NEVER** push to main - EVER
4. **NEVER** use `--force` without explicit approval
5. **ALWAYS** create new commits - never amend or rebase unless explicitly asked

**Forbidden commands:**

- `git push origin main`
- `git merge feature-branch` while on main
- Any direct commits to main

All changes to main MUST go through pull requests.

## Commit Policy

**"Explicitly asked"** = user says "amend", "squash", "rebase", or "fix up the commit".

"Looks good" or "go ahead" is NOT permission to rewrite history.

## Standard Workflow

### 1. Create Feature Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/your-branch-name
```

### 2. Make Changes and Commit

```bash
git add <specific-files>    # NEVER blindly add everything
git commit -m "type(scope): description"
```

See `docs/agents/pr-conventions.md` for commit message format.

### 3. Lint and Format

```bash
npm run l    # Lint changed files
npm run f    # Format changed files
```

Fix any errors before proceeding.

### 4. Sync with Main

```bash
git fetch origin main
git merge origin/main
```

Resolve any conflicts before pushing.

### 5. Push and Create PR

```bash
git push -u origin feature/your-branch-name
gh pr create --title "type(scope): description" --body "PR description"
```

### 6. Wait for Review

Wait for CI checks to pass and code review approval before merging.

## Key Points

- **Never blindly `git add .`** - there may be unrelated files
- **Always sync with main** before creating PR to avoid conflicts
- **Don't edit CHANGELOG.md** - it's auto-generated
