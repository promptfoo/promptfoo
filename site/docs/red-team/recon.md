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

## When to Use

Use `recon` when you have access to the source code and want to:

- **Bootstrap a red team config** without manually filling in application details
- **Discover system prompts** embedded in your codebase
- **Find LLM-callable tools/functions** that represent attack vectors
- **Identify sensitive data types** and security requirements from code
- **Get plugin recommendations** based on your application's attack surface

For black-box testing of running targets (when you don't have code access), see [Target Discovery](/docs/red-team/discovery/).

## How It Works

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
| `--exclude <patterns...>` | Additional glob patterns to exclude                       |

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

Provider: openai (o3)
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

Security Notes:
  - src/tools.js:34-86 authentication uses plaintext credentials
  - src/tools.js:377-470 processPayment stores card data in memory

✔ Write config to promptfooconfig.yaml? Yes
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
```

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

## Next Steps

After running recon:

1. **Configure your target endpoint** in the generated config
2. **Review the discovered context** and adjust if needed
3. **Run the red team**: `promptfoo redteam run`
4. **View results**: `promptfoo redteam report`

## See Also

- [Target Discovery](/docs/red-team/discovery/) - Black-box target analysis
- [Configuration](/docs/red-team/configuration/) - Full config reference
- [Plugins](/docs/red-team/plugins/) - Available attack plugins
- [Strategies](/docs/red-team/strategies/) - Attack delivery techniques
