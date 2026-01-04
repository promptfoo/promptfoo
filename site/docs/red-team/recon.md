---
sidebar_position: 11
sidebar_label: Codebase Recon
title: Codebase Reconnaissance
description: Automatically analyze source code to generate red team configurations by extracting system prompts, tools, and security context from your LLM application
---

# Codebase Reconnaissance

The `recon` command uses an AI agent to analyze your application's source code and automatically generate a red team configuration. This **white-box** approach extracts system prompts, discovers tools, identifies security boundaries, and suggests relevant attack plugins—all without manual configuration.

## What You Get

- **Complete `promptfooconfig.yaml`** ready to run with minimal edits
- **Discovered system prompts** embedded in your codebase
- **LLM-callable tools/functions** mapped as attack vectors
- **Plugin recommendations** matched to your application's attack surface
- **Entities for social engineering** (company names, people, data formats)

:::tip Black-box alternative
For testing deployed systems without code access, see [Target Discovery](/docs/red-team/discovery/).
:::

---

## Data Handling and Privacy

Recon sends portions of your source code to AI model providers for analysis. Understanding what data flows where is critical for security-conscious teams.

### What Recon Reads Locally

- Source files (`.js`, `.ts`, `.py`, etc.) excluding configured patterns
- Configuration files (`package.json`, `README.md`, entry points)
- Never reads `.env` files (excluded by default)

### What Gets Sent to Providers

The AI agent reads file contents and sends relevant excerpts to the configured model provider (OpenAI or Anthropic) for analysis. This includes:

- Code snippets containing LLM integrations, prompts, and tool definitions
- File structure and naming patterns
- README and documentation content

### What Gets Stored Locally

| Output           | Location                                    | Purpose                                   |
| ---------------- | ------------------------------------------- | ----------------------------------------- |
| Generated config | `promptfooconfig.yaml` (or `--output` path) | Red team configuration                    |
| Pending UI state | `~/.promptfoo/pending-recon.json`           | Browser handoff (auto-deleted after load) |

No code or analysis results are sent to Promptfoo's servers. All processing happens between your machine and your configured AI provider.

### Safe Usage Checklist

Before running recon on sensitive codebases:

- [ ] Run on a sanitized checkout without production secrets
- [ ] Use `--exclude` to skip directories containing credentials or proprietary algorithms
- [ ] Verify your organization permits sending code to third-party AI providers
- [ ] Review the generated config before committing (may contain extracted prompts)

---

## Quickstart

**Goal**: Generate a red team config and open the UI with it pre-populated.

1. **Start the server** (enables browser handoff):

   ```bash
   promptfoo view
   ```

2. **Run recon** on your application:

   ```bash
   promptfoo redteam recon --dir ./my-llm-app
   ```

3. **Review in browser** — recon automatically opens the setup page with discovered context

4. **Configure target endpoint** — edit the `TODO` placeholder URL

5. **Run red team**:
   ```bash
   promptfoo redteam run
   ```

That's it. For CI/CD or scripted workflows, add `--yes --no-open` to skip prompts and browser launch.

---

## Prerequisites

### API Keys

You need at least one of:

| Provider                     | Environment Variable                | Recommended Model                |
| ---------------------------- | ----------------------------------- | -------------------------------- |
| OpenAI (Codex SDK)           | `OPENAI_API_KEY` or `CODEX_API_KEY` | `gpt-5.2-codex`                  |
| Anthropic (Claude Agent SDK) | `ANTHROPIC_API_KEY`                 | SDK default (override with `-m`) |

Model defaults may change. See [OpenAI Codex SDK](/docs/providers/openai-codex-sdk/) and [Claude Agent SDK](/docs/providers/claude-agent-sdk/) for current defaults and configuration options.

### Agent Capabilities

The recon agent has limited, read-only access to your codebase:

| Capability        | Status | Notes                                        |
| ----------------- | ------ | -------------------------------------------- |
| File read         | Yes    | Reads source files matching include patterns |
| File write        | No     | Only writes the output config file           |
| Command execution | No     | Cannot run scripts or commands               |
| Network access    | No     | Disabled by default in Codex SDK             |
| Web search        | No     | Disabled by default                          |

The agent cannot modify your code, execute commands, or access external systems.

:::note Cost Consideration
Recon uses advanced AI models for code analysis. Large codebases may incur significant API costs. Use `--exclude` patterns to limit scope.
:::

---

## Configuration Output

Recon generates a complete `promptfooconfig.yaml`. Here's an annotated example from analyzing a medical assistant:

```yaml
# Auto-generated description from discovered app purpose
description: Red team config for: MediAssist medical assistant chatbot...

targets:
  - id: http
    config:
      # You must configure this before running
      url: 'TODO: Configure your target endpoint'
      method: POST
      body:
        prompt: '{{prompt}}'

redteam:
  # Detailed context helps generate relevant attack scenarios
  purpose: |
    Application Purpose:
    MediAssist is a medical assistant chatbot...

    Key Features and Capabilities:
    Look up patients, schedule visits, process payments...

  plugins:
    # Extracted system prompt enables prompt-extraction attacks
    - id: prompt-extraction
      config:
        systemPrompt: 'You are MediAssist, an AI medical assistant...'
    # PII plugins: app handles patient data
    - pii:direct
    - pii:session
    # Medical domain plugins: healthcare-specific risks
    - medical:hallucination
    - medical:incorrect-knowledge
    # Access control plugins: multi-role system detected
    - rbac
    - bola
    - harmful:specialized-advice

  strategies:
    - basic
    # Single-turn jailbreaks
    - id: jailbreak:meta
    - id: jailbreak:composite
    # Multi-turn strategies: app is stateful (maintains conversation)
    - id: jailbreak:hydra
      config:
        maxTurns: 5
    - id: crescendo
      config:
        maxTurns: 10
    - id: goat
      config:
        maxTurns: 5

  # Real entities for realistic social engineering scenarios
  entities:
    - Springfield Medical Center
    - MediAssist
    - Dr. Sarah Chen
    - Blue Cross Blue Shield
```

**Key customizations you may want**:

- Remove plugins not relevant to your threat model
- Adjust `maxTurns` for multi-turn strategies (higher = more thorough, more cost)
- Add custom entities specific to your organization

---

## CLI Reference

### Basic Usage

```bash
# Scan current directory
promptfoo redteam recon

# Scan specific directory
promptfoo redteam recon --dir ./path/to/app

# CI/CD mode (no prompts, no browser)
promptfoo redteam recon --dir ./app --yes --no-open
```

### Options

| Option                    | Description                                               |
| ------------------------- | --------------------------------------------------------- |
| `-d, --dir <path>`        | Directory to scan (default: current directory)            |
| `-o, --output <path>`     | Output config file path (default: `promptfooconfig.yaml`) |
| `--provider <provider>`   | Force provider: `openai` or `anthropic`                   |
| `-m, --model <model>`     | Override default model                                    |
| `-y, --yes`               | Skip confirmation prompts                                 |
| `--no-open`               | Don't open browser after analysis                         |
| `--exclude <patterns...>` | Additional glob patterns to exclude                       |
| `--verbose`               | Show detailed analysis progress                           |
| `--env-file <path>`       | Load environment variables from file                      |

### Excluding Files

By default, recon excludes:

- `node_modules/`, `.git/`, `dist/`, `build/`
- `.env*` files (to avoid scanning secrets)
- Existing promptfoo configs
- Test coverage directories

Add custom exclusions:

```bash
promptfoo redteam recon --exclude "*.test.ts" --exclude "fixtures/**"
```

---

## Web UI Integration

When recon completes, it opens the red team setup page with discovered context pre-populated.

### Application Details Page

The page displays a **Recon Summary Banner** showing analysis metadata and security observations:

![Recon summary banner with security observations](/img/docs/setup/application-details.png)

- **Recon Summary Banner**: Directory scanned, files analyzed, fields populated, tools discovered
- **Security Observations**: Code-level issues that inform plugin selection (e.g., plaintext credentials, exposed PII)
- **Pre-filled Forms**: All application definition fields populated from analysis

:::note
Security observations are best-effort hints for prioritizing red team scenarios, not a comprehensive code security audit. For deeper vulnerability detection, see [Code Scanning](/docs/code-scanning/).
:::

### Review Page

Navigate to the **Review** tab to see all populated plugins and strategies:

![Review tab with populated plugins and strategies](/img/docs/setup/review.png)

From here:

1. Review the application context
2. Adjust plugins and strategies if needed
3. Configure your target endpoint (required)
4. Click "Run Red Team" to start testing

### Server Not Running

If the promptfoo server isn't running when recon completes:

- Config file is still written to disk
- Browser may open to an error page
- Start the server with `promptfoo view`, then navigate to `/redteam/setup?source=recon`

---

## How It Works

The recon agent analyzes your codebase in four phases:

![Recon workflow](/img/docs/recon-flow.svg)

1. **Application Understanding**: Reads README, package.json, and entry points to understand purpose and user types
2. **LLM Integration Discovery**: Finds system prompts, tools/functions, guardrails, and determines statefulness
3. **Attack Surface Mapping**: Identifies connected systems, user roles, forbidden topics, and sensitive data
4. **Entity Extraction**: Extracts company names, people, and data formats for realistic attack scenarios

The agent outputs a complete config with populated purpose, suggested plugins, appropriate strategies, and extracted entities.

---

## Recon vs Discovery

| Aspect       | Recon (this page)                    | [Discovery](/docs/red-team/discovery/) |
| ------------ | ------------------------------------ | -------------------------------------- |
| **Approach** | White-box (code analysis)            | Black-box (runtime probing)            |
| **Input**    | Source code directory                | Running target endpoint                |
| **When**     | Pre-deployment, during development   | Post-deployment, external testing      |
| **Finds**    | System prompts, tools, code patterns | Purpose, limitations from responses    |
| **Output**   | Complete `promptfooconfig.yaml`      | Text for `purpose` field               |

Use **recon** when you have code access. Use **discovery** when testing a deployed system as a black box.

---

## Troubleshooting

### "No pending recon configuration found"

The web UI can't find the pending config. This happens if:

- Recon failed before writing the pending file
- The pending file was already consumed
- You navigated directly to the URL without running recon

**Solution**: Run `promptfoo redteam recon` again.

### API rate limit or timeout errors

Large codebases may hit API limits.

**Solutions**:

- Use `--exclude` to skip test files and fixtures
- Try a different provider with `--provider`
- Break analysis into smaller directories

### Missing API key error

```
Error: No API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.
```

**Solution**: Set an API key or use `--env-file`:

```bash
promptfoo redteam recon --env-file .env
```

### Browser doesn't open

Some environments (SSH, containers) can't open browsers.

**Solution**: Use `--no-open` and open manually:

```bash
promptfoo redteam recon --no-open
# Then open: http://localhost:3000/redteam/setup?source=recon
```

---

## See Also

- [Target Discovery](/docs/red-team/discovery/) — Black-box target analysis
- [Configuration](/docs/red-team/configuration/) — Full config reference
- [Plugins](/docs/red-team/plugins/) — Available attack plugins
- [Strategies](/docs/red-team/strategies/) — Attack delivery techniques
- [Code Scanning](/docs/code-scanning/) — Deep vulnerability detection
