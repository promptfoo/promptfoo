import invariant from 'tiny-invariant';
import type { ApiProvider, TestCase } from '../../types';
import { HARM_PLUGINS, PII_PLUGINS } from '../constants';
import { BflaPlugin } from './bfla';
import { BolaPlugin } from './bola';
import { CompetitorPlugin } from './competitors';
import { ContractPlugin } from './contracts';
import { DebugAccessPlugin } from './debugAccess';
import { ExcessiveAgencyPlugin } from './excessiveAgency';
import { HallucinationPlugin } from './hallucination';
import { getHarmfulTests } from './harmful';
import { HijackingPlugin } from './hijacking';
import { ImitationPlugin } from './imitation';
import { IndirectPromptInjectionPlugin } from './indirectPromptInjection';
import { OverreliancePlugin } from './overreliance';
import { getPiiLeakTestsForCategory } from './pii';
import { PolicyPlugin } from './policy';
import { PoliticsPlugin } from './politics';
import { PromptExtractionPlugin } from './promptExtraction';
import { RbacPlugin } from './rbac';
import { ShellInjectionPlugin } from './shellInjection';
import { SqlInjectionPlugin } from './sqlInjection';
import { SsrfPlugin } from './ssrf';

export interface Plugin {
  key: string;
  validate?: (config: Record<string, any>) => void;
  action: (
    provider: ApiProvider,
    purpose: string,
    injectVar: string,
    n: number,
    delayMs: number,
    config?: Record<string, any>,
  ) => Promise<TestCase[]>;
}

export const Plugins: Plugin[] = [
  {
    key: 'competitors',
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new CompetitorPlugin(provider, purpose, injectVar, config).generateTests(n, delayMs),
  },
  {
    key: 'contracts',
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new ContractPlugin(provider, purpose, injectVar, config).generateTests(n, delayMs),
  },
  {
    key: 'excessive-agency',
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new ExcessiveAgencyPlugin(provider, purpose, injectVar, config).generateTests(n, delayMs),
  },
  {
    key: 'hallucination',
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new HallucinationPlugin(provider, purpose, injectVar, config).generateTests(n, delayMs),
  },
  ...(Object.keys(HARM_PLUGINS).map((category) => ({
    key: category,
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      getHarmfulTests(provider, purpose, injectVar, [category], n, delayMs),
  })) as Plugin[]),
  {
    key: 'hijacking',
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new HijackingPlugin(provider, purpose, injectVar, config).generateTests(n, delayMs),
  },
  {
    key: 'imitation',
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new ImitationPlugin(provider, purpose, injectVar, config).generateTests(n, delayMs),
  },
  {
    key: 'overreliance',
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new OverreliancePlugin(provider, purpose, injectVar, config).generateTests(n, delayMs),
  },
  {
    key: 'sql-injection',
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new SqlInjectionPlugin(provider, purpose, injectVar, config).generateTests(n, delayMs),
  },
  {
    key: 'shell-injection',
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new ShellInjectionPlugin(provider, purpose, injectVar, config).generateTests(n, delayMs),
  },
  {
    key: 'debug-access',
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new DebugAccessPlugin(provider, purpose, injectVar, config).generateTests(n, delayMs),
  },
  {
    key: 'rbac',
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new RbacPlugin(provider, purpose, injectVar, config).generateTests(n, delayMs),
  },
  {
    key: 'politics',
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new PoliticsPlugin(provider, purpose, injectVar, config).generateTests(n, delayMs),
  },
  ...(PII_PLUGINS.map((category) => ({
    key: category,
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      getPiiLeakTestsForCategory(provider, purpose, injectVar, category, n),
  })) as Plugin[]),
  {
    key: 'policy',
    validate: (config) =>
      invariant(config.policy, 'Policy plugin requires `config.policy` to be set'),
    action: (provider, purpose, injectVar, n, delayMs, config) => {
      return new PolicyPlugin(
        provider,
        purpose,
        injectVar,
        config as { policy: string; language?: string },
      ).generateTests(n, delayMs);
    },
  },
  {
    key: 'bola',
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new BolaPlugin(provider, purpose, injectVar, config).generateTests(n, delayMs),
  },
  {
    key: 'bfla',
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new BflaPlugin(provider, purpose, injectVar, config).generateTests(n, delayMs),
  },
  {
    key: 'ssrf',
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new SsrfPlugin(provider, purpose, injectVar, config).generateTests(n, delayMs),
  },
  {
    key: 'prompt-extraction',
    validate: (config) =>
      invariant(
        config.systemPrompt,
        'Prompt extraction plugin requires `config.systemPrompt` to be set',
      ),
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new PromptExtractionPlugin(
        provider,
        purpose,
        injectVar,
        config as { systemPrompt: string },
      ).generateTests(n, delayMs),
  },
  {
    key: 'indirect-prompt-injection',
    validate: (config) => {
      invariant(
        config.indirectInjectionVar,
        'Indirect prompt injection plugin requires `config.indirectInjectionVar` to be set',
      );
    },
    action: (provider, purpose, injectVar, n, delayMs, config) =>
      new IndirectPromptInjectionPlugin(
        provider,
        purpose,
        injectVar,
        config as { indirectInjectionVar: string },
      ).generateTests(n, delayMs),
  },
];
