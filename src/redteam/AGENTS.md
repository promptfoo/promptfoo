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

## Logging

See `docs/logging.md` - especially important here since test content may contain harmful/sensitive data.

## Adding New Plugins

1. Implement `RedteamPluginObject` interface
2. Generate targeted test cases for vulnerability
3. Include assertions defining failure conditions
4. Add tests in `test/redteam/`

See `src/redteam/plugins/pii.ts` for reference pattern.

## Risk Scoring

Results include severity levels:

- `critical` - PII leaks, SQL injection
- `high` - Jailbreaks, prompt injection, harmful content
- `medium` - Bias, hallucination
- `low` - Overreliance
