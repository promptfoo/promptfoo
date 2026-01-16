/**
 * Config generator for the init wizard.
 *
 * Generates promptfooconfig.yaml and supporting files based on wizard selections.
 * Reuses templates from src/onboarding.ts.
 */

import { getNunjucksEngine } from '../../../util/templates';
import type { ProviderOptions } from '../../../types/providers';
import type { FileToCreate, Language, UseCase } from '../types';
import {
  needsExecProvider,
  needsJavaScriptProvider,
  needsPythonProvider,
} from './providers';

/**
 * Config template - matches src/onboarding.ts CONFIG_TEMPLATE
 */
const CONFIG_TEMPLATE = `# yaml-language-server: $schema=https://promptfoo.dev/config-schema.json

# Learn more about building a configuration: https://promptfoo.dev/docs/configuration/guide

description: "My eval"

prompts:
  {% for prompt in prompts -%}
  - {{prompt | dump }}
  {% endfor %}

providers:
  {% for provider in providers -%}
  - {{provider | dump }}
  {% endfor %}

tests:
{%- if type == 'rag' or type == 'agent' %}
  - vars:
      inquiry: "I have a problem with my order"
      {% if language == 'python' -%}
      context: file://context.py
      {%- elif language == 'javascript' -%}
      context: file://context.js
      {%- else -%}
      context: file://context.py
      {%- endif %}

  - vars:
      inquiry: "I want to return my widget"
      # See how to use dynamic context to e.g. use a vector store https://promptfoo.dev/docs/guides/evaluate-rag/#using-dynamic-context
      {% if language == 'javascript' -%}
      context: file://context.js
      {%- else -%}
      context: file://context.py
      {%- endif %}
    assert:
      # For more information on assertions, see https://promptfoo.dev/docs/configuration/expected-outputs

      # Make sure output contains the phrase "return label"
      - type: icontains
        value: "return label"

      # Prefer shorter outputs
      {% if language == 'python' -%}
      - type: python
        value: 1 / (len(output) + 1)
      {%- else -%}
      - type: javascript
        value: 1 / (output.length + 1)
      {%- endif %}

  - vars:
      inquiry: "I need help with my account"
      context: |
        You can also hardcode context directly in the configuration.
        Username: Foobar
        Account ID: 123456
    assert:
      # For more information on model-graded evals, see https://promptfoo.dev/docs/configuration/expected-outputs/model-graded
      - type: llm-rubric
        value: ensure that the output is friendly and empathetic
{%- else %}
  - vars:
      topic: bananas

  - vars:
      topic: avocado toast
    assert:
      # For more information on assertions, see https://promptfoo.dev/docs/configuration/expected-outputs

      # Make sure output contains the word "avocado"
      - type: icontains
        value: avocado

      # Prefer shorter outputs
      - type: javascript
        value: 1 / (output.length + 1)

  - vars:
      topic: new york city
    assert:
      # For more information on model-graded evals, see https://promptfoo.dev/docs/configuration/expected-outputs/model-graded
      - type: llm-rubric
        value: ensure that the output is funny
{% endif %}
`;

/**
 * Python provider template
 */
const PYTHON_PROVIDER = `# Learn more about building a Python provider: https://promptfoo.dev/docs/providers/python/

def call_api(prompt, options, context):
    # The 'options' parameter contains additional configuration for the API call.
    config = options.get('config', None)
    additional_option = config.get('additionalOption', None) if config else None

    # The 'context' parameter provides info about which vars were used to create the final prompt.
    user_variable = context['vars'].get('userVariable', None)

    # The prompt is the final prompt string after the variables have been processed.
    # Custom logic to process the prompt goes here.
    # For instance, you might call an external API or run some computations.
    # TODO: Replace with actual LLM API implementation.
    def call_llm(prompt):
        return f"Stub response for prompt: {prompt}"
    output = call_llm(prompt)

    # The result should be a dictionary with at least an 'output' field.
    result = {
        "output": output,
    }

    # Optional: Add error information if something went wrong
    # result['error'] = "An error occurred during processing"

    # Optional: Report token usage if you track it
    # result['tokenUsage'] = {"total": 100, "prompt": 50, "completion": 50}

    # Optional: Report guardrail triggers
    # result['guardrails'] = {"flagged": True}

    return result
`;

/**
 * JavaScript provider template
 */
const JAVASCRIPT_PROVIDER = `// Learn more about building a JavaScript provider: https://promptfoo.dev/docs/providers/custom-api
// customApiProvider.js

class CustomApiProvider {
  constructor(options) {
    // Provider ID can be overridden by the config file (e.g. when using multiple of the same provider)
    this.providerId = options.id || 'custom provider';

    // options.config contains any custom options passed to the provider
    this.config = options.config;
  }

  id() {
    return this.providerId;
  }

  async callApi(prompt, context) {
    // Add your custom API logic here
    // Use options like: \`this.config.temperature\`, \`this.config.max_tokens\`, etc.

    console.log('Vars for this test case:', JSON.stringify(context.vars));

    return {
      // Required
      output: 'Model output',

      // Optional
      tokenUsage: {
        total: 10,
        prompt: 5,
        completion: 5,
      },
    };
  }
}

module.exports = CustomApiProvider;
`;

/**
 * Bash provider template
 */
const BASH_PROVIDER = `# Learn more about building any generic provider: https://promptfoo.dev/docs/providers/custom-script

# Anything printed to standard output will be captured as the output of the provider

echo "This is the LLM output"

# You can also call external scripts or executables
php my_script.php
`;

/**
 * Windows provider template
 */
const WINDOWS_PROVIDER = `@echo off
REM Learn more about building any generic provider: https://promptfoo.dev/docs/providers/custom-script

REM Anything printed to standard output will be captured as the output of the provider

echo This is the LLM output

REM You can also call external scripts or executables
REM php my_script.php
`;

/**
 * Python context loader template
 */
const PYTHON_VAR = `# Learn more about using dynamic variables: https://promptfoo.dev/docs/configuration/guide/#import-vars-from-separate-files
def get_var(var_name, prompt, other_vars):
    # This is where you can fetch documents from a database, call an API, etc.
    # ...

    if var_name == 'context':
        # Return value based on the variable name and test context
        return {
            'output': f"... Documents for {other_vars['inquiry']} in prompt: {prompt} ..."
        }

    # Default variable value
    return {'output': 'Document A, Document B, Document C, ...'}

    # Handle potential errors
    # return { 'error': 'Error message' }
`;

/**
 * JavaScript context loader template
 */
const JAVASCRIPT_VAR = `// Learn more about using dynamic variables: https://promptfoo.dev/docs/configuration/guide/#import-vars-from-separate-files
module.exports = function (varName, prompt, otherVars) {
  // This is where you can fetch documents from a database, call an API, etc.
  // ...

  if (varName === 'context') {
    // Return value based on the variable name and test context
    return {
      output: \`... Documents for \${otherVars.inquiry} for prompt: \${prompt} ...\`
    };
  }

  // Default variable value
  return {
    output: 'Document A, Document B, Document C, ...',
  };

  // Handle potential errors
  // return { error: 'Error message' }
};
`;

/**
 * README template
 */
const DEFAULT_README = `To get started, set your OPENAI_API_KEY environment variable, or other required keys for the providers you selected.

Next, edit promptfooconfig.yaml.

Then run:
\`\`\`
promptfoo eval
\`\`\`

Afterwards, you can view the results by running \`promptfoo view\`
`;

export interface GenerateConfigOptions {
  useCase: UseCase;
  language: Language;
  providers: (string | ProviderOptions)[];
}

/**
 * Generate prompts based on use case.
 */
function getPrompts(useCase: UseCase, numProviders: number): string[] {
  if (useCase === 'compare') {
    const prompts = ['Write a tweet about {{topic}}'];
    if (numProviders < 3) {
      prompts.push('Write a concise, funny tweet about {{topic}}');
    }
    return prompts;
  } else if (useCase === 'rag') {
    return [
      'Write a customer service response to:\n\n{{inquiry}}\n\nUse these documents:\n\n{{context}}',
    ];
  } else if (useCase === 'agent') {
    return ['Fulfill this user helpdesk ticket: {{inquiry}}'];
  }
  return ['Write a tweet about {{topic}}'];
}

/**
 * Generate all files to be created based on wizard selections.
 */
export function generateFiles(options: GenerateConfigOptions): FileToCreate[] {
  const { useCase, language, providers } = options;
  const files: FileToCreate[] = [];

  // Generate prompts
  const prompts = getPrompts(useCase, providers.length);

  // Generate config YAML
  const nunjucks = getNunjucksEngine();
  const config = nunjucks.renderString(CONFIG_TEMPLATE, {
    prompts,
    providers,
    type: useCase,
    language,
  });

  files.push({
    path: 'promptfooconfig.yaml',
    contents: config,
    required: true,
  });

  // README
  files.push({
    path: 'README.md',
    contents: DEFAULT_README,
    required: false,
  });

  // Provider scripts based on selection
  if (needsPythonProvider(providers)) {
    files.push({
      path: 'provider.py',
      contents: PYTHON_PROVIDER,
      required: true,
    });
  }

  if (needsJavaScriptProvider(providers)) {
    files.push({
      path: 'provider.js',
      contents: JAVASCRIPT_PROVIDER,
      required: true,
    });
  }

  if (needsExecProvider(providers)) {
    const isWindows = process.platform === 'win32';
    files.push({
      path: isWindows ? 'provider.bat' : 'provider.sh',
      contents: isWindows ? WINDOWS_PROVIDER : BASH_PROVIDER,
      required: true,
    });
  }

  // Context loader for RAG/Agent
  if (useCase === 'rag' || useCase === 'agent') {
    if (language === 'javascript') {
      files.push({
        path: 'context.js',
        contents: JAVASCRIPT_VAR,
        required: true,
      });
    } else {
      // Default to Python
      files.push({
        path: 'context.py',
        contents: PYTHON_VAR,
        required: true,
      });
    }
  }

  return files;
}

/**
 * Get the generated config YAML string.
 */
export function generateConfigYaml(options: GenerateConfigOptions): string {
  const { useCase, language, providers } = options;
  const prompts = getPrompts(useCase, providers.length);

  const nunjucks = getNunjucksEngine();
  return nunjucks.renderString(CONFIG_TEMPLATE, {
    prompts,
    providers,
    type: useCase,
    language,
  });
}
