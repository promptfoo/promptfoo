# Git Workflow

## Critical Rules

1. NEVER commit/push directly to main
2. NEVER use `git push --force` without explicit approval
3. NEVER use `git commit --amend` without explicit approval
4. All changes go through pull requests

## Standard Workflow

```bash
# 1. Create feature branch
git checkout main
git pull origin main
git checkout -b feature/your-branch-name

# 2. Make changes and commit
git add <specific-files>  # Never blindly add everything
git commit -m "type(scope): description"

# 3. Lint and format
npm run l && npm run f

# 4. Sync with main before pushing
git fetch origin main
git merge origin/main

# 5. Push and create PR
git push -u origin feature/your-branch-name
gh pr create --title "type(scope): description" --body "..."
```

## Important Notes

- Never blindly `git add .` - check for unrelated files first
- Always run lint/format before committing
- Sync with main before creating PR to avoid conflicts
- Wait for CI checks before merging

## PR Title Format

See `docs/pr-conventions.md` for PR title conventions.
