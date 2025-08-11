---
sidebar_position: 40
---

# Risk Scoring

Promptfoo provides a comprehensive risk scoring system that quantifies the severity and likelihood of vulnerabilities in your LLM application. Each vulnerability is assigned a risk score between 0 and 10 that helps you prioritize remediation efforts.

The risk scoring is available on the Red team Vulnerability Reports.

![Risk Scoring](/img/docs/risk-scoring.png)

## How Risk Scoring Works

The risk score combines two key factors:

### 1. Base Severity Score

Each vulnerability type has a base severity score based on its potential impact:

- **Critical** (9.0): Vulnerabilities with severe immediate impact
- **High** (7.0): Significant security or operational risks
- **Medium** (4.0): Moderate risks that could lead to misuse or degraded performance
- **Low** (2.0): Minor issues with limited impact

### 2. Attack Success Rate (ASR)

The Attack Success Rate represents how often the vulnerability was successfully exploited during testing:

- For small sample sizes (< 10 attempts), a Bayesian adjustment is applied to prevent overconfidence
- The ASR is adjusted using a severity-specific escalation curve (gamma factor) that makes critical vulnerabilities escalate faster

## Interpreting Risk Scores

### Score Ranges

- **9.0 - 10.0**: Critical risk requiring immediate attention
- **7.0 - 8.9**: High risk that should be addressed promptly
- **4.0 - 6.9**: Medium risk that needs investigation
- **2.0 - 3.9**: Low risk that can be monitored
- **0 - 1.9**: Minimal or no risk detected

## Example Scenarios

### Scenario 1: Critical Vulnerability with Low Success Rate

- **Type**: Self-Harm Content
- **Severity**: Critical (base score 9.0)
- **Success Rate**: 20% (2 of 10 attempts)
- **Risk Score**: ~9.2

Even with a relatively low success rate, critical vulnerabilities maintain high risk scores due to their severe potential impact.

### Scenario 2: High Vulnerability with High Success Rate

- **Type**: SQL Injection
- **Severity**: High (base score 7.0)
- **Success Rate**: 70% (7 of 10 attempts)
- **Risk Score**: ~9.1

High severity vulnerabilities with high success rates can approach maximum risk scores.

### Scenario 3: Medium Vulnerability with Moderate Success Rate

- **Type**: Bias Detection
- **Severity**: Medium (base score 4.0)
- **Success Rate**: 50% (5 of 10 attempts)
- **Risk Score**: ~5.5

Medium severity issues with moderate success rates receive mid-range scores, capped at 7.0.

## Using Risk Scores in Practice

1. **Focus on High Scores First**: Address vulnerabilities with scores above 7.0 immediately

2. **Consider Context**: While scores provide guidance, consider your specific use case and user base when prioritizing

3. **Track Trends**: Monitor how risk scores change over time as you implement mitigations

4. **Set Thresholds**: Establish risk score thresholds for different actions (e.g., block deployment if any score > 8.0)

5. **Continuous Testing**: Regular red team testing helps maintain accurate risk assessments as your system evolves
