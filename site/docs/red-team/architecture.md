---
sidebar_label: Architecture
sidebar_position: 10
description: Red team AI systems by analyzing architecture components and attack surfaces to protect LLM applications through systematic vulnerability assessment and threat modeling
---

# Architecture

Promptfoo automated red teaming consists of three main components: **plugins**, **strategies**, and **targets**.

Each component is designed to be modular and reusable. We're building a framework that is useful out of the box with minimal configuration, but can be extended with custom components.

For usage details, see the [quickstart guide](/docs/red-team/quickstart).

```mermaid
%%{init: {
  'theme': 'base',
  'themeVariables': {
    'darkMode': false,
    'primaryColor': '#e1f5fe',
    'primaryBorderColor': '#01579b',
    'secondaryColor': '#f3e5f5',
    'secondaryBorderColor': '#4a148c',
    'tertiaryColor': '#e8f5e9',
    'tertiaryBorderColor': '#1b5e20',
    'quaternaryColor': '#fff3e0',
    'quaternaryBorderColor': '#e65100',
    'fontFamily': 'system-ui,-apple-system,"Segoe UI",Roboto,Ubuntu,Cantarell,"Noto Sans",sans-serif,"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji"'
  }
}}%%

graph TB
    %% Configuration Layer
    subgraph Configuration
        Purpose["<strong>Application Details</strong><br/><small>Purpose & Policies</small>"]
        Config["<strong>YAML Configuration</strong>"]
    end

    %% Test Generation Layer
    subgraph Dynamic Test Generation
        Plugins["<strong>Plugins</strong><br/><small>Dynamic payload generators</small>"]
        Strategies["<strong>Strategies</strong><br/><small>Payload wrappers<br/>(Injections, Jailbreaks, etc.)</small>"]
        Probes["<strong>Probes</strong><br/><small>Dynamic test cases</small>"]
    end

    %% Target Interface Layer
    subgraph Targets
        direction TB
        API["<strong>HTTP API</strong><br/><small>REST Endpoints</small>"]
        Model["<strong>Direct Model</strong><br/><small>GPT, Claude, Llama, Local, etc.</small>"]
        Browser["<strong>Browser Testing</strong><br/><small>Selenium, Puppeteer</small>"]
        Provider["<strong>Custom Providers</strong><br/><small>Python, JavaScript, etc.</small>"]
    end

    %% Evaluation Layer
    subgraph Evaluation
        Responses["<strong>Response Analysis</strong>"]
        Report["<strong>Results & Reports</strong>"]
    end

    %% Connections
    Config --> Plugins
    Config --> Strategies
    Purpose --> Plugins

    Plugins --> Probes
    Strategies --> Probes

    Probes --> API
    Probes --> Model
    Probes --> Browser
    Probes --> Provider

    API --> Evaluation
    Model --> Evaluation
    Browser --> Evaluation
    Provider --> Evaluation

    Responses --> Report

    %% Styling for light/dark mode compatibility
    classDef configNode fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#000
    classDef genNode fill:#f3e5f5,stroke:#4a148c,stroke-width:2px,color:#000
    classDef targetNode fill:#e8f5e9,stroke:#1b5e20,stroke-width:2px,color:#000
    classDef evalNode fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#000

    %% Dark mode overrides
    %%{init: {
      'themeVariables': {
        'darkMode': true,
        'primaryColor': '#1a365d',
        'primaryBorderColor': '#90cdf4',
        'secondaryColor': '#322659',
        'secondaryBorderColor': '#d6bcfa',
        'tertiaryColor': '#1c4532',
        'tertiaryBorderColor': '#9ae6b4',
        'quaternaryColor': '#744210',
        'quaternaryBorderColor': '#fbd38d'
      }
    }}%%

    class Config,Purpose configNode
    class Plugins,Strategies,Probes genNode
    class API,Model,Browser,Provider targetNode
    class Analysis,Responses,Report evalNode

    %% Click actions for documentation links
    click Config "/docs/red-team/configuration" "View configuration documentation"
    click Plugins "/docs/red-team/configuration/#plugins" "View plugins documentation"
    click Strategies "/docs/red-team/configuration/#strategies" "View strategies documentation"
    click Analysis "/docs/red-team/llm-vulnerability-types" "View vulnerability types"
```

## Core Components

### Test Generation Engine

The test generation engine combines plugins and strategies to create attack probes:

- **[Plugins](/docs/red-team/plugins)** generate adversarial inputs for specific vulnerability types. Each plugin is a self-contained module that can be enabled or disabled through configuration.

  Examples include [PII exposure](/docs/red-team/plugins/pii/), [BOLA](/docs/red-team/plugins/bola/), and [Hate Speech](/docs/red-team/plugins/harmful/).

- **[Strategies](/docs/red-team/strategies/)** are patterns for delivering the generated adversarial inputs.

  The most fundamental strategy is `basic`, which controls whether original test cases are included in the output. When disabled, only modified test cases from other strategies are included.

  Other strategies range from simple encodings like [base64](/docs/red-team/strategies/base64/) or [leetspeak](/docs/red-team/strategies/leetspeak/) to more complex implementations like [Microsoft's multi-turn attacks](/docs/red-team/strategies/multi-turn/) and [Meta's GOAT framework](/docs/red-team/strategies/goat/).

- **Attack Probes** are the natural language prompts generated by combining plugins and strategies.

  They contain the actual test inputs along with metadata about the intended vulnerability test. Promptfoo sends these to your target system.

### Target Interface

The target interface defines how test probes interact with the system under test. We support [over 30 target types](/docs/providers/), including:

- **[HTTP API](/docs/providers/http/)** - Tests REST endpoints via configurable requests
- **[Direct Model](/docs/red-team/configuration/#custom-providerstargets)** - Interfaces with LLM providers like OpenAI or local models
- **[Browser](/docs/providers/browser/)** - Runs end-to-end tests using Selenium or Puppeteer
- **[Custom Provider](/docs/red-team/configuration/#providers)** - Implements custom runtime integrations via Python/JavaScript

Each target type implements a common interface for sending probes and receiving responses.

### Evaluation Engine

The evaluation engine processes target responses through:

- **[Vulnerability Analysis](/docs/red-team/llm-vulnerability-types)** - Scans responses for security issues using configurable detectors
- **Response Analysis** - Examines output content and behavior patterns using [LLM-as-a-judge grading](/docs/configuration/expected-outputs/)
- **Results** - Generates findings with:
  - Vulnerability type
  - Severity
  - Attack vector
  - Mitigation steps

### Configuration

Configuration ties the components together via `promptfooconfig.yaml`. See [configuration guide](/docs/red-team/configuration) for details.

The configuration defines:

- Target endpoints and authentication
- [Enabled plugins](/docs/red-team/configuration/#plugins) and their settings
- [Active strategies](/docs/red-team/configuration/#strategies)
- Application context and [policies](/docs/red-team/configuration/#custom-policies)

## Component Flow

1. **Configuration** initializes **plugins** and **strategies**
2. **Test engine** generates probes using enabled components
3. **Target interface** delivers probes to the system
4. **Evaluation engine** analyzes responses and reports findings

Components can be used independently or composed into larger test suites. The modular design allows for extending functionality by adding new [plugins](/docs/red-team/configuration/#plugins), [strategies](/docs/red-team/configuration/#strategies), [targets](/docs/providers/) or evaluators.

For CI/CD integration, see our [automation guide](/docs/integrations/ci-cd).

## Data Flow

The following sequence diagram illustrates the runtime communication between Promptfoo components during a red team assessment.

The data flow follows a three-phase approach:

**Phase 1: Initial Attack Generation**: The Promptfoo Client requests an attack from the cloud service, which leverages AI models to generate adversarial payloads. These attacks are based on the configured plugins and strategies.

**Phase 2: Iterative Refinement** - The client executes attacks against the target system and evaluates responses. If a vulnerability is detected, testing concludes. Otherwise, the client generates follow-up attacks, providing context from previous attempts.

This feedback loop generates increasingly sophisticated attacks, applying different strategies and attack vectors until either a vulnerability is found or the maximum attempt limit is reached.

**Phase 3: Results Reporting**: Upon completion, the client produces a comprehensive test summary.

```mermaid
sequenceDiagram
    participant Client as Promptfoo<br/>Client
    participant Cloud as Promptfoo<br/>Server
    participant AI as AI Models
    participant Target as Target<br/>System

    rect rgb(230, 245, 255)
        Note over Client,Target: PHASE 1: Initial Attack
        Client->>Cloud: Request attack generation
        Cloud->>AI: Generate attack
        AI-->>Cloud: Attack payload
        Cloud-->>Client: Return attack
        Client->>Target: Execute attack
        Target-->>Client: Response
    end

    rect rgb(255, 245, 230)
        Note over Client,Target: PHASE 2: Iterate Until Success

        alt Target is vulnerable
            Client->>Client: Vulnerability detected<br/>End testing
        else Target not vulnerable
            Client->>Cloud: Request follow-up attack<br/>(include previous context)
            Cloud->>AI: Generate refined attack
            AI-->>Cloud: New attack payload
            Cloud-->>Client: Return follow-up attack
            Client->>Target: Execute new attack
            Target-->>Client: Response
            Note over Client: Repeat until vulnerable<br/>or max attempts reached
        end
    end

    rect rgb(245, 255, 245)
        Note over Client,Target: PHASE 3: Report Results
        Client->>Cloud: Submit test summary<br/>(attacks & results)
        Cloud-->>Client: Acknowledge receipt
    end
```
