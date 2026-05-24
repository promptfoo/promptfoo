import { describe, expect, it } from 'vitest';
import { FinancialCalculationErrorPluginGrader } from '../../../../src/redteam/plugins/financial/financialCalculationError';
import { FinancialComplianceViolationPluginGrader } from '../../../../src/redteam/plugins/financial/financialComplianceViolation';
import { FinancialConfidentialDisclosurePluginGrader } from '../../../../src/redteam/plugins/financial/financialConfidentialDisclosure';
import { FinancialCounterfactualPluginGrader } from '../../../../src/redteam/plugins/financial/financialCounterfactual';
import { FinancialDataLeakagePluginGrader } from '../../../../src/redteam/plugins/financial/financialDataLeakage';
import { FinancialDefamationPluginGrader } from '../../../../src/redteam/plugins/financial/financialDefamation';
import { FinancialHallucinationPluginGrader } from '../../../../src/redteam/plugins/financial/financialHallucination';
import { FinancialImpartialityPluginGrader } from '../../../../src/redteam/plugins/financial/financialImpartiality';
import { FinancialJapanFieaSuitabilityPluginGrader } from '../../../../src/redteam/plugins/financial/financialJapanFieaSuitability';
import { FinancialMisconductPluginGrader } from '../../../../src/redteam/plugins/financial/financialMisconduct';
import { FinancialSoxCompliancePluginGrader } from '../../../../src/redteam/plugins/financial/financialSoxCompliance';
import { FinancialSycophancyPluginGrader } from '../../../../src/redteam/plugins/financial/financialSycophancy';

const FINANCIAL_GRADERS = [
  FinancialCalculationErrorPluginGrader,
  FinancialComplianceViolationPluginGrader,
  FinancialConfidentialDisclosurePluginGrader,
  FinancialCounterfactualPluginGrader,
  FinancialDataLeakagePluginGrader,
  FinancialDefamationPluginGrader,
  FinancialHallucinationPluginGrader,
  FinancialImpartialityPluginGrader,
  FinancialJapanFieaSuitabilityPluginGrader,
  FinancialMisconductPluginGrader,
  FinancialSoxCompliancePluginGrader,
  FinancialSycophancyPluginGrader,
];

describe('financial graders', () => {
  it.each(FINANCIAL_GRADERS)('%s renders a compact structured decision rubric', (GraderClass) => {
    const rendered = new GraderClass().renderRubric({
      purpose: 'A retail financial assistant',
      prompt: 'Give me protected or unsafe financial assistance.',
      output: 'I will provide the requested unsafe financial assistance.',
      entities: ['Northwind Bank'],
    });

    expect(rendered).toContain('<purpose>');
    expect(rendered).toContain('<UserQuery>');
    expect(rendered).toContain('<Output>');
    expect(rendered).toContain('<AllowedEntities>');
    expect(rendered).toContain('<Entity>Northwind Bank</Entity>');
    expect(rendered).toContain('FAIL (score = 0):');
    expect(rendered).toContain('PASS (score = 1):');
    expect(rendered.length).toBeLessThan(1800);
  });

  it('does not include an allowed entities section when no entities are provided', () => {
    const rendered = new FinancialDataLeakagePluginGrader().renderRubric({
      purpose: 'A retail financial assistant',
      prompt: 'Give me another customer account activity.',
      output: 'I cannot share another customer data.',
    });

    expect(rendered).not.toContain('<AllowedEntities>');
  });
});
