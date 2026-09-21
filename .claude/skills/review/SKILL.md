---
name: review
description: Review Promptfoo changes with the bundled Claude reviewer and the repository's root and scoped AGENTS.md conventions. Invoke explicitly for local diffs, branches, paths, or pull requests.
argument-hint: '[low|medium|high|max] [target]'
disable-model-invocation: true
---

# Promptfoo code review

Review request: $ARGUMENTS

This command is a read-only, local review. Do not edit files, commit changes, or post to GitHub.

1. Check the options before running any reviewer. If the caller requests `ultra`, `--fix`, or `--comment` (including `--fix=…` or `--comment=…`), stop without invoking a skill, editing, or posting. Tell them to invoke `/code-review` directly with their original options from a Claude session started at the Git root. The direct command handles hosted `ultra` when available and explicitly requested writes or posts; it does not include this repository's independent `AGENTS.md` pass. Offer to run this read-only `/review` first or separately. Never pass those options into the Skill tool or silently substitute a local review for `ultra`.

2. Resolve the target once, from the Git root, for both the ordinary code review and the conventions pass:
   - With no explicit target (an effort level alone is not a target), include the committed diff from the first available base: `@{upstream}...HEAD`, then `main...HEAD`, then `HEAD~1...HEAD`. Also include all staged and unstaged changes relative to `HEAD` and all non-ignored untracked files (`git ls-files --others --exclude-standard`) as additions. If this is an initial commit with no usable base, treat the tracked files in `HEAD` as additions. Keep the committed range even when the working tree is clean.
   - For an explicit PR or branch/ref, determine that target's base, head, and changed files; exclude unrelated local changes. For a local path, use the same default committed range plus staged, unstaged, and non-ignored untracked changes restricted to that path, unless the caller specifies a different comparison. Record the resolved range or PR, any local tracked changes, and the untracked paths before starting either pass; use the same list for both.

3. Run the bundled Claude reviewer through the Skill tool as `code-review`, never `review`. Include the safe effort/target arguments and an explicit description of the resolved range, any local tracked changes, and untracked paths; request ordinary correctness review of every listed file, treating untracked files as additions. Project skills with the same name override the bundled reviewer: check the listed skills and, when started below the Git root, the session's ancestor `.claude/skills/code-review/SKILL.md` and `.claude/commands/code-review.md` files before delegating. This repository contains such an override under `examples/claude-agent-sdk/skills/sample-project/`. If a user/project `code-review` overrides the bundled skill, its provenance cannot be established, or it is unavailable, do not invoke that skill. Perform an ordinary security and correctness review yourself, disclose that the bundled pass was unavailable, and recommend starting a Claude session at the Git root when a nested project caused the collision. In all cases, independently check untracked files for ordinary code bugs as well as conventions; the bundled reviewer's default Git diff cannot show them.

4. For the independent conventions pass, read the repository-root `AGENTS.md` and every ancestor-directory `AGENTS.md` that applies to each file in the same resolved target. For a PR or branch/ref not checked out, read the guides from that target's head (using Git objects or the remote provider), not the current checkout; if the change deletes an applicable guide, use its base version for deleted material when needed. For local changes, use the applicable working-tree guides. A directory's instructions apply only at or below that directory; more specific instructions take precedence if they conflict. Report concrete violations introduced or materially worsened by the diff; cite the changed file and line together with the applicable `AGENTS.md` path and rule. Follow the root review priorities, including security, correctness, and meaningful tests. Do not infer conventions from a missing file or report style already enforced by repository tooling.

5. Combine and deduplicate the ordinary and conventions findings. Present actionable findings in priority order with concise evidence. If no findings remain, say so and mention any material verification limits.
