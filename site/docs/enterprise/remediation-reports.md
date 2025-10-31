---
sidebar_label: Remediation Reports
sidebar_position: 55
title: Remediation Reports in Promptfoo Enterprise
description: AI-generated remediation reports with prioritized action items, implementation guidance, and vulnerability-to-fix mappings for LLM security issues
keywords:
  [
    remediation reports,
    security fixes,
    vulnerability remediation,
    llm security,
    action items,
    implementation guide,
  ]
---

# Remediation Reports

Promptfoo Enterprise automatically generates remediation reports after each red team scan. These reports provide actionable security recommendations with implementation guidance.

## Overview

Remediation reports analyze your scan results and provide:

- **Executive Summary**: High-level assessment of your security posture with top concerns
- **Vulnerability-to-Remediation Mapping**: Quick reference showing which fixes address which vulnerabilities
- **Prioritized Action Items**: Step-by-step implementation guidance ordered by impact and effort
- **Code Examples**: Ready-to-use code snippets and configuration changes
- **Attack Context**: Real examples from your scan showing how vulnerabilities were exploited

## Accessing Remediation Reports

Remediation reports are automatically generated when:

1. A red team scan completes in the Promptfoo Enterprise UI
2. A CLI scan is uploaded to the server using `promptfoo share`

To access a remediation report:

1. Navigate to the **Reports** section in Promptfoo Enterprise
2. Select the evaluation you want to review
3. Click on the **Remediation** tab to view the remediation report

![Remediation Report view](/img/enterprise-docs/remediation-report-top.png)

Alternatively, you can access remediation reports directly from the vulnerabilities view by clicking on a specific finding.

## Report Structure

### Executive Summary

The executive summary provides a high-level overview of your security posture, including:

- **Overall Risk Level**: Critical, High, Medium, or Low classification
- **Top Concerns**: The most significant security issues identified in your scan
- **Security Posture**: Narrative summary of your application's current security state

This section helps stakeholders quickly understand the severity of issues without diving into technical details.

### Vulnerability-to-Remediation Mapping

A quick-reference table showing:

- Vulnerability category and plugin ID
- Number of failed test cases
- Risk score and severity level
- Which remediation actions address each vulnerability

This mapping helps you understand the relationship between vulnerabilities and fixes, making it easier to prioritize work that addresses multiple issues.

### Prioritized Action Items

Each action item includes:

- **Priority Number**: Actions are ranked by impact and feasibility
- **Action Type**: Category of fix (e.g., System Prompt Hardening, Input Validation, Output Filtering)
- **Title and Description**: Clear explanation of what needs to be changed
- **Impact Level**: Expected security improvement (High, Medium, Low)
- **Effort Level**: Implementation difficulty (High, Medium, Low)
- **Implementation Details**: Step-by-step instructions with code examples
- **Estimated Timeframe**: How long implementation should take
- **Vulnerabilities Addressed**: Which security issues this action will fix

![Prioritized Action Item with Implementation Details](/img/enterprise-docs/remediation-report-recommendation.png)

#### Action Types

Common remediation action types include:

- **System Prompt Hardening**: Strengthening your system prompts with better guardrails
- **Input Validation**: Adding validation to user inputs before processing
- **Output Filtering**: Implementing filters to sanitize model responses
- **Configuration Changes**: Adjusting model parameters or API settings
- **Architecture Changes**: Modifying your application's structure for better security

### Attack Examples

For each vulnerability addressed by a remediation action, the report shows:

- The actual adversarial probes that succeeded during your scan
- The model's vulnerable responses
- Why the test was marked as a failure

This context helps you understand the real-world exploitation of each vulnerability and verify your fixes are effective.

## Using Report Features

### Regenerating Reports

If your scan data has changed or you want fresh recommendations:

1. Click the **Regenerate** button in the report header
2. The report status will change to "Generating"
3. The page will automatically poll and update when generation completes

Report generation typically takes 1-3 minutes depending on the size of your scan.

### Downloading Reports

To share reports with your team or stakeholders:

1. Click the **Download PDF** button in the report header
2. The report will be formatted for printing and opened in a print dialog
3. Save as PDF or print directly

The PDF format is optimized for sharing with technical and non-technical audiences.

### System Prompt Hardening

For system prompt vulnerabilities, use the **Harden Prompt** feature:

1. Click the **Harden Prompt** button in the report header
2. Review the AI-generated hardened prompt that addresses identified vulnerabilities
3. Test the hardened prompt against your scan results
4. Copy and implement the improved prompt in your application

![System Prompt Hardening Dialog](/img/enterprise-docs/remediation-report-harden.png)

This feature provides immediate, actionable improvements to your system prompts based on the specific vulnerabilities found in your scan.

## Report Statuses

Remediation reports can be in different states:

- **Pending**: Report generation has been queued but not started
- **Generating**: The AI is currently analyzing your scan and creating recommendations
- **Completed**: Report is ready to view
- **Failed**: Generation encountered an error (use Regenerate to retry)

The report page automatically polls for updates while a report is generating, so you don't need to refresh manually.

## Outdated Reports

If you run a new scan after a remediation report has been generated, the report will be marked as **Outdated**. An alert will appear prompting you to regenerate the report to include the most recent results.

Regenerating ensures your remediation recommendations reflect your current security posture.

## Best Practices

### Implementation Workflow

1. **Review Executive Summary**: Understand overall risk and top concerns
2. **Check Vulnerability Mapping**: Identify which fixes provide the most coverage
3. **Start with High Impact, Low Effort**: Address quick wins first
4. **Implement Changes Incrementally**: Fix one action item at a time
5. **Re-scan After Each Fix**: Verify your remediation was effective
6. **Track Progress**: Use the vulnerabilities page to mark findings as fixed

### Prioritization Strategy

Consider both impact and effort when prioritizing:

- **High Impact, Low Effort**: Implement these first for immediate security gains
- **High Impact, High Effort**: Plan these as longer-term initiatives
- **Low Impact, Low Effort**: Good candidates when you have spare capacity
- **Low Impact, High Effort**: Deprioritize unless required for compliance

### Verification

After implementing remediation actions:

1. Run a new scan with the same configuration
2. Compare the new report to the previous one
3. Verify that addressed vulnerabilities no longer appear
4. Check if the overall risk level has improved
5. Generate a new remediation report to identify remaining issues

## Integration with Findings Workflow

Remediation reports complement the vulnerabilities workflow:

- **Vulnerabilities Page**: Track individual findings across scans
- **Remediation Reports**: Get implementation guidance for fixes
- **Reports Page**: Review point-in-time scan results

Use remediation reports to understand _how_ to fix issues, then track your progress in the vulnerabilities page.

## See Also

- [Findings and Reports](./findings.md)
- [Running Red Teams](./red-teams.md)
- [API Reference](https://www.promptfoo.dev/docs/api-reference/)
