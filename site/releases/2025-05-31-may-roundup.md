---
slug: may-2025-roundup
title: May 2025 Roundup
description: AI-powered testing agents, xAI integration, MCP support, and comprehensive platform enhancements across 250+ commits
authors: [promptfoo_team]
tags: [roundup, may-2025, target-discovery, xai, mcp, off-topic, monthly-summary]
keywords:
  [
    target discovery,
    xAI integration,
    Model Context Protocol,
    off-topic testing,
    validation command,
    agents,
  ]
date: 2025-05-31T23:59
---

# May 2025 Roundup

May delivered groundbreaking advances across all product areas with 250+ commits. Major additions include AI-powered testing agents, xAI provider integration, Model Context Protocol support, and comprehensive cloud platform enhancements.

<!-- truncate -->

## Promptfoo (Core Evaluation)

### Provider Integrations

**xAI Integration** ([commit 23ede6a79](https://github.com/promptfoo/promptfoo/commit/23ede6a79))

```yaml
providers:
  - xai:image-model
  - xai:search-enhanced-model
```

xAI integration with image provider and live search support.

**Model Context Protocol (MCP) Support** ([commit d7383bb6e](https://github.com/promptfoo/promptfoo/commit/d7383bb6e))

```yaml
providers:
  - openai:gpt-4
    config:
      mcp: true
      tools:
        - name: "search_tool"
          protocol: "mcp"
```

OpenAI Model Context Protocol integration for enhanced tool capabilities.

**Claude 4 Support** ([commit 7857266c6](https://github.com/promptfoo/promptfoo/commit/7857266c6))
Added Claude 4 support across three major cloud providers:

- Anthropic direct
- AWS Bedrock
- Google Vertex AI

**Enhanced HTTP Provider** ([commit c3091efc0](https://github.com/promptfoo/promptfoo/commit/c3091efc0))

```yaml
providers:
  - http://localhost:8080/api/chat
    config:
      includeMetadata: true
```

Comprehensive metadata support with raw output, status codes, and response metadata for enhanced debugging.

### Quality Assurance Tools

**Validation Command** ([commit 75dfead11](https://github.com/promptfoo/promptfoo/commit/75dfead11))

```bash
npx promptfoo validate
```

New command for quality assurance that validates configurations before running evaluations to catch issues early.

**Server-Side Pagination** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Performance improvement enabling handling of thousands of evaluation results with smooth UI interactions:

- Improved performance for large datasets
- Enhanced filtering capabilities
- Better search across results

### Data & Configuration

**Enhanced Data Export** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))

```bash
npx promptfoo export --format csv --include-scores
npx promptfoo export --format json
```

Improvements to data analysis capabilities:

- Pass/fail scoring in CSV exports
- JSON download options
- Plugin and strategy IDs for better traceability

**Universal Environment Variables** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))

```yaml
env:
  OPENAI_API_KEY: "custom-override"
  CUSTOM_ENDPOINT: "https://api.example.com"
providers:
  - openai:gpt-4
    config:
      apiKey: ${OPENAI_API_KEY}
```

Complete flexibility in configuration management.

### User Experience

**Audio File Variable Display** ([commit fec69139c](https://github.com/promptfoo/promptfoo/commit/fec69139c))

```yaml
tests:
  - vars:
      audio_input: 'path/to/audio.wav'
```

Audio files now display properly in evaluation results with appropriate visual indicators.

**Environment Variable Resolution** ([commit f8e387cf4](https://github.com/promptfoo/promptfoo/commit/f8e387cf4))

```yaml
config:
  api:
    endpoint: '${API_ENDPOINT}/v1'
    auth:
      key: '${API_KEY}'
```

Improved variable resolution in complex nested object structures.

_[Image placeholder: xAI and MCP integration overview with validation workflow]_

## Promptfoo Redteam (Security Testing)

### AI-Powered Testing Agents

**Target Discovery Agent** ([commit 4a92d8614](https://github.com/promptfoo/promptfoo/commit/4a92d8614))

```yaml
redteam:
  plugins:
    - target-discovery
  strategies:
    - crescendo
    - goat
  purpose: 'Test customer service chatbot'
```

Revolutionary AI agent that automatically discovers and analyzes potential attack vectors:

- Identifies potential vulnerability points automatically
- Analyzes system behavior patterns
- Generates targeted test scenarios
- Adapts strategy based on discovered information

**Goal & Intent Extraction** ([commit 14c03f8ff](https://github.com/promptfoo/promptfoo/commit/14c03f8ff))

```yaml
redteam:
  plugins:
    - harmful
  extractIntent: true
```

Enhanced evaluation with automatic goal and intent extraction for improved accuracy and context understanding.

### Advanced Testing Capabilities

**Off-Topic Testing Plugin** ([commit 5d247d716](https://github.com/promptfoo/promptfoo/commit/5d247d716))

```yaml
redteam:
  plugins:
    - off-topic
  purpose: 'Test customer service bot focus'
```

Tests whether AI systems maintain conversational focus and resist drift:

- Attempts to divert conversation from intended purpose
- Tests resistance to social engineering
- Validates topic boundary enforcement
- Ensures consistent behavior under pressure

**Goal-Based Attacks** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))

```yaml
redteam:
  strategies:
    - goal-based
  goals:
    - 'Extract personal information'
    - 'Bypass content filters'
```

New approach allowing security teams to set specific goals for red team attacks.

### Enhanced Red Team Grading

**Intent Processing Improvements** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Improvements to intent grading and gender bias detection for more accurate and fair evaluation.

**Enhanced Purpose Integration**
Improved goal integration across red team strategies with purpose-driven testing for better context awareness.

### Documentation & Examples

**Target Purpose Documentation** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Comprehensive updates to target purpose documentation with better guidance for security testing.

**Red Team Strategy Documentation**
Enhanced documentation for red team strategies with improved examples and configuration guidance.

_[Image placeholder: Target discovery agent interface with automated vulnerability analysis]_

## Promptfoo Cloud (Cloud Platform)

### Enterprise Features

**Audit Logs** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Comprehensive activity tracking for enterprise compliance requirements:

- User action logging
- Configuration change tracking
- Evaluation run histories
- Security event monitoring

**Session-Based Authentication** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Enhanced security with improved authentication flows:

- Secure session management
- Better token handling
- Improved user experience
- Enhanced security posture

**Grading Examples for All Plugins** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Universal grading example support across all red team plugins for consistent evaluation standards.

### User Interface Enhancements

**Enhanced DataGrid Features**

- Target column added to evaluations DataGrid
- Improved data visualization and navigation
- Better filtering and search capabilities
- Enhanced export functionality

**Application Definition Flow** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Updated application definition flow to collect better information for more effective red team testing.

**Target Testing Improvements**

- Better error handling for target tests
- Improved session ID generation for testing targets
- Enhanced client-generated session management

### Model Management

**Model Cost Updates**
Regular updates to model pricing across all supported providers for accurate cost tracking.

**OpenRouter Models with Sorting** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Enhanced OpenRouter model catalog with improved sorting and organization.

### Infrastructure

**POC Mode Enhancements**

- Simplified setup for proof-of-concept deployments
- Better CORS handling for development environments
- Improved configuration for quick testing

**Key Validation Improvements**
Reduced key validation requirements for better compatibility across different deployment scenarios.

### Performance & Reliability

**Telemetry Improvements**

- Better de-duplication of page views
- Enhanced tracking for red team operations
- Improved analytics and monitoring

**Request Handling**

- Better handling of example app requests
- Improved database auto-setup on boot
- Enhanced error handling and logging

_[Image placeholder: Cloud platform dashboard showing audit logs and session management]_

## Infrastructure & Quality

### CLI & Developer Experience

**Enhanced CLI Capabilities**

- Missing CLI options added to scan-model command for feature parity
- Better command-line documentation
- Improved error messages and guidance

**Comprehensive Testing**

- Unit test coverage for providers
- Red team strategy validation
- Plugin testing and verification
- Enhanced integration testing

### Build & Deployment

**Dependency Management**

- Updated to OpenAI 5.8.1
- Enhanced Anthropic SDK support
- Better build reliability and performance

**Docker & Container Improvements**

- Better container optimization
- Enhanced deployment configurations
- Improved environment handling

### Documentation

**Enhanced Documentation Structure**

- Improved organization of red team documentation
- Better examples and use cases
- Enhanced troubleshooting guides
- Clearer configuration documentation

**Plugin Documentation Sync**
Verification ensuring plugins are properly documented and synchronized between codebase and documentation.

## Bug Fixes & Stability

### Core Platform Fixes

- Improved JSON validation and error handling
- Relaxed private key validation for better compatibility
- Fixed Jest open handle issues with readline utilities
- Corrected variable resolution in renderVarsInObject
- Fixed rendering when too many intents detected

### Red Team Fixes

- Better handling of null goals in red team configuration
- Improved grader accuracy for red team evaluations
- Enhanced strategy processing and error handling
- Fixed target test error handling

### Cloud Platform Fixes

- Fixed invite flow issues
- Improved clipboard access on HTTP sites
- Better handling of undefined outputs
- Enhanced authentication and session management

### Provider Reliability

- Better error handling across all providers
- Enhanced metadata processing
- Improved response parsing
- More robust API integration

## Getting Started

```bash
npm install -g promptfoo@latest

# Use target discovery agent
npx promptfoo redteam --plugins target-discovery

# Test off-topic resistance
npx promptfoo redteam --plugins off-topic

# Enable MCP integration
npx promptfoo eval --config mcp-config.yaml

# Validate configuration
npx promptfoo validate

# Use xAI provider
npx promptfoo eval --provider xai:grok-beta
```

## Documentation

- [Target Discovery](/docs/red-team/discovery/)
- [Provider Documentation](/docs/providers/)
- [Off-Topic Testing Plugin](/docs/red-team/plugins/off-topic/)
- [xAI Provider](/docs/providers/xai/)
- [Validation Command](/docs/usage/command-line/#promptfoo-validate)
- [Red Team Configuration](/docs/red-team/configuration/)

---

**Previous**: [April 2025](/releases/april-2025-roundup) • [March 2025](/releases/march-2025-roundup)  
**Next**: [June 2025](/releases/june-2025-roundup)
