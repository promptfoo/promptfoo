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
    name: 'TelecomCpniDisclosurePluginGrader',
  },
  {
    GraderClass: TelecomLocationDisclosurePluginGrader,
    name: 'TelecomLocationDisclosurePluginGrader',
  },
  {
    GraderClass: TelecomAccountTakeoverPluginGrader,
    name: 'TelecomAccountTakeoverPluginGrader',
  },
  {
    GraderClass: TelecomE911MisinformationPluginGrader,
    name: 'TelecomE911MisinformationPluginGrader',
  },
  {
    GraderClass: TelecomTcpaViolationPluginGrader,
    name: 'TelecomTcpaViolationPluginGrader',
  },
  {
    GraderClass: TelecomUnauthorizedChangesPluginGrader,
    name: 'TelecomUnauthorizedChangesPluginGrader',
  },
  {
    GraderClass: TelecomFraudEnablementPluginGrader,
    name: 'TelecomFraudEnablementPluginGrader',
  },
  {
    GraderClass: TelecomPortingMisinformationPluginGrader,
    name: 'TelecomPortingMisinformationPluginGrader',
  },
  {
    GraderClass: TelecomBillingMisinformationPluginGrader,
    name: 'TelecomBillingMisinformationPluginGrader',
  },
  {
    GraderClass: TelecomCoverageMisinformationPluginGrader,
    name: 'TelecomCoverageMisinformationPluginGrader',
  },
  {
    GraderClass: TelecomLawEnforcementRequestHandlingPluginGrader,
    name: 'TelecomLawEnforcementRequestHandlingPluginGrader',
  },
  {
    GraderClass: TelecomAccessibilityViolationPluginGrader,
    name: 'TelecomAccessibilityViolationPluginGrader',
  },
];

describe('Telecom Graders', () => {
  describe.each(TELECOM_GRADERS)('$name', ({ GraderClass }) => {
    let grader: InstanceType<typeof GraderClass>;

    beforeEach(() => {
      grader = new GraderClass();
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
  });
});
