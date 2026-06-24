# Promptfoo Codex Local Environment Design

## Context

Codex creates new worktrees in directories that do not share the source checkout's installed dependencies or active Node.js version. Promptfoo requires the Node.js version declared in `.nvmrc` and a lockfile-clean npm install before its development, test, typecheck, and build commands can run reliably.

Codex local environments provide a repository-owned setup script for new worktrees and toolbar actions for common project commands. Codex discovers these definitions from `.codex/environments/*.toml`.

## Goals

- Prepare each Codex-created Promptfoo worktree with the repository's Node.js version and exact locked dependencies.
- Expose the common development, test, build, and typecheck commands as Codex toolbar actions.
- Keep worktree creation faster by leaving the full build as an explicit action.
- Store the environment in the repository so it can be shared by Promptfoo contributors.

## Non-goals

- Install NVM, Node.js, or npm on a developer's machine.
- Copy ignored secrets such as `.env` into new worktrees.
- Run a full build or test suite during every worktree setup.
- Change Promptfoo's existing npm scripts or dependency files.

## Design

Add `.codex/environments/environment.toml` using Codex local-environment schema version 1 and the environment name `promptfoo`.

The default setup script runs `npm ci`. A macOS override sources the user's NVM installation, selects the version in Promptfoo's `.nvmrc`, and then runs `npm ci`. This matches Promptfoo's documented development setup on the current macOS workstation while retaining a portable default for hosts that already expose the correct Node.js and npm versions.

The environment defines these actions:

| Action    | Command         | Icon   | Purpose                                         |
| --------- | --------------- | ------ | ----------------------------------------------- |
| Dev       | `npm run dev`   | `run`  | Start the Promptfoo server and web app.         |
| Test      | `npm test`      | `test` | Run the Vitest test suite.                      |
| Build     | `npm run build` | `run`  | Build the core package and web app.             |
| Typecheck | `npm run tsc`   | `test` | Run TypeScript checking without emitting files. |

Codex runs actions from the repository root in its integrated terminal. The environment established by setup makes the selected Node.js installation available to those actions.

## Failure behavior

Setup stops if NVM cannot be loaded on macOS, the `.nvmrc` version is unavailable, or `npm ci` fails. A failed dependency install must remain visible rather than falling back to `npm install`, because fallback installation could drift from `package-lock.json` and produce misleading verification results.

Actions return the underlying npm command's exit code and do not hide failures.

## Validation

- Parse the TOML with a standards-compliant TOML parser.
- Confirm the file satisfies Codex's version-1 local-environment schema and supported action icons.
- Run the macOS setup script from the repository root.
- Confirm setup leaves tracked dependency files unchanged.
- Confirm the environment appears in the repository diff with only the approved configuration and design documentation.
