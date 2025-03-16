# Using LangChain PromptTemplate with Promptfoo

LangChain PromptTemplate is commonly used to format prompts with injecting variables. Promptfoo allows you to evaluate and test your prompts systematically. Combining the two can streamline your workflow, enabling you to test the prompts that use LangChain PromptTemplate in application code directly within Promptfoo.

## Example of LangChain PromptTemplate

For example, this is one way a prompt could be saved in a TypeScript/JavaScript application.

```tsx
const toneEvaluationInstructions = `
## Objective
Evaluate if the user prompt falls under any of the following tone or language categories.

## Criteria for Prompts
1. Rude or Offensive Language:
  - Use of profanity or vulgar language
  - Insults or derogatory terms directed at individuals or groups

2. Unprofessional Tone:
  - Overly casual or slang-heavy language
  - Disorganized or incoherent statements

## Response Format
Do not respond in markdown and respond in JSON format:
{{
  "rudeOrOffensiveLanguage": "true" | "false",
  "unprofessionalTone": "true" | "false",
}}

## Prompt: 
{prompt}
`;
```

This prompt can be loaded and used with LangChain PromptTemplate. Here is a simplified example:

```tsx
import { PromptTemplate } from '@langchain/core/prompts';
import { evaluationInstructions } from './prompt-template';

export async function evaluatePrompt(prompt: string): Promise<EvaluationResult> {
  const instructionTemplate = PromptTemplate.fromTemplate(evaluationInstructions);

  // Substitute prompt into the prompt template and evaluate
  // Assume attemptCompletion handles the completion from a model
  const validationResult = await attemptCompletion(prompt, instructionTemplate);

  if (
    validationResult.rudeOrOffensiveLanguage === 'true' ||
    validationResult.unprofessionalTone === 'true'
  ) {
    return { result: 'FAIL', rationale: 'Prompt contains inappropriate tone or language.' };
  }

  return { result: 'PASS', rationale: 'Prompt is appropriate.' };
}
```

## Testing with Promptfoo

To make the evaluation of prompts more seamless, the prompts can be loaded directly into Promptfoo tests. This way, whenever the prompts are updated in the application, the tests can evaluate the most up-to-date prompt.

Change the prompt to a function that can be loaded in the Promptfoo configuration file, as described in the [prompt functions documentation](https://www.promptfoo.dev/docs/configuration/parameters/). Change how the substitution of variables is done to regular JS substitution.

```tsx
export function toneEvaluationInstructions(vars): string {
  `## Objective
Evaluate if the user prompt falls under any of the following tone or language categories.

## Criteria for Prompts
1. Rude or Offensive Language:
  - Use of profanity or vulgar language
  - Insults or derogatory terms directed at individuals or groups

2. Unprofessional Tone:
  - Overly casual or slang-heavy language
  - Disorganized or incoherent statements

## Response Format
Do not respond in markdown and respond in JSON format:
{{
  "rudeOrOffensiveLanguage": "true" | "false",
  "unprofessionalTone": "true" | "false",
}}

## Prompt: 
${vars.vars.prompt}
`;
}
```

:::note
In this example, we're using Typescript (.ts) - but you can use regular Javascript (.js) too
:::

In Promptfoo tests, load the prompt. Promptfoo tests will pass variables in a vars object. In this vars object, the variables are accessible as vars.vars. The example above shows accessing prompt as vars.vars.prompt.

```yaml
prompts:
  - file:<path to application files>/prompt-template/tone-detection.ts:toneEvaluationInstructions

providers:
  - openai:gpt-4o-mini

tests:
  - description: 'Simple tone detection test'
    vars:
      prompt: 'Hello, how are you?'
    assert:
      - type: is-json
```

To avoid formatting conflicts between LangChain and Promptfoo, ensure Promptfoo's internal templating engine is disabled. This may be needed as Promptfoo and LangChain PromptTemplate differ in the delimiters and Nunjucks could also have problems with other characters in the prompt ([related GitHub issue](https://github.com/promptfoo/promptfoo/pull/405/files)).

Do this by setting the environment variable:

```bash
export PROMPTFOO_DISABLE_TEMPLATING=true
```

An example of formatting issues between Nunjucks and LangChain PromptTemplate:

- `{{...}}` with LangChain PromptTemplate marks escaping the curly brace and `{...}` is used for substitution
- `{{...}}` with Promptfoo is used for substitution

Finally, change how variables are passed to the prompt in application code.

```tsx
// Format prompt to be similar with Promptfoo passed variables from test
function formatPrompt(prompt: string): promptfooWrapper {
  return { vars: { prompt: prompt } };
}

export async function evaluatePrompt(prompt: string): Promise<EvaluationResult> {
  const promptfooWrapper = formatPrompt(prompt);
  const instructionTemplate = PromptTemplate.fromTemplate(evaluationInstructions);

  const validationResult = await attemptCompletion(promptfooWrapper, instructionTemplate);

  // ... Rest of the code
}
```

In conclusion, this setup allows you to load the most up-to-date prompts from your application code, test them continuously, and integrate with LangChain PromptTemplate by properly handling the formatting differences between the two systems. For more information, see the [LangChain PromptTemplate documentation](https://python.langchain.com/api_reference/core/prompts/langchain_core.prompts.prompt.PromptTemplate.html) and [Promptfoo's prompt functions guide](https://www.promptfoo.dev/docs/configuration/parameters/).
