import { normalizeProviderRef } from './providerRef';
import { sanitizeObject, sanitizeTracingConfigForPersistence } from './sanitizer';

import type { UnifiedConfig } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripConfigPrompt(prompt: unknown): unknown {
  if (typeof prompt === 'string') {
    return '[prompt stripped]';
  }
  if (Array.isArray(prompt)) {
    return prompt.map(stripConfigPrompt);
  }
  if (!isRecord(prompt)) {
    return prompt;
  }

  const isPromptObject = ['id', 'raw', 'template', 'display', 'label'].some((key) => key in prompt);
  if (isPromptObject) {
    return {
      ...prompt,
      ...('raw' in prompt && { raw: '[prompt stripped]' }),
      ...('template' in prompt && { template: '[prompt stripped]' }),
      ...('display' in prompt && { display: '[prompt stripped]' }),
      ...('label' in prompt && { label: '[prompt stripped]' }),
    };
  }

  return Object.fromEntries(
    Object.entries(prompt).map(([key, value]) => [key, stripConfigPrompt(value)]),
  );
}

function projectConfigTest(
  test: unknown,
  options: { stripVars: boolean; stripPrompt: boolean },
): unknown {
  if (Array.isArray(test)) {
    return test.map((entry) => projectConfigTest(entry, options));
  }
  if (!isRecord(test)) {
    return test;
  }
  const projected: Record<string, unknown> = {
    ...test,
    ...(options.stripVars && 'vars' in test && { vars: undefined }),
    ...(options.stripPrompt && 'prompts' in test && { prompts: stripConfigPrompt(test.prompts) }),
  };
  if (options.stripPrompt && isRecord(test.options)) {
    const { prefix: _prefix, suffix: _suffix, ...rest } = test.options;
    projected.options = rest;
  }
  return projected;
}

function stripConfigProviderPrompts(provider: unknown): unknown {
  if (Array.isArray(provider)) {
    return provider.map(stripConfigProviderPrompts);
  }
  const descriptor = normalizeProviderRef(provider);
  if (descriptor.kind === 'map' && isRecord(provider)) {
    const key = descriptor.loadProviderPath;
    return {
      ...provider,
      [key]: projectConfigTest(provider[key], { stripPrompt: true, stripVars: false }),
    };
  }
  return projectConfigTest(provider, { stripPrompt: true, stripVars: false });
}

export function sanitizeConfigForOutput(
  config: Partial<UnifiedConfig>,
  flags: { shouldStripPromptText: boolean; shouldStripTestVars: boolean },
): Partial<UnifiedConfig> {
  const sanitized = sanitizeObject(sanitizeTracingConfigForPersistence(config), {
    context: 'output config',
    throwOnError: true,
    maxDepth: Number.POSITIVE_INFINITY,
  }) as Partial<UnifiedConfig>;
  if (!isRecord(sanitized)) {
    return sanitized;
  }
  const projected = sanitized as Record<string, unknown>;
  const { shouldStripPromptText: stripPrompt, shouldStripTestVars: stripVars } = flags;

  if (stripPrompt) {
    if ('prompts' in projected) {
      projected.prompts = stripConfigPrompt(projected.prompts);
    }
    if ('providers' in projected) {
      projected.providers = stripConfigProviderPrompts(projected.providers);
    }
    if (isRecord(projected.providerPromptMap)) {
      projected.providerPromptMap = Object.fromEntries(
        Object.entries(projected.providerPromptMap).map(([provider, prompts]) => [
          provider,
          stripConfigPrompt(prompts),
        ]),
      );
    }
  }
  if (stripVars || stripPrompt) {
    if ('tests' in projected) {
      projected.tests = projectConfigTest(projected.tests, { stripPrompt, stripVars });
    }
    if ('defaultTest' in projected) {
      projected.defaultTest = projectConfigTest(projected.defaultTest, { stripPrompt, stripVars });
    }
    if (Array.isArray(projected.scenarios)) {
      projected.scenarios = projected.scenarios.map((scenario) => {
        if (!isRecord(scenario)) {
          return scenario;
        }
        return {
          ...scenario,
          ...('config' in scenario && {
            config: projectConfigTest(scenario.config, { stripPrompt, stripVars }),
          }),
          ...('tests' in scenario && {
            tests: projectConfigTest(scenario.tests, { stripPrompt, stripVars }),
          }),
        };
      });
    }
  }

  return sanitized;
}
