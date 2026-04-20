# Redteam Plugins

See `.claude/skills/redteam-plugin-development/skill.md` for full standards.

## Quick Tag Reference

| Correct       | Incorrect                                 |
| ------------- | ----------------------------------------- |
| `<UserQuery>` | `<UserPrompt>`, `<UserInput>`, `<prompt>` |

## Key Files

- Base classes: `base.ts` (RedteamPluginBase, RedteamGraderBase)
- Reference graders: `harmful/graders.ts`

Plugin behavior changes should update the matching page in
`site/docs/red-team/plugins/` and keep `site/docs/red-team/plugins/index.md` accurate.
