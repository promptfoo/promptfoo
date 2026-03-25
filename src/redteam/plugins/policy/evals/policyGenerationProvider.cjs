const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

async function loadPolicyPlugin() {
  const candidates = [
    path.resolve(__dirname, '../index.ts'),
    path.resolve(__dirname, '../index.js'),
  ];

  let lastError;
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue;
    }
    try {
      const mod = await import(pathToFileURL(candidate).href);
      if (mod.PolicyPlugin) {
        return mod.PolicyPlugin;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `Unable to load PolicyPlugin from source or dist. Last error: ${lastError?.message || 'unknown error'}`,
  );
}

class OpenAiGenerationProvider {
  constructor(config) {
    this.config = config || {};
    this.lastPrompt = null;
    this.lastOutput = null;
    this.lastTokenUsage = undefined;
  }

  id() {
    return `openai:${this.config.model || 'gpt-4.1-mini'}`;
  }

  async callApi(prompt) {
    this.lastPrompt = prompt;

    if (!process.env.OPENAI_API_KEY) {
      return {
        error: 'OPENAI_API_KEY is required to generate policy test cases.',
      };
    }

    const requestBody = {
      model: this.config.model || 'gpt-4.1-mini',
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      max_completion_tokens: Number(this.config.max_tokens ?? 1200),
    };

    if (typeof this.config.temperature !== 'undefined') {
      requestBody.temperature = Number(this.config.temperature);
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        error: `OpenAI request failed (${response.status}): ${text}`,
      };
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    this.lastOutput = typeof content === 'string' ? content : JSON.stringify(content);
    this.lastTokenUsage = data?.usage
      ? {
          total: data.usage.total_tokens,
          prompt: data.usage.prompt_tokens,
          completion: data.usage.completion_tokens,
        }
      : undefined;

    return {
      output: this.lastOutput || '',
      tokenUsage: this.lastTokenUsage,
    };
  }
}

class PolicyGenerationHarnessProvider {
  constructor(options) {
    this.providerId = options.id || 'policy-generation-harness';
    this.config = options.config || {};
  }

  id() {
    return this.providerId;
  }

  async callApi(_prompt, context) {
    const vars = context?.vars || {};
    const PolicyPlugin = await loadPolicyPlugin();

    const generationProvider = new OpenAiGenerationProvider(this.config);
    const pluginConfig = {
      policy: String(vars.policy || ''),
    };

    if (vars.language) {
      pluginConfig.language = String(vars.language);
    }

    if (vars.modifiers && typeof vars.modifiers === 'object') {
      pluginConfig.modifiers = vars.modifiers;
    }

    if (vars.inputs && typeof vars.inputs === 'object') {
      pluginConfig.inputs = vars.inputs;
    }

    if (Array.isArray(vars.examples)) {
      pluginConfig.examples = vars.examples;
    }

    const injectVar = String(vars.inject_var || '__prompt');
    const count = Number(vars.n || this.config.defaultCount || 3);
    const plugin = new PolicyPlugin(
      generationProvider,
      String(vars.purpose || ''),
      injectVar,
      pluginConfig,
    );
    const tests = await plugin.generateTests(count, 0);

    const output = {
      caseId: vars.case_id,
      caseName: vars.case_name,
      caseType: vars.case_type,
      purpose: vars.purpose,
      policy: vars.policy,
      language: pluginConfig.language || null,
      modifiers: pluginConfig.modifiers || null,
      inputs: pluginConfig.inputs || null,
      requestedCount: count,
      generatedCount: tests.length,
      generationPrompt: generationProvider.lastPrompt,
      rawModelOutput: generationProvider.lastOutput,
      generatedCases: tests.map((test, index) => ({
        index: index + 1,
        vars: test.vars,
        metadata: test.metadata,
      })),
    };

    return {
      output: JSON.stringify(output, null, 2),
      tokenUsage: generationProvider.lastTokenUsage,
    };
  }
}

module.exports = PolicyGenerationHarnessProvider;
