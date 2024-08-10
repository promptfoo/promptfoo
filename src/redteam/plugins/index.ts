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
import { OverreliancePlugin } from './overreliance';
import { getPiiLeakTestsForCategory } from './pii';
import { PolicyPlugin } from './policy';
import { PoliticsPlugin } from './politics';
import { RbacPlugin } from './rbac';
import { ShellInjectionPlugin } from './shellInjection';
import { SqlInjectionPlugin } from './sqlInjection';

export interface Plugin {
  key: string;
  action: (
    provider: ApiProvider,
    purpose: string,
    injectVar: string,
    n: number,
    config?: Record<string, any>,
  ) => Promise<TestCase[]>;
}

export const Plugins: Plugin[] = [
  {
    key: 'competitors',
    action: (provider, purpose, injectVar, n) =>
      new CompetitorPlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'contracts',
    action: (provider, purpose, injectVar, n) =>
      new ContractPlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'excessive-agency',
    action: (provider, purpose, injectVar, n) =>
      new ExcessiveAgencyPlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'hallucination',
    action: (provider, purpose, injectVar, n) =>
      new HallucinationPlugin(provider, purpose, injectVar).generateTests(n),
  },
  ...(Object.keys(HARM_PLUGINS).map((category) => ({
    key: category,
    action: (provider, purpose, injectVar, n) =>
      getHarmfulTests(provider, purpose, injectVar, [category], n),
  })) as Plugin[]),
  {
    key: 'hijacking',
    action: (provider, purpose, injectVar, n) =>
      new HijackingPlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'imitation',
    action: async (provider, purpose, injectVar, n) => {
      const plugin = new ImitationPlugin(provider, purpose, injectVar);
      return plugin.generateTests(n);
    },
  },
  {
    key: 'overreliance',
    action: (provider, purpose, injectVar, n) =>
      new OverreliancePlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'sql-injection',
    action: (provider, purpose, injectVar, n) =>
      new SqlInjectionPlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'shell-injection',
    action: (provider, purpose, injectVar, n) =>
      new ShellInjectionPlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'debug-access',
    action: (provider, purpose, injectVar, n) =>
      new DebugAccessPlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'rbac',
    action: (provider, purpose, injectVar, n) =>
      new RbacPlugin(provider, purpose, injectVar).generateTests(n),
  },
  {
    key: 'politics',
    action: (provider, purpose, injectVar, n) =>
      new PoliticsPlugin(provider, purpose, injectVar).generateTests(n),
  },
  ...(PII_PLUGINS.map((category) => ({
    key: category,
    action: (provider, purpose, injectVar, n) =>
      getPiiLeakTestsForCategory(provider, purpose, injectVar, category, n),
  })) as Plugin[]),
  {
    key: 'policy',
    action: (provider, purpose, injectVar, n, config) => {
      invariant(config?.policy, 'Policy plugin requires a config');
      const plugin = new PolicyPlugin(provider, purpose, injectVar, config as { policy: string });
      return plugin.generateTests(n);
    },
  },
  {
    key: 'bola',
    action: (provider, purpose, injectVar, n, config) =>
      new BolaPlugin(provider, purpose, injectVar, config).generateTests(n),
  },
  {
    key: 'bfla',
    action: (provider, purpose, injectVar, n, config) =>
      new BflaPlugin(provider, purpose, injectVar, config).generateTests(n),
  },
];
