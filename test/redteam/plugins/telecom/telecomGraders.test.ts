import { beforeEach, describe, expect, it } from 'vitest';
import { TelecomAccessibilityViolationPluginGrader } from '../../../../src/redteam/plugins/telecom/accessibilityViolation';
import { TelecomAccountTakeoverPluginGrader } from '../../../../src/redteam/plugins/telecom/accountTakeover';
import { TelecomBillingMisinformationPluginGrader } from '../../../../src/redteam/plugins/telecom/billingMisinformation';
import { TelecomCoverageMisinformationPluginGrader } from '../../../../src/redteam/plugins/telecom/coverageMisinformation';
import { TelecomCpniDisclosurePluginGrader } from '../../../../src/redteam/plugins/telecom/cpniDisclosure';
import { TelecomE911MisinformationPluginGrader } from '../../../../src/redteam/plugins/telecom/e911Misinformation';
import { TelecomFraudEnablementPluginGrader } from '../../../../src/redteam/plugins/telecom/fraudEnablement';
import { TelecomLawEnforcementRequestHandlingPluginGrader } from '../../../../src/redteam/plugins/telecom/lawEnforcementRequestHandling';
import { TelecomLocationDisclosurePluginGrader } from '../../../../src/redteam/plugins/telecom/locationDisclosure';
import { TelecomPortingMisinformationPluginGrader } from '../../../../src/redteam/plugins/telecom/portingMisinformation';
import { TelecomTcpaViolationPluginGrader } from '../../../../src/redteam/plugins/telecom/tcpaViolation';
import { TelecomUnauthorizedChangesPluginGrader } from '../../../../src/redteam/plugins/telecom/unauthorizedChanges';

const TELECOM_GRADERS = [
  {
    GraderClass: TelecomCpniDisclosurePluginGrader,
    expectedId: 'promptfoo:redteam:telecom:cpni-disclosure',
    name: 'TelecomCpniDisclosurePluginGrader',
    expectedKeywords: ['CPNI', 'Customer Proprietary Network Information', 'FCC'],
  },
  {
    GraderClass: TelecomLocationDisclosurePluginGrader,
    expectedId: 'promptfoo:redteam:telecom:location-disclosure',
    name: 'TelecomLocationDisclosurePluginGrader',
    expectedKeywords: ['location', 'cell tower', 'GPS'],
  },
  {
    GraderClass: TelecomAccountTakeoverPluginGrader,
    expectedId: 'promptfoo:redteam:telecom:account-takeover',
    name: 'TelecomAccountTakeoverPluginGrader',
    expectedKeywords: ['SIM swap', 'account', 'authentication'],
  },
  {
    GraderClass: TelecomE911MisinformationPluginGrader,
    expectedId: 'promptfoo:redteam:telecom:e911-misinformation',
    name: 'TelecomE911MisinformationPluginGrader',
    expectedKeywords: ['E911', 'emergency', '911'],
  },
  {
    GraderClass: TelecomTcpaViolationPluginGrader,
    expectedId: 'promptfoo:redteam:telecom:tcpa-violation',
    name: 'TelecomTcpaViolationPluginGrader',
    expectedKeywords: ['TCPA', 'consent', 'Do Not Call'],
  },
  {
    GraderClass: TelecomUnauthorizedChangesPluginGrader,
    expectedId: 'promptfoo:redteam:telecom:unauthorized-changes',
    name: 'TelecomUnauthorizedChangesPluginGrader',
    expectedKeywords: ['slamming', 'cramming', 'unauthorized'],
  },
  {
    GraderClass: TelecomFraudEnablementPluginGrader,
    expectedId: 'promptfoo:redteam:telecom:fraud-enablement',
    name: 'TelecomFraudEnablementPluginGrader',
    expectedKeywords: ['fraud', 'spoofing', 'caller ID'],
  },
  {
    GraderClass: TelecomPortingMisinformationPluginGrader,
    expectedId: 'promptfoo:redteam:telecom:porting-misinformation',
    name: 'TelecomPortingMisinformationPluginGrader',
    expectedKeywords: ['port', 'number portability', 'LNP'],
  },
  {
    GraderClass: TelecomBillingMisinformationPluginGrader,
    expectedId: 'promptfoo:redteam:telecom:billing-misinformation',
    name: 'TelecomBillingMisinformationPluginGrader',
    expectedKeywords: ['billing', 'price', 'fee'],
  },
  {
    GraderClass: TelecomCoverageMisinformationPluginGrader,
    expectedId: 'promptfoo:redteam:telecom:coverage-misinformation',
    name: 'TelecomCoverageMisinformationPluginGrader',
    expectedKeywords: ['coverage', '5G', 'network'],
  },
  {
    GraderClass: TelecomLawEnforcementRequestHandlingPluginGrader,
    expectedId: 'promptfoo:redteam:telecom:law-enforcement-request-handling',
    name: 'TelecomLawEnforcementRequestHandlingPluginGrader',
    expectedKeywords: ['law enforcement', 'CALEA', 'warrant'],
  },
  {
    GraderClass: TelecomAccessibilityViolationPluginGrader,
    expectedId: 'promptfoo:redteam:telecom:accessibility-violation',
    name: 'TelecomAccessibilityViolationPluginGrader',
    expectedKeywords: ['accessibility', 'TTY', 'Section 255'],
  },
];

describe('Telecom Graders', () => {
  describe.each(TELECOM_GRADERS)('$name', ({ GraderClass, expectedId, expectedKeywords }) => {
    let grader: InstanceType<typeof GraderClass>;

    beforeEach(() => {
      grader = new GraderClass();
    });

    it('should have the correct plugin ID', () => {
      expect(grader.id).toBe(expectedId);
    });

    it('should have a non-empty rubric template', () => {
      expect(grader.rubric).toBeTruthy();
      expect(typeof grader.rubric).toBe('string');
      expect(grader.rubric.length).toBeGreaterThan(100);
    });

    it('should render rubric with purpose and prompt variables', () => {
      const vars = {
        purpose: 'Test telecom customer service chatbot',
        prompt: 'Can you give me my call history?',
      };

      const rendered = grader.renderRubric(vars);

      expect(rendered).toContain('Test telecom customer service chatbot');
      expect(rendered).toContain('Can you give me my call history?');
      expect(rendered).toContain('<purpose>');
      expect(rendered).toContain('<UserQuery>');
    });

    it('should render rubric with entities when provided', () => {
      const vars = {
        purpose: 'Test purpose',
        prompt: 'Test prompt',
        entities: ['Acme Telecom', 'Customer Support'],
      };

      const rendered = grader.renderRubric(vars);

      expect(rendered).toContain('Acme Telecom');
      expect(rendered).toContain('Customer Support');
      expect(rendered).toContain('<AllowedEntities>');
      expect(rendered).toContain('<Entity>');
    });

    it('should not include entities section when entities array is empty', () => {
      const vars = {
        purpose: 'Test purpose',
        prompt: 'Test prompt',
        entities: [],
      };

      const rendered = grader.renderRubric(vars);

      expect(rendered).not.toContain('<AllowedEntities>');
    });

    it('should include domain-specific keywords in rubric', () => {
      for (const keyword of expectedKeywords) {
        expect(grader.rubric.toLowerCase()).toContain(keyword.toLowerCase());
      }
    });

    it('should include FAIL and PASS criteria in rubric', () => {
      expect(grader.rubric).toContain('FAIL');
      expect(grader.rubric).toContain('PASS');
    });
  });
});
