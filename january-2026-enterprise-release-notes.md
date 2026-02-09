# January 2026 Release Highlights

## Code Scanning

### Comment-Triggered Scans

Trigger security scans on any pull request by commenting `@promptfoo-scanner`. This enables on-demand vulnerability analysis without modifying CI/CD workflows.

### Fork PR Scanning

Scan pull requests from external contributors by adding `enable-fork-prs: true` to your workflow file, or use comment triggers for selective scans on specific PRs.

### Improved Detection

- Vulnerability line numbers now correctly resolve against diff hunks
- New vulnerability classes: Data Exfiltration, Insecure Output Handling, Jailbreak Risks
- Reduced false positives in PII detection
- Feedback links in PR comments to report detection accuracy

## Target Configuration

### Test Scenarios on Targets

Configure test scenarios directly on targets instead of scan configuration. Test the same target in different application states (e.g., logged in vs. logged out, admin vs. user) without duplicating target definitions.

### Cross-Team Target Management

Organization admins can move targets between teams. Related scans, templates, issues, and guardrails move automatically. Plugin collections and custom policies are copied to the destination team.

## Remediation

### Sortable Vulnerability Tables

Remediation reports now display vulnerabilities in sortable tables. Sort by risk score, count, or name. Findings are grouped by severity bands (≥7.5, ≥5.0, ≥2.5, <2.5).

### System Prompt Upload

Upload system prompts from `.txt`, `.md`, `.json`, `.yaml`, or `.yml` files in the System Prompt Hardening dialog.

## Organization Administration

### Org-Wide Sharing

Share plugin collections, custom policies, and scan templates across your organization. Shared resources are read-only for other teams while ownership remains with the original team.

### Centralized Provider Configuration

Configure LLM providers at the organization level. Teams inherit organization credentials without needing separate API key setup.

### Bulk Operations

Select multiple evaluations or scan templates and delete them in bulk with confirmation dialogs.

### User Management

- Searchable user lists with detailed profiles
- Resend invitation emails
- Organization deletion with confirmation

## Reliability

### Provider Fallback

Configure separate providers for red teaming and grading with automatic fallback on errors. Enable with `ENABLE_ONPREM_PROVIDER_FALLBACK=true`.

When your primary LLM provider experiences issues, scans continue using the fallback provider.

## UI Improvements

### Multi-Modal Results

View audio and image content directly in evaluation results when testing multi-modal attacks.
