# Documentation TODO: `promptfoo redteam recon` Command

This file tracks documentation tasks for the static reconnaissance feature. Delete this file after the documentation PR is merged.

## New Page: `recon.md`

Create `site/docs/red-team/recon.md` with:

### Content Structure

1. **Overview**: Static codebase reconnaissance using AI agents (OpenAI Codex SDK or Claude Agent SDK)
2. **Usage**: `promptfoo redteam recon [directory]`
3. **When to use**:
   - Before deployment to understand attack surface
   - When `redteam setup` prompts feel unclear
   - To auto-generate `promptfooconfig.yaml` from codebase analysis
4. **How it works**:
   - Agent explores codebase (reads files, searches patterns)
   - Identifies system prompts, tools, API endpoints, data flows
   - Generates structured application profile
   - Suggests relevant plugins based on findings
5. **CLI Options**:
   - `--output` / `-o`: Output file path (default: `promptfooconfig.yaml`)
   - `--provider`: Force provider (`openai` or `anthropic`)
   - `--yes` / `-y`: Auto-confirm prompts
6. **Provider Requirements**:
   - OpenAI: `OPENAI_API_KEY` or `CODEX_API_KEY`
   - Anthropic: `ANTHROPIC_API_KEY`
7. **Example output**: Show sample generated config
8. **Comparison with `redteam discover`**: Static (pre-deployment) vs dynamic (runtime probing)

### Sidebar Position

- After `discovery.md` (position 11)

## Updates to Existing Pages

### `quickstart.md`

Add a tip box after "Provide application details" section:

```markdown
:::tip Automated Discovery
If you have access to the codebase, run `promptfoo redteam recon` to automatically generate application details from static analysis.
:::
```

### `discovery.md`

Add a "See also" section at the bottom:

```markdown
## See Also

- [Static Reconnaissance](/docs/red-team/recon) - Pre-deployment codebase analysis
```

### `configuration.md`

In the `purpose` field documentation, add:

```markdown
The `purpose` field can be auto-generated using `promptfoo redteam recon` for codebase analysis.
```

### `index.md` (main red-team page)

Add `recon` to the CLI commands table if one exists.

## Cross-References

- Link from `agents.md` since recon uses agentic providers
- Consider mentioning in `architecture.md` under "Discovery" phase
