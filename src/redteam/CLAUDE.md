# Red Team Testing

**What this is:** Adversarial/security testing framework to identify LLM application vulnerabilities through automated attacks.

## 🚨 CRITICAL: Defensive Use Only

This code is for **DEFENSIVE security testing ONLY:**

- ✅ Test YOUR OWN applications for vulnerabilities
- ✅ Validate safety guardrails work correctly
- ✅ Identify and fix security issues
- ❌ **NEVER** test applications you don't own
- ❌ **NEVER** use for offensive purposes
- ❌ **NEVER** weaponize discovered vulnerabilities

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
  - pii           # Generate PII leakage tests
  - harmful       # Generate harmful content tests

strategies:
  - jailbreak     # Apply jailbreak techniques to ALL tests
  - base64        # Obfuscate with base64 encoding
```

One plugin can be tested with multiple strategies for comprehensive coverage.

## Security Requirements

**Always sanitize when logging** (test content may be harmful/sensitive):

```typescript
logger.debug('[RedTeam] Test result', {
  prompt: testCase.prompt,    // May contain exploits
  output: response.output,    // May contain harmful content
});
```

Second parameter is auto-sanitized.

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

## Ethical Guidelines

- Report vulnerabilities responsibly
- Use for defensive improvement only
- Document and fix identified issues
- Never share exploit techniques publicly
