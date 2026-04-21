# Red Team Testing

**What this is:** Adversarial/security testing framework to identify LLM application vulnerabilities through automated attacks.

## Architecture

```
src/redteam/
├── plugins/      # Vulnerability-specific test generators
│   ├── pii.ts             # PII leakage detection
│   ├── harmful.ts         # Harmful content generation
│   ├── sql-injection.ts   # SQL injection attempts
│   └── ...
├── strategies/   # Attack transformation techniques
│   ├── jailbreak.ts       # Guardrail bypass attempts
│   ├── prompt-injection.ts
│   ├── base64.ts         # Obfuscation strategies
│   └── ...
└── graders.ts    # Response evaluation logic
```

## Key Concepts

**Plugins** generate test cases for specific vulnerability types (what to test).

**Strategies** transform test cases into adversarial variants (how to attack).

**Graders** evaluate if attacks succeeded (did it work?).

## Plugin vs Strategy

```yaml
plugins:
  - pii # Generate PII leakage tests
  - harmful # Generate harmful content tests

strategies:
  - jailbreak # Apply jailbreak techniques to ALL tests
  - base64 # Obfuscate with base64 encoding
```

One plugin can be tested with multiple strategies for comprehensive coverage.

## Generation and Strategy QA

When changing redteam generation, trace the full path before editing: `src/redteam/commands/generate.ts`, `src/redteam/index.ts`, `src/redteam/plugins/index.ts`, plugin `generateTests`, strategies, and iterative providers such as meta, hydra, and crescendo.

Evaluate generated cases for diversity, realism, coverage, and failure modes. For agent redteams, include coding-agent risks, connectors, sandboxing, traces, raw provider events, changed files, canaries, and sidecar evidence where available.

## Public Documentation

Redteam behavior is user-facing. When changing plugins, strategies, generated config,
grading, or reports, update the matching pages under `site/docs/red-team/`.

## Logging

See `docs/logging.md` - especially important here since test content may contain harmful/sensitive data.

## Adding New Plugins

1. Implement `RedteamPluginObject` interface
2. Generate targeted test cases for vulnerability
3. Include assertions defining failure conditions
4. Add tests in `test/redteam/`

See `src/redteam/plugins/pii.ts` for reference pattern.

## Plugin/Grader Standards

**CRITICAL:** All graders must use standardized tags per `.claude/skills/redteam-plugin-development/skill.md`

Quick reference:

- User prompt: `<UserQuery>{{prompt}}</UserQuery>` (NOT `<UserPrompt>`, `<UserInput>`, or `<prompt>`)
- Purpose: `<purpose>{{purpose}}</purpose>`
- Entities: `<AllowedEntities>` with `<Entity>` children

See `src/redteam/plugins/harmful/graders.ts` for reference implementation.

## Risk Scoring

Results include severity levels:

- `critical` - PII leaks, SQL injection
- `high` - Jailbreaks, prompt injection, harmful content
- `medium` - Bias, hallucination
- `low` - Overreliance
