---
sidebar_position: 11
sidebar_label: Codebase Recon
title: Codebase Reconnaissance
description: Automatically analyze source code to generate red team configurations by extracting system prompts, tools, and security context from your LLM application
---

# Codebase Reconnaissance

The `recon` command uses an AI agent to analyze your application's source code and automatically generate a red team configuration. This is a **white-box** approach that extracts system prompts, discovers tools, identifies security boundaries, and suggests relevant attack plugins.

```bash
promptfoo redteam recon --dir ./my-llm-app
```

After analysis completes, recon automatically opens the web UI with your configuration pre-populated, ready for review and execution.

## When to Use

Use `recon` when you have access to the source code and want to:

- **Bootstrap a red team config** without manually filling in application details
- **Discover system prompts** embedded in your codebase
- **Find LLM-callable tools/functions** that represent attack vectors
- **Identify sensitive data types** and security requirements from code
- **Get plugin recommendations** based on your application's attack surface

:::tip
For black-box testing of running targets (when you don't have code access), see [Target Discovery](/docs/red-team/discovery/).
:::

---

## How It Works

![Recon workflow](/img/docs/recon-flow.svg)

The recon agent analyzes your codebase in four phases:

1. **Application Understanding**: Reads README, package.json, and entry points to understand purpose and user types
2. **LLM Integration Discovery**: Finds system prompts, tools/functions, guardrails, and determines if the app is stateful or stateless
3. **Attack Surface Mapping**: Identifies connected systems, user roles, forbidden topics, and sensitive data
4. **Entity Extraction**: Extracts company names, people, and data formats for realistic attack scenarios

The agent outputs a complete `promptfooconfig.yaml` with:

- Populated `purpose` field with application context
- Suggested plugins based on discovered vulnerabilities
- Appropriate strategies (single-turn or multi-turn based on statefulness)
- Entities for social engineering attacks
- Configured `prompt-extraction` plugin with discovered system prompt

---

## Prerequisites

**API Keys**: You need at least one of:

- `OPENAI_API_KEY` or `CODEX_API_KEY` (uses gpt-5.1-codex)
- `ANTHROPIC_API_KEY` (uses opus)

**Server** (for web UI integration): Start the promptfoo server before running recon:

```bash
promptfoo view
# Or in development:
npm run dev
```

If the server isn't running, recon still writes the config file but browser handoff won't work.

:::note Cost Consideration
Recon uses advanced AI models for code analysis. Large codebases with many files may incur significant API costs. Use `--exclude` patterns to limit scope if needed.
:::

## Usage

### Basic Usage

Scan the current directory:

```bash
promptfoo redteam recon
```

Scan a specific directory:

```bash
promptfoo redteam recon --dir ./path/to/app
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
| `--verbose`               | Show additional details (key files analyzed, tool paths)  |
| `--env-file <path>`       | Load environment variables from file                      |

### Provider Selection

The command automatically selects a provider based on available API keys:

| Provider         | Required Environment Variable       | Default Model   |
| ---------------- | ----------------------------------- | --------------- |
| OpenAI Codex SDK | `OPENAI_API_KEY` or `CODEX_API_KEY` | `gpt-5.1-codex` |
| Claude Agent SDK | `ANTHROPIC_API_KEY`                 | `opus`          |

To force a specific provider:

```bash
promptfoo redteam recon --provider anthropic
```

## Example Output

Running recon on a medical assistant application:

```bash
$ promptfoo redteam recon --dir ./medical-agent

Reconnaissance target: /path/to/medical-agent
Agent can read files, search web, and take notes

Provider: openai (gpt-5.1-codex)
✔ Analysis complete

=== Reconnaissance Results ===

Purpose:
  MediAssist is a medical assistant chatbot that helps staff and patients
  manage healthcare tasks through natural-language conversations.

Features:
  Look up patients, review appointments and medications, schedule visits,
  request prescription refills, check insurance coverage, process payments.

Industry:
  Healthcare

System Prompt Found:
  You are MediAssist, an AI medical assistant for Springfield Medical Center...

Discovered Tools (11):
  - authenticate: Authenticates a staff user and sets session role
  - searchPatients: Searches for patients using fuzzy matching
  - getPatientDetails: Returns patient demographics and history
  ...

Suggested Plugins:
  prompt-extraction, pii:direct, medical:hallucination, rbac, bola

Entities:
  Springfield Medical Center, MediAssist, Dr. Sarah Chen, Blue Cross Blue Shield

Security Notes:
  - src/tools.js:34-86 authentication uses plaintext credentials
  - src/tools.js:377-470 processPayment stores card data in memory

✔ Write config to promptfooconfig.yaml? Yes

Config written to promptfooconfig.yaml

✨ Opening browser: http://localhost:3000/redteam/setup?source=recon

In the browser:
  1. Review the populated application context
  2. Configure your target endpoint
  3. Click "Run Red Team" when ready
```

The generated config includes everything needed to run a red team:

```yaml
description: Red team config for: MediAssist medical assistant chatbot...

targets:
  - id: http
    config:
      url: 'TODO: Configure your target endpoint'
      method: POST
      body:
        prompt: '{{prompt}}'

redteam:
  purpose: |
    Application Purpose:
    MediAssist is a medical assistant chatbot...

    Key Features and Capabilities:
    Look up patients, schedule visits, process payments...

  plugins:
    - id: prompt-extraction
      config:
        systemPrompt: 'You are MediAssist, an AI medical assistant...'
    - pii:direct
    - pii:session
    - medical:hallucination
    - medical:incorrect-knowledge
    - rbac
    - bola
    - harmful:specialized-advice

  strategies:
    - basic
    - id: jailbreak:meta
    - id: jailbreak:composite
    - id: jailbreak:hydra
      config:
        maxTurns: 5
    - id: crescendo
      config:
        maxTurns: 10
    - id: goat
      config:
        maxTurns: 5

  entities:
    - Springfield Medical Center
    - MediAssist
    - Dr. Sarah Chen
    - Blue Cross Blue Shield
```

---

## Web UI Integration

When recon completes, it automatically opens your browser to the red team setup page with all discovered context pre-populated.

### What You'll See

The Application Details page displays a **Recon Summary Banner** showing analysis metadata and any security observations discovered in your code:

![Recon summary banner with security observations](/img/docs/setup/application-details.png)

Key elements include:

1. **Recon Summary Banner**: Blue banner showing directory scanned, files analyzed, fields populated, and tools discovered
2. **Security Observations**: Amber warning box highlighting potential security issues found in code (e.g., plaintext credentials, exposed PII)
3. **Pre-filled Forms**: All application definition fields populated from analysis

:::tip
Security observations highlight code-level vulnerabilities that recon discovered. These inform plugin selection and help prioritize testing areas.
:::

### Navigation Flow

After loading, you're taken directly to the **Review** tab where you can review all populated plugins and strategies:

![Review tab with populated plugins and strategies](/img/docs/setup/review.png)

From here:

1. Review the populated application context
2. Adjust plugins and strategies if needed
3. Configure your target endpoint (required)
4. Click "Run Red Team" to start testing

### If No Server is Running

If the promptfoo server isn't running when recon completes:

- Config file is still written to disk
- Browser may open to an error page
- Run `promptfoo view` to start the server, then navigate to `/redteam/setup?source=recon`

### Using `--no-open`

Skip browser launch for CI/CD or scripted workflows:

```bash
promptfoo redteam recon --dir ./app --yes --no-open
```

This writes the config file without browser handoff. You can manually import it later or run directly with `promptfoo redteam run`.

---

## Recon vs Discovery

| Aspect       | Recon (this page)                    | [Discovery](/docs/red-team/discovery/) |
| ------------ | ------------------------------------ | -------------------------------------- |
| **Approach** | White-box (code analysis)            | Black-box (runtime probing)            |
| **Input**    | Source code directory                | Running target endpoint                |
| **When**     | Pre-deployment, during development   | Post-deployment, external testing      |
| **Finds**    | System prompts, tools, code patterns | Purpose, limitations from responses    |
| **Output**   | Complete `promptfooconfig.yaml`      | Text for `purpose` field               |

Use **recon** when you have code access. Use **discovery** when testing a deployed system you can only interact with as a black box.

## Excluded Files

By default, recon excludes common non-application files:

- `node_modules/`, `.git/`, `dist/`, `build/`
- `.env*` files (to avoid scanning secrets)
- Existing promptfoo configs (`promptfooconfig.yaml`, `redteam.yaml`)
- Test coverage directories

Add custom exclusions with `--exclude`:

```bash
promptfoo redteam recon --exclude "*.test.ts" --exclude "fixtures/**"
```

---

## Next Steps

After running recon, your browser opens to the web UI where you:

1. **Review the Application Details** tab to verify discovered context
2. **Configure your target endpoint** in the Target Configuration tab
3. **Adjust plugins/strategies** if needed (optional)
4. **Click "Run Red Team"** on the Review tab to start testing

Alternatively, if using `--no-open` or working from the config file:

```bash
# Edit the target URL in promptfooconfig.yaml, then:
promptfoo redteam run

# View results:
promptfoo redteam report
```

---

## Troubleshooting

### "No pending recon configuration found"

This warning appears when opening the web UI with `?source=recon` but no pending config exists. This happens if:

- Recon command failed before writing the pending file
- The pending file was already consumed by a previous session
- You navigated directly to the URL without running recon

**Solution**: Run `promptfoo redteam recon` again.

### Browser opens but page shows error

The promptfoo server isn't running.

**Solution**: Start the server with `promptfoo view`, then reload the page or run recon again.

### API rate limit or timeout errors

Large codebases may hit API limits or take a long time to analyze.

**Solutions**:

- Use `--exclude` to skip test files, fixtures, or generated code
- Try a different provider with `--provider anthropic` or `--provider openai`
- Break analysis into smaller directories

### Missing API key error

```
Error: No API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.
```

**Solution**: Set at least one API key in your environment or use `--env-file`:

```bash
promptfoo redteam recon --env-file .env
```

### Browser doesn't open

Some environments (SSH, containers) can't open browsers.

**Solution**: Use `--no-open` and open the URL manually:

```bash
promptfoo redteam recon --no-open
# Then open: http://localhost:3000/redteam/setup?source=recon
```

## See Also

- [Target Discovery](/docs/red-team/discovery/) - Black-box target analysis
- [Configuration](/docs/red-team/configuration/) - Full config reference
- [Plugins](/docs/red-team/plugins/) - Available attack plugins
- [Strategies](/docs/red-team/strategies/) - Attack delivery techniques
