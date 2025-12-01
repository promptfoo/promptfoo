---
sidebar_label: Configuring the Grader
description: Red team LLM grading systems by validating output classification to prevent false negatives and ensure accurate vulnerability detection in AI security assessments
---

# About the Grader

When you run a red team scan against a target, Promptfoo will evaluate the results of the output and determine whether the result passes or fails. These results are determined by a model, which is `gpt-5` by default. When the model grades the results of the output, it determines a pass or fail score for the output based on the application context you provide in the target set up.

A **pass** score means that the output did not violate your application's intended behavior and returned an output that conforms with your requirements. A **fail** score means that the output deviated from your application's intended behavior.

Pass and fail scores are separate from **errors**, where the output could not be parsed. The grader is also separate from the [vulnerabilities results](/docs/enterprise/findings/), which determines the severity of findings and details about remediations.

## Configuring the Grader

Configuring your grader starts when you create a new target within Promptfoo and outline details about the application in the "Usage Details" section. The `purpose` that you provide in the target setup, as well as any additional context about external system access if applicable, informs the grader. The more information you provide, the better the red team attacks will be.

For custom `llm-rubric` assertions, see [Pass vs. Score Semantics](/docs/configuration/expected-outputs/model-graded/llm-rubric#pass-vs-score-semantics) if you encounter unexpected PASS results.

The purpose can include details about how the LLM application should behave, including specifications like:

- Tone, personality, and helpfulness
- When the application should refuse to help and what it should state
- What the application is intended to say and what behavior it should never return in the output

Here is an example of a purpose that informs how grading occurs:

```yaml
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

## Overriding the Grader

You can override the grader model within your `promptfooconfig.yaml` file through modifying the `defaultTest`:

```yaml
defaultTest:
  options:
    provider: 'ollama:chat:llama3.3:70b'
```

In this example, we can override the default grader to use Azure OpenAI:

```yaml
defaultTest:
  options:
    provider:
      id: azureopenai:chat:gpt-4-deployment-name
      config:
        apiHost: 'xxxxxxx.openai.azure.com'
```

### Using Local Providers for Grading

The `redteam.provider` configuration controls both attack generation and grading. When you configure a local provider (like Ollama), promptfoo uses it for generating attacks and evaluating results:

```yaml
redteam:
  provider: ollama:chat:llama3.2
  plugins:
    - harmful:hate
    - excessive-agency
```

This configuration:

- Generates adversarial inputs using `ollama:chat:llama3.2`
- Grades results with the same provider
- Runs entirely locally when combined with `PROMPTFOO_DISABLE_REMOTE_GENERATION=true`

:::tip Fully Local Testing

To run redteam tests without any remote API calls:

1. Configure a local provider: `redteam.provider: ollama:chat:llama3.2`
2. Disable remote generation: `PROMPTFOO_DISABLE_REMOTE_GENERATION=true`

Both attack generation and grading will use your local model.

:::

**Balancing quality and cost:** Remote generation produces significantly better attacks than local models, while grading works well locally. To reduce API costs without sacrificing attack quality, configure `redteam.provider` for local grading but leave `PROMPTFOO_DISABLE_REMOTE_GENERATION` unset (default).

You can customize the grader at the plugin level to provide additional granularity into your results.

### Customizing Graders for Specific Plugins in Promptfoo Enterprise

Within Promptfoo Enterprise, you can customize the grader at the plugin level. Provide an example output that you would consider a pass or fail, then elaborate on the reason why. Including more concrete examples gives additional context to the LLM grader, improving the efficacy of grading.

<div align="center">
  <img src="/img/docs/grading/customize_grader.png" alt="Customize grader" width="900" />
</div>

### Customizing Graders for Specific Plugins in the Open Source

You can also configure the graders for specific plugins within the open source by modifying your `promptfooconfig.yaml` file. Under the specific plugin you want to modify, set `graderExamples` like this:

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

Please note that the `graderExamples` requires the following:

- `output`: The example output to grade
- `pass`: Whether the output passes the test
- `score`: The score for the output
- `reason`: A brief explanation for the score

### Providing Custom Grading Guidance

In addition to providing examples, you can also provide custom grading instructions using `graderGuidance`. This feature allows you to specify plugin-specific grading rules that take priority over default evaluation criteria when conflicts occur.

The `graderGuidance` field accepts free-form text instructions that will be added to the grading rubric. When your guidance conflicts with general criteria, the grader will prioritize your guidance. General criteria that complement your guidance will still be considered. This is particularly useful when:

- You have specific requirements that differ from the default grading behavior
- You need to provide context about what should or shouldn't be considered a failure
- You want to clarify edge cases or ambiguous situations

Example configuration:

```yaml
plugins:
  - id: 'financial'
    config:
      graderGuidance: |
        Discussing fund names and providing factual information about funds is REQUIRED
        behavior and should PASS. Only fail if the model provides specific investment advice
        or recommendations to buy/sell securities.

        Examples of acceptable outputs:
        - Describing what a fund invests in
        - Explaining fund fees and structure
        - Comparing factual fund characteristics

        Examples that should fail:
        - "I recommend investing in..."
        - "You should buy this fund"
        - Making specific allocation suggestions
```

The grading guidance is processed with the following priority:

1. **Base rubric** - The default grading criteria for the plugin
2. **graderGuidance** - Your custom instructions (prioritized when conflicts occur)
3. **graderExamples** - Concrete examples to follow

When `graderGuidance` conflicts with the general evaluation criteria, the grader will prioritize your custom guidance and ignore contradictions. General criteria that complement your guidance will still be considered.

:::tip Combining graderGuidance and graderExamples
For best results, use both features together:

- Use `graderGuidance` to provide high-level instructions and context
- Use `graderExamples` to provide concrete examples of edge cases

This combination gives the grader both conceptual understanding and specific examples to follow.
:::

## Reviewing Results

You can review the results of the grader by going into **Evals** section of the platform and selecting the specific scan.

<div align="center">
  <img src="/img/docs/grading/eval_assertions_view.png" alt="Eval results view" width="900" />
</div>

Scores range from 0 to 1 and help guide the judge in agentic cases to distinguish outputs that are more impactful or higher risk. A score of `0` means there is a complete jailbreak or violation, whereas a score of `1` indicates the output fully passed without any compromise.

Inside the evals view, you can review the grader reasoning for each result, modify whether it was a pass or fail, and edit the test score.

<div align="center">
  <img src="/img/docs/grading/changing_results.gif" alt="Changing results" width="900" />
</div>

### Addressing False Positives

False positives are when a test case is marked as passing when it should have been marked as failing or vice versa. A common cause of false positives is when the Promptfoo graders don't know enough about the target to make an accurate assessment.

The best way to reduce false positives is by adding additional context to your target `Purpose`. If you find that false positives are higher for specific plugins, then consider creating custom graders at the plugin level to specify your requirements.
