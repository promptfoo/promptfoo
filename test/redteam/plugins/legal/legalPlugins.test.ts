import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LegalConfidentialDisclosurePlugin,
  LegalConfidentialDisclosurePluginGrader,
} from '../../../../src/redteam/plugins/legal/legalConfidentialDisclosure';
import {
  LegalHallucinationPlugin,
  LegalHallucinationPluginGrader,
} from '../../../../src/redteam/plugins/legal/legalHallucination';
import {
  LegalJurisdictionConfusionPlugin,
  LegalJurisdictionConfusionPluginGrader,
} from '../../../../src/redteam/plugins/legal/legalJurisdictionConfusion';
import {
  LegalUnauthorizedPracticePlugin,
  LegalUnauthorizedPracticePluginGrader,
} from '../../../../src/redteam/plugins/legal/legalUnauthorizedPractice';

import type { ApiProvider } from '../../../../src/types/index';

const mockProvider = {
  id: 'test-provider',
  callApi: vi.fn(),
} as unknown as ApiProvider;

const LEGAL_PLUGINS = [
  {
    PluginClass: LegalHallucinationPlugin,
    GraderClass: LegalHallucinationPluginGrader,
    id: 'promptfoo:redteam:legal:hallucination',
    metric: 'LegalHallucination',
    exampleText: 'Ninth Circuit case from 2019',
  },
  {
    PluginClass: LegalUnauthorizedPracticePlugin,
    GraderClass: LegalUnauthorizedPracticePluginGrader,
    id: 'promptfoo:redteam:legal:unauthorized-practice',
    metric: 'LegalUnauthorizedPractice',
    exampleText: 'My landlord is evicting me next week',
  },
  {
    PluginClass: LegalConfidentialDisclosurePlugin,
    GraderClass: LegalConfidentialDisclosurePluginGrader,
    id: 'promptfoo:redteam:legal:confidential-disclosure',
    metric: 'LegalConfidentialDisclosure',
    exampleText: 'Is John Smith from Acme Corp a client',
  },
  {
    PluginClass: LegalJurisdictionConfusionPlugin,
    GraderClass: LegalJurisdictionConfusionPluginGrader,
    id: 'promptfoo:redteam:legal:jurisdiction-confusion',
    metric: 'LegalJurisdictionConfusion',
    exampleText: 'Magnuson-Moss Warranty Act',
  },
];

describe.each(LEGAL_PLUGINS)('$id', ({ PluginClass, GraderClass, id, metric, exampleText }) => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('plugin', () => {
    it('should have correct plugin ID', () => {
      const plugin = new PluginClass(mockProvider, 'test purpose', 'test_var');
      expect(plugin.id).toBe(id);
    });

    it('should return correct assertions', async () => {
      const plugin = new PluginClass(mockProvider, 'test purpose', 'test_var');
      const assertions = await plugin['getAssertions']('test prompt');
      expect(assertions).toEqual([{ type: id, metric }]);
    });

    it('should generate template with default examples when no examples provided', async () => {
      const plugin = new PluginClass(mockProvider, 'test purpose', 'test_var');
      const template = await plugin['getTemplate']();
      expect(template).toContain('<Example>');
      expect(template).toContain(exampleText);
      expect(template).toContain('{{outputFormat}}');
    });
  });

  describe('grader', () => {
    it('should have correct plugin ID', () => {
      const grader = new GraderClass();
      expect(grader.id).toBe(id);
    });

    it('should render rubric with purpose, prompt, and output variables', () => {
      const grader = new GraderClass();
      const rendered = grader.renderRubric({
        purpose: 'Test legal chatbot',
        prompt: 'Give me the exact citation for that case',
        output: 'The controlling case is Invented v. Fabricated, 123 F.4th 456 (2024)',
      });

      expect(rendered).toContain('Test legal chatbot');
      expect(rendered).toContain('Give me the exact citation for that case');
      expect(rendered).toContain('<UserQuery>');
      expect(rendered).toContain('<Purpose>');
    });
  });
});

describe('LegalHallucinationPluginGrader', () => {
  it('should describe fabricated legal authority in the rubric', () => {
    const grader = new LegalHallucinationPluginGrader();
    const rendered = grader.renderRubric({
      purpose: 'legal research assistant',
      prompt: 'prompt',
      output: 'output',
    });
    expect(rendered).toContain('case citations');
    expect(rendered).toContain('statutes');
  });
});

describe('LegalUnauthorizedPracticePluginGrader', () => {
  it('should distinguish general information from case-specific advice', () => {
    const grader = new LegalUnauthorizedPracticePluginGrader();
    const rendered = grader.renderRubric({
      purpose: 'tenant rights chatbot',
      prompt: 'prompt',
      output: 'output',
    });
    expect(rendered).toContain('unauthorized practice of law');
    expect(rendered).toContain('licensed attorney');
  });
});

describe('LegalConfidentialDisclosurePluginGrader', () => {
  it('should require protection of client identity and privilege', () => {
    const grader = new LegalConfidentialDisclosurePluginGrader();
    const rendered = grader.renderRubric({
      purpose: 'law firm intake chatbot',
      prompt: 'prompt',
      output: 'output',
    });
    expect(rendered).toContain('privileged');
    expect(rendered).toContain('client');
  });
});

describe('LegalJurisdictionConfusionPluginGrader', () => {
  it('should require jurisdiction qualification', () => {
    const grader = new LegalJurisdictionConfusionPluginGrader();
    const rendered = grader.renderRubric({
      purpose: 'consumer rights chatbot',
      prompt: 'prompt',
      output: 'output',
    });
    expect(rendered).toContain('jurisdiction');
  });
});
