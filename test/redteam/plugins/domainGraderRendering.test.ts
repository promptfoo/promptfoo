import { describe, expect, it } from 'vitest';
import { getGraderById } from '../../../src/redteam/graders';
import { BiasGrader } from '../../../src/redteam/plugins/bias';
import { CoppaGrader } from '../../../src/redteam/plugins/compliance/coppa';
import { FerpaGrader } from '../../../src/redteam/plugins/compliance/ferpa';
import { EcommerceComplianceBypassGrader } from '../../../src/redteam/plugins/ecommerce/ecommerceComplianceBypass';
import { EcommerceOrderFraudGrader } from '../../../src/redteam/plugins/ecommerce/ecommerceOrderFraud';
import { EcommercePciDssGrader } from '../../../src/redteam/plugins/ecommerce/ecommercePciDss';
import { EcommercePriceManipulationGrader } from '../../../src/redteam/plugins/ecommerce/ecommercePriceManipulation';
import { FinancialCalculationErrorPluginGrader } from '../../../src/redteam/plugins/financial/financialCalculationError';
import { FinancialComplianceViolationPluginGrader } from '../../../src/redteam/plugins/financial/financialComplianceViolation';
import { FinancialConfidentialDisclosurePluginGrader } from '../../../src/redteam/plugins/financial/financialConfidentialDisclosure';
import { FinancialCounterfactualPluginGrader } from '../../../src/redteam/plugins/financial/financialCounterfactual';
import { FinancialDataLeakagePluginGrader } from '../../../src/redteam/plugins/financial/financialDataLeakage';
import { FinancialDefamationPluginGrader } from '../../../src/redteam/plugins/financial/financialDefamation';
import { FinancialHallucinationPluginGrader } from '../../../src/redteam/plugins/financial/financialHallucination';
import { FinancialImpartialityPluginGrader } from '../../../src/redteam/plugins/financial/financialImpartiality';
import { FinancialJapanFieaSuitabilityPluginGrader } from '../../../src/redteam/plugins/financial/financialJapanFieaSuitability';
import { FinancialMisconductPluginGrader } from '../../../src/redteam/plugins/financial/financialMisconduct';
import { FinancialSoxCompliancePluginGrader } from '../../../src/redteam/plugins/financial/financialSoxCompliance';
import { FinancialSycophancyPluginGrader } from '../../../src/redteam/plugins/financial/financialSycophancy';
import { InsuranceCoverageDiscriminationPluginGrader } from '../../../src/redteam/plugins/insurance/coverageDiscrimination';
import { InsuranceDataDisclosurePluginGrader } from '../../../src/redteam/plugins/insurance/dataDisclosure';
import { InsuranceNetworkMisinformationPluginGrader } from '../../../src/redteam/plugins/insurance/networkMisinformation';
import { InsurancePhiDisclosurePluginGrader } from '../../../src/redteam/plugins/insurance/phiDisclosure';
import { MedicalAnchoringBiasPluginGrader } from '../../../src/redteam/plugins/medical/medicalAnchoringBias';
import { MedicalFdaAiDisclosurePluginGrader } from '../../../src/redteam/plugins/medical/medicalFdaAiDisclosure';
import { MedicalFdaCyberAccessControlPluginGrader } from '../../../src/redteam/plugins/medical/medicalFdaCyberAccessControl';
import { MedicalFdaCyberAuditTamperingPluginGrader } from '../../../src/redteam/plugins/medical/medicalFdaCyberAuditTampering';
import { MedicalHallucinationPluginGrader } from '../../../src/redteam/plugins/medical/medicalHallucination';
import { MedicalIncorrectKnowledgePluginGrader } from '../../../src/redteam/plugins/medical/medicalIncorrectKnowledge';
import { MedicalOffLabelUsePluginGrader } from '../../../src/redteam/plugins/medical/medicalOffLabelUse';
import { MedicalPrioritizationErrorPluginGrader } from '../../../src/redteam/plugins/medical/medicalPrioritizationError';
import { MedicalSycophancyPluginGrader } from '../../../src/redteam/plugins/medical/medicalSycophancy';
import { OffTopicPluginGrader } from '../../../src/redteam/plugins/offTopic';
import { PharmacyControlledSubstanceCompliancePluginGrader } from '../../../src/redteam/plugins/pharmacy/controlledSubstanceCompliance';
import { PharmacyDosageCalculationPluginGrader } from '../../../src/redteam/plugins/pharmacy/dosageCalculation';
import { PharmacyDrugInteractionPluginGrader } from '../../../src/redteam/plugins/pharmacy/drugInteraction';
import { RealEstateAccessibilityDiscriminationPluginGrader } from '../../../src/redteam/plugins/realestate/accessibilityDiscrimination';
import { RealEstateAdvertisingDiscriminationPluginGrader } from '../../../src/redteam/plugins/realestate/advertisingDiscrimination';
import { RealEstateDiscriminatoryListingsPluginGrader } from '../../../src/redteam/plugins/realestate/discriminatoryListings';
import { RealEstateFairHousingDiscriminationPluginGrader } from '../../../src/redteam/plugins/realestate/fairHousingDiscrimination';
import { RealEstateLendingDiscriminationPluginGrader } from '../../../src/redteam/plugins/realestate/lendingDiscrimination';
import { RealEstateSourceOfIncomePluginGrader } from '../../../src/redteam/plugins/realestate/sourceOfIncome';
import { RealEstateSteeringPluginGrader } from '../../../src/redteam/plugins/realestate/steering';
import { RealEstateValuationBiasPluginGrader } from '../../../src/redteam/plugins/realestate/valuationBias';
import { ReasoningDosGrader } from '../../../src/redteam/plugins/reasoningDos';

type RubricVars = {
  purpose: string;
  prompt: string;
  output: string;
};

type RenderingGrader = {
  id: string;
  renderRubric: (vars: RubricVars) => string;
};

const RENDERING_GRADERS: [string, string, new () => RenderingGrader][] = [
  ['bias', 'promptfoo:redteam:bias', BiasGrader],
  ['coppa', 'promptfoo:redteam:coppa', CoppaGrader],
  ['ferpa', 'promptfoo:redteam:ferpa', FerpaGrader],
  [
    'ecommerce compliance bypass',
    'promptfoo:redteam:ecommerce:compliance-bypass',
    EcommerceComplianceBypassGrader,
  ],
  ['ecommerce order fraud', 'promptfoo:redteam:ecommerce:order-fraud', EcommerceOrderFraudGrader],
  ['ecommerce pci dss', 'promptfoo:redteam:ecommerce:pci-dss', EcommercePciDssGrader],
  [
    'ecommerce price manipulation',
    'promptfoo:redteam:ecommerce:price-manipulation',
    EcommercePriceManipulationGrader,
  ],
  [
    'financial calculation error',
    'promptfoo:redteam:financial:calculation-error',
    FinancialCalculationErrorPluginGrader,
  ],
  [
    'financial compliance violation',
    'promptfoo:redteam:financial:compliance-violation',
    FinancialComplianceViolationPluginGrader,
  ],
  [
    'financial confidential disclosure',
    'promptfoo:redteam:financial:confidential-disclosure',
    FinancialConfidentialDisclosurePluginGrader,
  ],
  [
    'financial counterfactual',
    'promptfoo:redteam:financial:counterfactual',
    FinancialCounterfactualPluginGrader,
  ],
  [
    'financial data leakage',
    'promptfoo:redteam:financial:data-leakage',
    FinancialDataLeakagePluginGrader,
  ],
  [
    'financial defamation',
    'promptfoo:redteam:financial:defamation',
    FinancialDefamationPluginGrader,
  ],
  [
    'financial hallucination',
    'promptfoo:redteam:financial:hallucination',
    FinancialHallucinationPluginGrader,
  ],
  [
    'financial impartiality',
    'promptfoo:redteam:financial:impartiality',
    FinancialImpartialityPluginGrader,
  ],
  [
    'financial japan fiea suitability',
    'promptfoo:redteam:financial:japan-fiea-suitability',
    FinancialJapanFieaSuitabilityPluginGrader,
  ],
  [
    'financial misconduct',
    'promptfoo:redteam:financial:misconduct',
    FinancialMisconductPluginGrader,
  ],
  [
    'financial sox compliance',
    'promptfoo:redteam:financial:sox-compliance',
    FinancialSoxCompliancePluginGrader,
  ],
  [
    'financial sycophancy',
    'promptfoo:redteam:financial:sycophancy',
    FinancialSycophancyPluginGrader,
  ],
  [
    'insurance coverage discrimination',
    'promptfoo:redteam:insurance:coverage-discrimination',
    InsuranceCoverageDiscriminationPluginGrader,
  ],
  [
    'insurance data disclosure',
    'promptfoo:redteam:insurance:data-disclosure',
    InsuranceDataDisclosurePluginGrader,
  ],
  [
    'insurance network misinformation',
    'promptfoo:redteam:insurance:network-misinformation',
    InsuranceNetworkMisinformationPluginGrader,
  ],
  [
    'insurance phi disclosure',
    'promptfoo:redteam:insurance:phi-disclosure',
    InsurancePhiDisclosurePluginGrader,
  ],
  [
    'medical anchoring bias',
    'promptfoo:redteam:medical:anchoring-bias',
    MedicalAnchoringBiasPluginGrader,
  ],
  [
    'medical fda ai disclosure',
    'promptfoo:redteam:medical:fda:ai-disclosure',
    MedicalFdaAiDisclosurePluginGrader,
  ],
  [
    'medical fda cyber access control',
    'promptfoo:redteam:medical:fda:cyber-access-control',
    MedicalFdaCyberAccessControlPluginGrader,
  ],
  [
    'medical fda cyber audit tampering',
    'promptfoo:redteam:medical:fda:cyber-audit-tampering',
    MedicalFdaCyberAuditTamperingPluginGrader,
  ],
  [
    'medical hallucination',
    'promptfoo:redteam:medical:hallucination',
    MedicalHallucinationPluginGrader,
  ],
  [
    'medical incorrect knowledge',
    'promptfoo:redteam:medical:incorrect-knowledge',
    MedicalIncorrectKnowledgePluginGrader,
  ],
  [
    'medical prioritization error',
    'promptfoo:redteam:medical:prioritization-error',
    MedicalPrioritizationErrorPluginGrader,
  ],
  [
    'medical off label use',
    'promptfoo:redteam:medical:off-label-use',
    MedicalOffLabelUsePluginGrader,
  ],
  ['medical sycophancy', 'promptfoo:redteam:medical:sycophancy', MedicalSycophancyPluginGrader],
  ['off topic', 'promptfoo:redteam:off-topic', OffTopicPluginGrader],
  ['reasoning dos', 'promptfoo:redteam:reasoning-dos', ReasoningDosGrader],
  [
    'pharmacy controlled substance compliance',
    'promptfoo:redteam:pharmacy:controlled-substance-compliance',
    PharmacyControlledSubstanceCompliancePluginGrader,
  ],
  [
    'pharmacy dosage calculation',
    'promptfoo:redteam:pharmacy:dosage-calculation',
    PharmacyDosageCalculationPluginGrader,
  ],
  [
    'pharmacy drug interaction',
    'promptfoo:redteam:pharmacy:drug-interaction',
    PharmacyDrugInteractionPluginGrader,
  ],
  [
    'real estate accessibility discrimination',
    'promptfoo:redteam:realestate:accessibility-discrimination',
    RealEstateAccessibilityDiscriminationPluginGrader,
  ],
  [
    'real estate advertising discrimination',
    'promptfoo:redteam:realestate:advertising-discrimination',
    RealEstateAdvertisingDiscriminationPluginGrader,
  ],
  [
    'real estate discriminatory listings',
    'promptfoo:redteam:realestate:discriminatory-listings',
    RealEstateDiscriminatoryListingsPluginGrader,
  ],
  [
    'real estate fair housing discrimination',
    'promptfoo:redteam:realestate:fair-housing-discrimination',
    RealEstateFairHousingDiscriminationPluginGrader,
  ],
  [
    'real estate lending discrimination',
    'promptfoo:redteam:realestate:lending-discrimination',
    RealEstateLendingDiscriminationPluginGrader,
  ],
  [
    'real estate source of income',
    'promptfoo:redteam:realestate:source-of-income',
    RealEstateSourceOfIncomePluginGrader,
  ],
  ['real estate steering', 'promptfoo:redteam:realestate:steering', RealEstateSteeringPluginGrader],
  [
    'real estate valuation bias',
    'promptfoo:redteam:realestate:valuation-bias',
    RealEstateValuationBiasPluginGrader,
  ],
];

const COMPACT_DOMAIN_GRADERS: [string, new () => RenderingGrader][] = [
  ['bias', BiasGrader],
  ['coppa', CoppaGrader],
  ['ferpa', FerpaGrader],
  ['reasoning dos', ReasoningDosGrader],
  ['ecommerce compliance bypass', EcommerceComplianceBypassGrader],
  ['ecommerce order fraud', EcommerceOrderFraudGrader],
  ['ecommerce pci dss', EcommercePciDssGrader],
  ['ecommerce price manipulation', EcommercePriceManipulationGrader],
  ['financial calculation error', FinancialCalculationErrorPluginGrader],
  ['financial compliance violation', FinancialComplianceViolationPluginGrader],
  ['financial confidential disclosure', FinancialConfidentialDisclosurePluginGrader],
  ['financial counterfactual', FinancialCounterfactualPluginGrader],
  ['financial data leakage', FinancialDataLeakagePluginGrader],
  ['financial defamation', FinancialDefamationPluginGrader],
  ['financial hallucination', FinancialHallucinationPluginGrader],
  ['financial impartiality', FinancialImpartialityPluginGrader],
  ['financial japan fiea suitability', FinancialJapanFieaSuitabilityPluginGrader],
  ['financial misconduct', FinancialMisconductPluginGrader],
  ['financial sox compliance', FinancialSoxCompliancePluginGrader],
  ['financial sycophancy', FinancialSycophancyPluginGrader],
  ['insurance coverage discrimination', InsuranceCoverageDiscriminationPluginGrader],
  ['insurance data disclosure', InsuranceDataDisclosurePluginGrader],
  ['insurance network misinformation', InsuranceNetworkMisinformationPluginGrader],
  ['insurance phi disclosure', InsurancePhiDisclosurePluginGrader],
  ['medical anchoring bias', MedicalAnchoringBiasPluginGrader],
  ['medical fda ai disclosure', MedicalFdaAiDisclosurePluginGrader],
  ['medical fda cyber access control', MedicalFdaCyberAccessControlPluginGrader],
  ['medical fda cyber audit tampering', MedicalFdaCyberAuditTamperingPluginGrader],
  ['medical hallucination', MedicalHallucinationPluginGrader],
  ['medical incorrect knowledge', MedicalIncorrectKnowledgePluginGrader],
  ['medical off label use', MedicalOffLabelUsePluginGrader],
  ['medical prioritization error', MedicalPrioritizationErrorPluginGrader],
  ['medical sycophancy', MedicalSycophancyPluginGrader],
  ['pharmacy controlled substance compliance', PharmacyControlledSubstanceCompliancePluginGrader],
  ['pharmacy dosage calculation', PharmacyDosageCalculationPluginGrader],
  ['pharmacy drug interaction', PharmacyDrugInteractionPluginGrader],
];

describe('domain-specific grader rendering', () => {
  const vars = {
    purpose: 'Sentinel purpose for rubric interpolation',
    prompt: 'Sentinel attack prompt for rubric interpolation',
    output: 'Sentinel model output for rubric interpolation',
  };

  it.each(
    RENDERING_GRADERS,
  )('%s is registered under its canonical grader id', (_, expectedId, GraderClass) => {
    const grader = new GraderClass();

    expect(grader.id).toBe(expectedId);
    expect(getGraderById(expectedId)).toBeInstanceOf(GraderClass);
  });

  it.each(
    RENDERING_GRADERS,
  )('%s renders runtime context and decision fields', (_, __, GraderClass) => {
    const rubric = new GraderClass().renderRubric(vars);

    expect(rubric).toContain(vars.purpose);
    expect(rubric).toContain(vars.prompt);
    expect(rubric).toContain(vars.output);
    expect(rubric).toContain('# Goal');
    expect(rubric).toContain('# Instructions');
    expect(rubric).toContain('# Output Format');
    expect(rubric).toContain('"reason":');
    expect(rubric).toContain('"score":');
    expect(rubric).toContain('"pass":');
  });

  it.each(
    COMPACT_DOMAIN_GRADERS,
  )('%s uses a compact structured decision rubric', (_, GraderClass) => {
    const rubric = new GraderClass().renderRubric(vars);

    expect(rubric).toContain('<purpose>');
    expect(rubric).toContain('<UserQuery>');
    expect(rubric).toContain('<Output>');
    expect(rubric).toContain('FAIL (score = 0):');
    expect(rubric).toContain('PASS (score = 1):');
    expect(rubric.length).toBeLessThan(3500);
  });

  it('does not treat disclosure pretexts as verified authorization', () => {
    const coppaRubric = new CoppaGrader().renderRubric(vars);
    const dataRubric = new InsuranceDataDisclosurePluginGrader().renderRubric(vars);
    const phiRubric = new InsurancePhiDisclosurePluginGrader().renderRubric(vars);

    expect(coppaRubric).toContain('not verified parental consent');
    expect(dataRubric).toContain('not verified authorization');
    expect(phiRubric).toContain('not proof of authorization');
  });
});
