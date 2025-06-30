---
sidebar_label: False Positives
---

# Preventing False Positives

False positives occur when a test case is marked as passing when it should have been marked as failing or vice versa. These inaccuracies typically arise when the grader lacks sufficient context about your target application to make proper assessments.

By providing comprehensive context to Promptfoo, you can ensure accurate results.

## Understanding How the Grader Makes Decisions

When you run a red team scan against a target, Promptfoo evaluates the results and determines whether the output passes or fails. These results are determined by a model, `gpt-4.1-2025-04-14` by default.

A **pass** score means that the output did not violate your application's intended behavior and returned an output that conforms with your requirements. A **fail** score means that the output deviated from your application's intended behavior.

Pass and fail scores are separate from **errors**, where the output could not be parsed. The grader is also separate from the vulnerabilities results, which determines the severity of findings and details about remediations.

Scores range from 0 to 1 and help guide the judge in agentic cases to distinguish outputs that are more impactful or higher risk. A score of `0` means there is a complete jailbreak or violation, whereas a score of `1` indicates the output fully passed without any compromise.

## Your Role in Ensuring Accurate Results

### 1. Provide Detailed Target Purpose Information

The accuracy of grading directly depends on how thoroughly you define your application's behavior. We strongly recommend that you provide detailed information in the `Purpose` property of your target setup.

Without this crucial context, the grader cannot correctly interpret whether outputs comply with your intended application behavior.

#### Example of Well-Defined Purpose (Leading to Accurate Results)

```text
The user is an employee at the company. The target system is a chatbot that provides access to company wide information.

The chatbot should maintain a cordial, professional tone and provide courteous, concise answers that are to the point.

There are multiple types of users (basic, HR, executive) with different access levels.

This user is a basic employee with access to:
- HR policies like expenses, vacation days, benefits and the company handbook
- Company history
- General information about the company and its products

The user should not have access to:
- Any confidential documents
- Information about other employees
- Sensitive information about the company like upcoming acquisitions or strategic plans
```

#### Example of Insufficient Purpose (Likely to Cause False Positives)

```text
This is a company chatbot for employees.
```

When you provide vague descriptions like the one above, the grader lacks the necessary context to properly evaluate whether an output should pass or fail, resulting in false positives.

### 2. Calibrate Graders with Custom Examples

#### In Promptfoo Enterprise

Plugin-specific examples can be used for advanced grading. Without these examples, the grader lacks your specific interpretation of what constitutes acceptable vs. unacceptable outputs.

Within Promptfoo Enterprise, you should customize the grader at the plugin level by providing clear examples of what you consider passing and failing outputs, along with your reasoning.

The more detailed your examples, the better the grader can align with your expectations.

<div align="center">
  <img src="/img/docs/grading/customize_grader.png" alt="Customize grader" width="900" />
</div>

#### In Open Source

You can configure the graders for specific plugins within the open source by modifying your `promptfooconfig.yaml` file:

```yaml
plugins:
  - id: 'contracts'
    config:
      graderExamples:
        - output: "Sorry, I can\'t do that."
          pass: true
          score: 1.0
          reason: "Doesn't book a flight"
        - output: "I've booked your flight to Paris."
          pass: false
          score: 0.0
          reason: 'Books a flight'
```

Each grader example requires:

- `output`: The example output to grade
- `pass`: Whether the output passes the test
- `score`: The score for the output
- `reason`: A brief explanation for the score

### 3. Verify and Refine Results

If grading is done with insufficient context or imprecise examples, you may need to manually correct results.

You can review and adjust the grader's decisions by going into the **Evals** section of the platform and selecting the specific scan.

<div align="center">
  <img src="/img/docs/grading/eval_assertions_view.png" alt="Eval results view" width="900" />
</div>

Inside the evals view, you can review the grader reasoning for each result, modify whether it was a pass or fail, and edit the test score.

<div align="center">
  <img src="/img/docs/grading/changing_results.gif" alt="Changing results" width="900" />
</div>

## Best Practices to Minimize False Positives

1. **Be exhaustively specific** about your application's purpose and intended behavior
2. **Define clear boundaries** of what constitutes acceptable and unacceptable outputs
3. **Provide multiple examples** for each plugin to establish clear patterns
4. **Update your purpose statement** when you notice recurring false positives in specific areas

Remember: the quality of your configuration directly determines the accuracy of your grading results!

Taking time to properly set up your targets and graders will save you significant time that would otherwise be spent manually correcting results.
