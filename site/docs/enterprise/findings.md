---
sidebar_label: Findings and Reports
sidebar_position: 50
title: Findings and Reports in Promptfoo Enterprise
description: Analyze vulnerability findings with severity scoring, remediation tracking, and compliance reporting in Promptfoo Enterprise
keywords:
  [findings, security reports, llm vulnerabilities, red team results, vulnerability management]
---

# Findings and Reports

Promptfoo Enterprise allows you to review findings and reports from scans within the Promptfoo application.

## How Grading Works

Grading is the process of evaluating the success of a red team attack. Promptfoo grades results based on the application context that is provided when creating a target. These results are subsequently compiled in the dashboard, vulnerabilities view, reports, and evaluations sections.

## Reviewing the Dashboard

The dashboard is the main page for reviewing findings and reports in a centralized view. It displays a summary of all the scans that have been run, including the number of findings and reports generated.

![Promptfoo Cloud Dashboard](/img/enterprise-docs/promptfoo-dashboard.png)

## Viewing Vulnerabilities

The "Vulnerabilities" section displays a list of all the vulnerabilities that have been found. You can filter based on the target, severity level, status of finding, risk category, or type of vulnerability.

Selecting a vulnerability will open a finding that shows you the details of the vulnerability, including details about the types of strategies that were used to exploit the vulnerability, records of the probes that were used, the instances when the vulnerability was identified during scans, and remediation recommendations.

You can modify the status of the finding as either "Marked as Fixed", "False Positive", or "Ignore". You can also add comments to the finding to provide additional context about the vulnerability, as well as change the severity level of the vulnerability based on your company's risk assessment.

### Exporting Vulnerabilities

From the Vulnerabilities page, you can export findings in several formats:

- **Export as CSV**: Export vulnerability data as a CSV file with details about each finding, severity, and remediation recommendations.
- **Export as SARIF**: Export vulnerabilities in [SARIF format](https://sarifweb.azurewebsites.net/) (Static Analysis Results Interchange Format) for integration with security tools like GitHub Security, SonarQube, and other DevOps platforms. SARIF is an industry-standard format for representing static analysis results.
- **Export as Colang v1**: Export vulnerabilities as Colang 1.0 guardrails for integration with [NVIDIA NeMo Guardrails](https://github.com/NVIDIA/NeMo-Guardrails). This format allows you to implement defensive guardrails based on the vulnerabilities discovered during red team testing.
- **Export as Colang v2**: Export vulnerabilities as Colang 2.x guardrails, supporting the latest Colang format for NeMo Guardrails.

## Viewing Reports

Reports are point-in-time scans of your target that are generated when you run a scan. These reports can be used to review the findings from a specific scan.

![Vulnerability report view](/img/enterprise-docs/view-report.png)

Reports will tell you which strategies were the most successful in exploiting the target, as well as what the most critical vulnerabilities were. By selecting the "View Logs" button, you will be directed to the evals section where you can view the logs for the specific scan.

![View logs interface](/img/enterprise-docs/view-logs.png)

The evals section will display all the test cases that were run during the scan, as well as the results. You can filter the results based on whether the test passed or failed, whether there was an error, or the type of plugin. Selecting a specific test case will show you the adversarial probe that was used, the response from the target, and the reason for grading it.

![Example evaluation response](/img/enterprise-docs/eval-example.png)

You can modify the status of the finding as either a pass or failure, provide comments on the finding, view the vulnerability report associated with the eval result, and copy the eval result to your clipboard.

When reviewing an eval, there are also multiple ways that you can export the results, including:

- **Export to CSV**: Export the eval results as a CSV file.
- **Export to JSON**: Export the eval results as a JSON file.
- **Download Burp Suite Payloads**: Download the adversarial probes as payloads that can be imported into Burp Suite.
- **Download DPO JSON**: Download the eval results as a DPO JSON file.
- **Download Human Eval Test YAML**: Evaluate the eval results for performance in code-related tasks.
- **Download the failed test config**: Download a configuration file containing only the failed tests to focus on fixing just the tests that need attention.

![Export options demonstration](/img/enterprise-docs/export-results.gif)

## Filtering and Sorting Findings

The "Evals" section will display all of the evaluations and let you filter and sort through them based on the eval ID, date the scan was created, author, description, plugin, strategy, pass rate, or number of tests. You can then download the evals as a CSV file.

![Filtering evaluations interface](/img/enterprise-docs/filter-evals.png)

You can also search for findings [using Promptfoo's API](https://www.promptfoo.dev/docs/api-reference/#tag/default/GET/api/v1/results).

## Sharing Findings

There are several ways to share findings outside of the Promptfoo application:

- **Export Vulnerabilities**: Export vulnerability data as CSV, SARIF, or Colang format from the "Vulnerabilities" section. See [Exporting Vulnerabilities](#exporting-vulnerabilities) above for format details.
- **Export Eval Results**: Export eval results as CSV or JSON from the "Evals" section.
- **Download Vulnerability Reports**: Download point-in-time vulnerability reports for each scan in the "Reports" section. These reports are exported as a PDF.
- **Use the Promptfoo API**: Use the [Promptfoo API](https://www.promptfoo.dev/docs/api-reference/) to export findings, reports, and eval results.
- **Share via URL**: Generate shareable URLs for your evaluation results using the `promptfoo share` command. [Learn more about sharing options](/docs/usage/sharing.md).

## See Also

- [Running Red Teams](./red-teams.md)
- [Service Accounts](./service-accounts.md)
- [Authentication](./authentication.md)
