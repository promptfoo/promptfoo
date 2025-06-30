---
slug: june-2025-roundup
title: June 2025 Roundup
description: Financial security plugins, Helicone gateway, documentation restructure, and enterprise enhancements across 300+ commits
authors: [promptfoo_team]
tags: [roundup, june-2025, financial, helicone, enterprise, documentation, monthly-summary]
keywords:
  [financial security, Helicone gateway, enterprise features, documentation, mTLS, Garak comparison]
date: 2025-06-30T23:59
---

# June 2025 Roundup

June delivered comprehensive improvements across all product areas with 300+ commits. Major additions include financial security testing, enterprise gateway integrations, massive documentation restructure, and advanced cloud platform capabilities.

<!-- truncate -->

## Promptfoo (Core Evaluation)

### Provider Integrations

**Helicone AI Gateway Provider** ([commit 43f6a9302](https://github.com/promptfoo/promptfoo/commit/43f6a9302))

```yaml
providers:
  - helicone:gpt-4
    config:
      heliconeApiKey: ${HELICONE_API_KEY}
      baseUrl: "https://oai.hconeai.com/v1"
      metadata:
        user: "eval-system"
        environment: "production"
```

Enterprise-grade AI gateway support for comprehensive observability:

- Complete request/response logging
- Cost tracking across evaluations
- Performance monitoring
- Custom metadata tagging
- Enterprise compliance features

**Enhanced Cloudflare AI Provider** ([commit cbe7d1f9a](https://github.com/promptfoo/promptfoo/commit/cbe7d1f9a))

```yaml
providers:
  - cloudflare:@cf/meta/llama-3.1-8b-instruct
    config:
      accountId: ${CLOUDFLARE_ACCOUNT_ID}
      apiToken: ${CLOUDFLARE_API_TOKEN}
```

Streamlined Cloudflare Workers AI integration with OpenAI-compatible endpoints for simplified configuration.

### Performance & Reliability

**Token Usage Tracking** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Better tracking for successful API calls with enhanced cost monitoring and usage analytics.

**Enhanced Provider Response Handling**

- Improved error handling for undefined outputs
- Better provider response processing
- Enhanced API integration reliability
- More robust timeout and retry mechanisms

### Testing & Quality Assurance

**Plugin Verification System** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Automated verification ensuring plugins are properly documented and synchronized between codebase and documentation.

**Enhanced Test Coverage**

- Comprehensive unit test additions
- Provider integration testing
- Better CI/CD pipeline
- Improved testing coverage across components

### Configuration & Data

**Advanced Variable Support**

- Variable clearing checkbox in WebUI
- Better derived metrics support in uploaded configurations
- Enhanced environment variable handling

**Export & Analytics**

- Better handling of undefined outputs in download menus
- Enhanced data export capabilities
- Improved analytics and reporting

_[Image placeholder: Helicone integration dashboard with comprehensive observability metrics]_

## Promptfoo Redteam (Security Testing)

### Domain-Specific Security Testing

**Financial Security Plugins** ([commit 32c64dfc0](https://github.com/promptfoo/promptfoo/commit/32c64dfc0))

```yaml
redteam:
  plugins:
    - financial
  purpose: 'Test banking chatbot for financial data security'
```

Specialized testing for AI systems in financial contexts with comprehensive security validations:

- **`financialDataLeakage`** - Tests for PII and financial data exposure
- **`financialComplianceViolation`** - Validates regulatory compliance (GDPR, PCI DSS)
- **`financialCalculationError`** - Checks financial calculation accuracy
- **`financialHallucination`** - Detects incorrect financial advice
- **`financialSycophancy`** - Tests for inappropriate agreement with financial requests

Use these plugins to test financial chatbots, advisory systems, and banking applications for domain-specific vulnerabilities.

### Enhanced Testing Capabilities

**Centralized REDTEAM_DEFAULTS** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))

```yaml
redteam:
  maxConcurrency: 10
  strategies:
    - multilingual
    - jailbreak
  plugins:
    - harmful
    - financial
```

Centralized defaults and maxConcurrency support for consistent red team testing configuration.

**Enhanced Grader Integration**

- Improved grader accuracy across all plugins
- Better integration with cloud grading systems
- Enhanced logging and debugging capabilities

### Security Analysis

**Advanced Attack Strategies**

- Enhanced encoding strategies for comprehensive testing
- Better handling of complex attack vectors
- Improved strategy combination and sequencing

**Vulnerability Assessment**

- Enhanced vulnerability detection algorithms
- Better classification of security issues
- Improved reporting and analysis capabilities

_[Image placeholder: Financial security testing interface showing compliance validation and vulnerability assessment]_

## Promptfoo Redteam (Advanced Features)

### Comparative Analysis

**Garak Comparison Framework** ([commit 841008e01](https://github.com/promptfoo/promptfoo/commit/841008e01))
Comprehensive comparison with Garak for AI security testing:

- Feature comparison matrix
- Use case recommendations
- Migration guidance
- Best practice documentation

### Documentation & Examples

**Enhanced Red Team Documentation** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))

- Improved strategy documentation
- Better plugin examples
- Enhanced configuration guides
- Clearer security testing workflows

**Missing Plugin Documentation** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Added comprehensive documentation for previously undocumented red team plugins.

_[Image placeholder: Garak comparison framework showing feature analysis and migration paths]_

## Promptfoo Cloud (Cloud Platform)

### Enterprise Security

**mTLS and Self-Signed SSL Support** ([commit f3aa6452](https://github.com/promptfoo/promptfoo/commit/f3aa6452))

```yaml
database:
  ssl:
    enabled: true
    mtls: true
    ca: '/path/to/ca.pem'
    cert: '/path/to/client-cert.pem'
    key: '/path/to/client-key.pem'
    rejectUnauthorized: false
```

Enhanced database security for enterprise deployments:

- Mutual TLS authentication
- Self-signed certificate support
- Enhanced encryption in transit
- Enterprise compliance readiness

**Advisory Locks for Job Management** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Enterprise-grade job management with PostgreSQL advisory locks:

- Prevents concurrent job conflicts
- Better resource utilization
- Improved scalability
- Enhanced reliability for large deployments

### User Interface Enhancements

**Highlighted Cell Count Display** ([commit 60926219](https://github.com/promptfoo/promptfoo/commit/60926219))

```bash
# Click cells to highlight and track important results
```

Improved evaluation analysis with cell highlighting and counting:

- Visual highlighting of important results
- Count display for highlighted cells
- Better result navigation
- Enhanced data analysis workflows

**Page Title Management** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Set appropriate titles on all pages for better navigation and user experience.

### Performance & Analytics

**Enhanced Telemetry**

- Better telemetry for red team operations
- Enhanced pass/fail/error tracking in eval runs
- Improved de-duplication for page view analytics
- Better debugging logs for guardrails systems

**Job Processing**

- Better job processing with advisory locks
- Enhanced queue management
- Improved error handling and recovery
- Better resource allocation

### Model Management

**Model Cost Updates** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Regular updates to model pricing across all supported providers for accurate cost tracking and budgeting.

**Enhanced Model Catalog**

- Better model organization and discovery
- Improved model metadata and capabilities
- Enhanced provider model mapping

_[Image placeholder: Enterprise cloud dashboard showing mTLS configuration and highlighted cell analytics]_

## Infrastructure & Quality

### Documentation Restructure

**Major Configuration Documentation Restructure** ([commit 9a2cfe375](https://github.com/promptfoo/promptfoo/commit/9a2cfe375))
Comprehensive reorganization of configuration documentation:

- Clearer navigation paths
- Better categorization of configuration options
- Enhanced search functionality
- Improved getting started guides

**Enhanced Internal Linking** ([commit 0d3f7b0d3](https://github.com/promptfoo/promptfoo/commit/0d3f7b0d3))
Fixed broken references and improved cross-documentation linking:

- Relative URLs for better maintenance
- Fixed broken internal references
- Improved navigation flow
- Better cross-referencing

**HuggingFace Datasets Integration Documentation** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Comprehensive documentation for HuggingFace datasets integration with examples and best practices.

### Self-Hosting Improvements

**Enhanced Self-Hosting Documentation** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))

- Clarified replica limitations
- Improved deployment guides
- Better troubleshooting resources
- Enhanced FAQ section for offline environments

**Offline Environment Support** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))
Enhanced FAQ and guidance for offline environment usage and deployment.

### Build & Deployment

**Dependency Updates** ([commit related](https://github.com/promptfoo/promptfoo/commit/related))

- Updated to OpenAI 5.8.1
- Enhanced Anthropic SDK 0.55.0
- Regular security updates
- Better build reliability

**Docker & Container Improvements**

- Better container optimization
- Enhanced deployment configurations
- Improved environment handling

### Testing & Quality

**Comprehensive Testing Coverage**

- Unit tests for providers and core functionality
- Integration testing for new features
- Better CI/CD pipeline reliability
- Enhanced quality assurance processes

**Provider Testing**

- Comprehensive provider integration testing
- Better error handling validation
- Enhanced compatibility testing

_[Image placeholder: Documentation structure showing new organization and internal linking improvements]_

## Bug Fixes & Stability

### Core Platform Fixes

- Fixed build issues and dependency conflicts
- Improved provider response handling across all integrations
- Better error handling for undefined outputs throughout platform
- Enhanced provider reliability and consistency

### User Interface Fixes

- Fixed styling on organization settings pages
- Improved error handling for null outputs
- Better handling of undefined values in various UI components
- Enhanced responsive design for mobile devices

### Provider Reliability

- Enhanced Llama inference config serialization for SageMaker
- Better handling of content filter errors in Azure Assistant API
- Improved Azure GPT-4.1 flagged output logging
- More robust API error handling across all providers

### Performance Optimizations

- Better memory usage across WebUI components
- Enhanced caching mechanisms
- Improved database query performance
- More efficient resource utilization

## Getting Started

```bash
npm install -g promptfoo@latest

# Test financial security
npx promptfoo redteam --plugins financial

# Use Helicone gateway
npx promptfoo eval --provider helicone:gpt-4

# Configure enterprise mTLS
npx promptfoo eval --config enterprise-config.yaml

# Compare with Garak
npx promptfoo redteam --strategies multilingual --compare-with garak
```

## Documentation

- [Financial Plugins](/docs/red-team/plugins/financial/)
- [Helicone Integration](/docs/providers/helicone/)
- [Self-Hosting Guide](/docs/usage/self-hosting/)
- [Web UI Features](/docs/usage/web-ui/)
- [HuggingFace Datasets](/docs/configuration/huggingface-datasets/)

---

**Previous**: [May 2025](/releases/may-2025-roundup) • [April 2025](/releases/april-2025-roundup) • [March 2025](/releases/march-2025-roundup)  
**Next**: July 2025 Roundup (coming soon)
