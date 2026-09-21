---
name: review
description: Review Promptfoo changes with the bundled Claude reviewer and the repository's root and scoped AGENTS.md conventions. Invoke explicitly for local diffs, branches, paths, or pull requests.
argument-hint: '[target and review options]'
disable-model-invocation: true
---

# Promptfoo code review

Review request: $ARGUMENTS

This is a read-only review. Do not edit files, commit changes, or post to GitHub.

1. Run the bundled Claude reviewer with the same arguments by invoking `code-review` through the Skill tool. That command still calls the bundled reviewer; do not invoke `review` from this skill. If the bundled reviewer or a requested tool is unavailable, continue the review you can perform and disclose that limitation.
2. Resolve the same target for an independent `AGENTS.md` conventions pass. With no target, review the current working-tree changes, including staged and unstaged changes; with a PR, branch, or path, limit the pass to that target. Read the repository-root `AGENTS.md` and every ancestor-directory `AGENTS.md` that applies to each changed file. A directory's instructions apply only at or below that directory; more specific instructions take precedence if they conflict.
3. Check the changed code against those instructions. Report only concrete violations introduced or materially worsened by the diff; cite the changed file and line together with the applicable `AGENTS.md` path and rule. Follow the root review priorities, including security, correctness, and meaningful tests. Do not infer conventions from a missing file or report style already enforced by repository tooling.
4. Combine and deduplicate the bundled findings and conventions findings. Present actionable findings in priority order with concise evidence. If no findings remain, say so and mention any material verification limits.
