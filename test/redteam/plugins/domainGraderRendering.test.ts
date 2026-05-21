import { describe, expect, it } from 'vitest';
import { getGraderById } from '../../../src/redteam/graders';
import { EnergyControlledResearchBoundaryPluginGrader } from '../../../src/redteam/plugins/energy/controlledResearchBoundary';
import { EnergyGreenClaimsProgramsPluginGrader } from '../../../src/redteam/plugins/energy/greenClaimsPrograms';
import { EnergyHazardOutageMisinformationPluginGrader } from '../../../src/redteam/plugins/energy/hazardOutageMisinformation';
import { EnergyMarketSensitiveDisclosurePluginGrader } from '../../../src/redteam/plugins/energy/marketSensitiveDisclosure';
import { EnergyNuclearSafetyBoundaryPluginGrader } from '../../../src/redteam/plugins/energy/nuclearSafetyBoundary';
import { EnergyOperationsWorkflowIntegrityPluginGrader } from '../../../src/redteam/plugins/energy/operationsWorkflowIntegrity';
import { EnergyProtectedCustomerProcessPluginGrader } from '../../../src/redteam/plugins/energy/protectedCustomerProcess';
import { EnergyPucFixedRateBenchmarkCapPluginGrader } from '../../../src/redteam/plugins/energy/pucFixedRateBenchmarkCap';
import { EnergyPucMedicalBaselineIntegrityPluginGrader } from '../../../src/redteam/plugins/energy/pucMedicalBaselineIntegrity';
import { EnergyPucOfferEligibilityGatePluginGrader } from '../../../src/redteam/plugins/energy/pucOfferEligibilityGate';
import { EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader } from '../../../src/redteam/plugins/energy/pucPaymentPlanServiceRestorationIntegrity';
import { EnergyPucProductScopeIntegrityPluginGrader } from '../../../src/redteam/plugins/energy/pucProductScopeIntegrity';
import { EnergyPucVariableRateSavingsProtectionPluginGrader } from '../../../src/redteam/plugins/energy/pucVariableRateSavingsProtection';
import { EnergyRatesProgramsGroundingPluginGrader } from '../../../src/redteam/plugins/energy/ratesProgramsGrounding';
import { EnergySensitiveInfrastructureDisclosurePluginGrader } from '../../../src/redteam/plugins/energy/sensitiveInfrastructureDisclosure';
import { EnergyUsageLoadPrivacyPluginGrader } from '../../../src/redteam/plugins/energy/usageLoadPrivacy';
import { FinancialCalculationErrorPluginGrader } from '../../../src/redteam/plugins/financial/financialCalculationError';
import { FinancialComplianceViolationPluginGrader } from '../../../src/redteam/plugins/financial/financialComplianceViolation';
import { FinancialDataLeakagePluginGrader } from '../../../src/redteam/plugins/financial/financialDataLeakage';
import { FinancialHallucinationPluginGrader } from '../../../src/redteam/plugins/financial/financialHallucination';
import { FinancialJapanFieaSuitabilityPluginGrader } from '../../../src/redteam/plugins/financial/financialJapanFieaSuitability';
import { FinancialSycophancyPluginGrader } from '../../../src/redteam/plugins/financial/financialSycophancy';
import { InsuranceCoverageDiscriminationPluginGrader } from '../../../src/redteam/plugins/insurance/coverageDiscrimination';
import { InsuranceDataDisclosurePluginGrader } from '../../../src/redteam/plugins/insurance/dataDisclosure';
import { InsuranceNetworkMisinformationPluginGrader } from '../../../src/redteam/plugins/insurance/networkMisinformation';
import { InsurancePhiDisclosurePluginGrader } from '../../../src/redteam/plugins/insurance/phiDisclosure';
import { MedicalAnchoringBiasPluginGrader } from '../../../src/redteam/plugins/medical/medicalAnchoringBias';
import { MedicalHallucinationPluginGrader } from '../../../src/redteam/plugins/medical/medicalHallucination';
import { MedicalIncorrectKnowledgePluginGrader } from '../../../src/redteam/plugins/medical/medicalIncorrectKnowledge';
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
  [
    'energy controlled research boundary',
    'promptfoo:redteam:energy:controlled-research-boundary',
    EnergyControlledResearchBoundaryPluginGrader,
  ],
  [
    'energy green claims programs',
    'promptfoo:redteam:energy:green-claims-programs',
    EnergyGreenClaimsProgramsPluginGrader,
  ],
  [
    'energy hazard outage misinformation',
    'promptfoo:redteam:energy:hazard-outage-misinformation',
    EnergyHazardOutageMisinformationPluginGrader,
  ],
  [
    'energy market sensitive disclosure',
    'promptfoo:redteam:energy:market-sensitive-disclosure',
    EnergyMarketSensitiveDisclosurePluginGrader,
  ],
  [
    'energy nuclear safety boundary',
    'promptfoo:redteam:energy:nuclear-safety-boundary',
    EnergyNuclearSafetyBoundaryPluginGrader,
  ],
  [
    'energy operations workflow integrity',
    'promptfoo:redteam:energy:operations-workflow-integrity',
    EnergyOperationsWorkflowIntegrityPluginGrader,
  ],
  [
    'energy puc fixed rate benchmark cap',
    'promptfoo:redteam:energy:puc-fixed-rate-benchmark-cap',
    EnergyPucFixedRateBenchmarkCapPluginGrader,
  ],
  [
    'energy puc medical baseline integrity',
    'promptfoo:redteam:energy:puc-medical-baseline-integrity',
    EnergyPucMedicalBaselineIntegrityPluginGrader,
  ],
  [
    'energy puc offer eligibility gate',
    'promptfoo:redteam:energy:puc-offer-eligibility-gate',
    EnergyPucOfferEligibilityGatePluginGrader,
  ],
  [
    'energy puc payment plan service restoration integrity',
    'promptfoo:redteam:energy:puc-payment-plan-service-restoration-integrity',
    EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader,
  ],
  [
    'energy puc product scope integrity',
    'promptfoo:redteam:energy:puc-product-scope-integrity',
    EnergyPucProductScopeIntegrityPluginGrader,
  ],
  [
    'energy puc variable rate savings protection',
    'promptfoo:redteam:energy:puc-variable-rate-savings-protection',
    EnergyPucVariableRateSavingsProtectionPluginGrader,
  ],
  [
    'energy protected customer process',
    'promptfoo:redteam:energy:protected-customer-process',
    EnergyProtectedCustomerProcessPluginGrader,
  ],
  [
    'energy rates programs grounding',
    'promptfoo:redteam:energy:rates-programs-grounding',
    EnergyRatesProgramsGroundingPluginGrader,
  ],
  [
    'energy sensitive infrastructure disclosure',
    'promptfoo:redteam:energy:sensitive-infrastructure-disclosure',
    EnergySensitiveInfrastructureDisclosurePluginGrader,
  ],
  [
    'energy usage load privacy',
    'promptfoo:redteam:energy:usage-load-privacy',
    EnergyUsageLoadPrivacyPluginGrader,
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
    'financial data leakage',
    'promptfoo:redteam:financial:data-leakage',
    FinancialDataLeakagePluginGrader,
  ],
  [
    'financial hallucination',
    'promptfoo:redteam:financial:hallucination',
    FinancialHallucinationPluginGrader,
  ],
  [
    'financial japan fiea suitability',
    'promptfoo:redteam:financial:japan-fiea-suitability',
    FinancialJapanFieaSuitabilityPluginGrader,
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
  ['medical sycophancy', 'promptfoo:redteam:medical:sycophancy', MedicalSycophancyPluginGrader],
  ['off topic', 'promptfoo:redteam:off-topic', OffTopicPluginGrader],
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

  it.each([
    EnergyPucFixedRateBenchmarkCapPluginGrader,
    EnergyPucMedicalBaselineIntegrityPluginGrader,
    EnergyPucOfferEligibilityGatePluginGrader,
    EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader,
    EnergyPucProductScopeIntegrityPluginGrader,
    EnergyPucVariableRateSavingsProtectionPluginGrader,
  ])('renders market-specific Utilities PUC rule context for %s', (GraderClass) => {
    const rubric = new GraderClass().renderRubric({
      ...vars,
      pluginId: 'energy:puc-offer-eligibility-gate',
      profileId: 'ny-dps-profile',
      profileVersion: '2026-05-18.v1',
      market: 'ny-dps',
      isoFootprint: 'nyiso',
      marketActorType: 'esco',
      ruleVariant: 'provider-approval-gate',
      gradingRuleText: 'Resolved grading rule text',
      controllingRuleText: 'Resolved controlling rule text',
    });

    expect(rubric).toContain('ny-dps');
    expect(rubric).toContain('nyiso');
    expect(rubric).toContain('esco');
    expect(rubric).toContain('provider-approval-gate');
    expect(rubric).toContain('Resolved grading rule text');
    expect(rubric).toContain('Resolved controlling rule text');
  });

  it('renders Pennsylvania Utilities PUC rule context with supplier framing', () => {
    const rubric = new EnergyPucProductScopeIntegrityPluginGrader().renderRubric({
      ...vars,
      pluginId: 'energy:puc-product-scope-integrity',
      profileId: 'pa-puc-product-scope-unlimited-rate-distinction',
      profileVersion: '2026-05-19.v1',
      market: 'pa-puc',
      isoFootprint: 'pjm',
      marketActorType: 'supplier',
      ruleVariant: 'unlimited-rate-product-distinction',
      gradingRuleText: 'Pennsylvania grading rule text',
      controllingRuleText: 'Pennsylvania controlling rule text',
    });

    expect(rubric).toContain('pa-puc');
    expect(rubric).toContain('pjm');
    expect(rubric).toContain('supplier');
    expect(rubric).toContain('unlimited-rate-product-distinction');
    expect(rubric).toContain('Pennsylvania grading rule text');
    expect(rubric).toContain('Pennsylvania controlling rule text');
  });

  it('renders California Utilities PUC rule context with utility framing', () => {
    const rubric = new EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader().renderRubric({
      ...vars,
      pluginId: 'energy:puc-payment-plan-service-restoration-integrity',
      profileId: 'ca-cpuc-service-restoration-condition-integrity',
      profileVersion: '2026-05-19.v1',
      market: 'ca-cpuc',
      isoFootprint: 'caiso',
      marketActorType: 'utility',
      ruleVariant: 'service-restoration-condition-integrity',
      gradingRuleText: 'California grading rule text',
      controllingRuleText: 'California controlling rule text',
    });

    expect(rubric).toContain('ca-cpuc');
    expect(rubric).toContain('caiso');
    expect(rubric).toContain('utility');
    expect(rubric).toContain('service-restoration-condition-integrity');
    expect(rubric).toContain('California grading rule text');
    expect(rubric).toContain('California controlling rule text');
  });

  it('renders Texas Utilities PUC rule context with REP framing', () => {
    const rubric = new EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader().renderRubric({
      ...vars,
      pluginId: 'energy:puc-payment-plan-service-restoration-integrity',
      profileId: 'tx-puct-underbilling-deferred-payment-plan-integrity',
      profileVersion: '2026-05-19.v1',
      market: 'tx-puct',
      isoFootprint: 'ercot',
      marketActorType: 'rep',
      ruleVariant: 'underbilling-deferred-payment-plan-integrity',
      gradingRuleText: 'Texas grading rule text',
      controllingRuleText: 'Texas controlling rule text',
    });

    expect(rubric).toContain('tx-puct');
    expect(rubric).toContain('ercot');
    expect(rubric).toContain('rep');
    expect(rubric).toContain('underbilling-deferred-payment-plan-integrity');
    expect(rubric).toContain('Texas grading rule text');
    expect(rubric).toContain('Texas controlling rule text');
    expect(rubric).toContain(
      'selected market-specific payment-plan, payment-assistance, service-continuity, or restoration condition',
    );
  });

  it('renders Illinois Utilities PUC rule context with utility framing', () => {
    const rubric = new EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader().renderRubric({
      ...vars,
      pluginId: 'energy:puc-payment-plan-service-restoration-integrity',
      profileId: 'il-icc-extreme-heat-disconnection-hold',
      profileVersion: '2026-05-19.v1',
      market: 'il-icc',
      isoFootprint: 'pjm',
      marketActorType: 'utility',
      ruleVariant: 'extreme-heat-disconnection-hold',
      gradingRuleText: 'Illinois grading rule text',
      controllingRuleText: 'Illinois controlling rule text',
    });

    expect(rubric).toContain('il-icc');
    expect(rubric).toContain('pjm');
    expect(rubric).toContain('utility');
    expect(rubric).toContain('extreme-heat-disconnection-hold');
    expect(rubric).toContain('Illinois grading rule text');
    expect(rubric).toContain('Illinois controlling rule text');
  });

  it('renders Indiana Utilities PUC rule context with utility framing', () => {
    const rubric = new EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader().renderRubric({
      ...vars,
      pluginId: 'energy:puc-payment-plan-service-restoration-integrity',
      profileId: 'in-iurc-payment-arrangement-eligibility-integrity',
      profileVersion: '2026-05-19.v1',
      market: 'in-iurc',
      isoFootprint: 'pjm',
      marketActorType: 'utility',
      ruleVariant: 'payment-arrangement-eligibility-integrity',
      gradingRuleText: 'Indiana grading rule text',
      controllingRuleText: 'Indiana controlling rule text',
    });

    expect(rubric).toContain('in-iurc');
    expect(rubric).toContain('pjm');
    expect(rubric).toContain('utility');
    expect(rubric).toContain('payment-arrangement-eligibility-integrity');
    expect(rubric).toContain('Indiana grading rule text');
    expect(rubric).toContain('Indiana controlling rule text');
  });

  it('renders Kentucky Utilities PUC rule context with utility framing', () => {
    const rubric = new EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader().renderRubric({
      ...vars,
      pluginId: 'energy:puc-payment-plan-service-restoration-integrity',
      profileId: 'ky-psc-winter-hardship-reconnection-integrity',
      profileVersion: '2026-05-19.v1',
      market: 'ky-psc',
      isoFootprint: 'pjm',
      marketActorType: 'utility',
      ruleVariant: 'winter-hardship-reconnection-integrity',
      gradingRuleText: 'Kentucky grading rule text',
      controllingRuleText: 'Kentucky controlling rule text',
    });

    expect(rubric).toContain('ky-psc');
    expect(rubric).toContain('pjm');
    expect(rubric).toContain('utility');
    expect(rubric).toContain('winter-hardship-reconnection-integrity');
    expect(rubric).toContain('Kentucky grading rule text');
    expect(rubric).toContain('Kentucky controlling rule text');
  });

  it('renders Michigan Utilities PUC rule context with utility framing', () => {
    const rubric = new EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader().renderRubric({
      ...vars,
      pluginId: 'energy:puc-payment-plan-service-restoration-integrity',
      profileId: 'mi-mpsc-critical-care-protection-certification-integrity',
      profileVersion: '2026-05-19.v1',
      market: 'mi-mpsc',
      isoFootprint: 'miso',
      marketActorType: 'utility',
      ruleVariant: 'critical-care-protection-certification-integrity',
      gradingRuleText: 'Michigan grading rule text',
      controllingRuleText: 'Michigan controlling rule text',
    });

    expect(rubric).toContain('mi-mpsc');
    expect(rubric).toContain('miso');
    expect(rubric).toContain('utility');
    expect(rubric).toContain('critical-care-protection-certification-integrity');
    expect(rubric).toContain('Michigan grading rule text');
    expect(rubric).toContain('Michigan controlling rule text');
  });

  it('renders North Carolina Utilities PUC rule context with utility framing', () => {
    const rubric = new EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader().renderRubric({
      ...vars,
      pluginId: 'energy:puc-payment-plan-service-restoration-integrity',
      profileId: 'nc-uc-winter-vulnerable-household-commission-approval-gate',
      profileVersion: '2026-05-19.v1',
      market: 'nc-uc',
      isoFootprint: 'pjm',
      marketActorType: 'utility',
      ruleVariant: 'winter-vulnerable-household-commission-approval-gate',
      gradingRuleText: 'North Carolina grading rule text',
      controllingRuleText: 'North Carolina controlling rule text',
    });

    expect(rubric).toContain('nc-uc');
    expect(rubric).toContain('pjm');
    expect(rubric).toContain('utility');
    expect(rubric).toContain('winter-vulnerable-household-commission-approval-gate');
    expect(rubric).toContain('North Carolina grading rule text');
    expect(rubric).toContain('North Carolina controlling rule text');
  });

  it('renders Tennessee Utilities PUC rule context with utility framing', () => {
    const rubric = new EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader().renderRubric({
      ...vars,
      pluginId: 'energy:puc-payment-plan-service-restoration-integrity',
      profileId: 'tn-tpuc-medical-emergency-thirty-day-postponement',
      profileVersion: '2026-05-19.v1',
      market: 'tn-tpuc',
      isoFootprint: 'pjm',
      marketActorType: 'utility',
      ruleVariant: 'medical-emergency-thirty-day-postponement',
      gradingRuleText: 'Tennessee grading rule text',
      controllingRuleText: 'Tennessee controlling rule text',
    });

    expect(rubric).toContain('tn-tpuc');
    expect(rubric).toContain('pjm');
    expect(rubric).toContain('utility');
    expect(rubric).toContain('medical-emergency-thirty-day-postponement');
    expect(rubric).toContain('Tennessee grading rule text');
    expect(rubric).toContain('Tennessee controlling rule text');
  });

  it('renders Connecticut Utilities PUC rule context with utility framing', () => {
    const rubric = new EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader().renderRubric({
      ...vars,
      pluginId: 'energy:puc-payment-plan-service-restoration-integrity',
      profileId: 'ct-pura-serious-illness-certified-amortization-hold',
      profileVersion: '2026-05-19.v1',
      market: 'ct-pura',
      isoFootprint: 'iso-ne',
      marketActorType: 'utility',
      ruleVariant: 'serious-illness-certified-amortization-hold',
      gradingRuleText: 'Connecticut grading rule text',
      controllingRuleText: 'Connecticut controlling rule text',
    });

    expect(rubric).toContain('ct-pura');
    expect(rubric).toContain('iso-ne');
    expect(rubric).toContain('utility');
    expect(rubric).toContain('serious-illness-certified-amortization-hold');
    expect(rubric).toContain('Connecticut grading rule text');
    expect(rubric).toContain('Connecticut controlling rule text');
  });

  it('renders Massachusetts Utilities PUC rule context with utility framing', () => {
    const rubric = new EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader().renderRubric({
      ...vars,
      pluginId: 'energy:puc-payment-plan-service-restoration-integrity',
      profileId: 'ma-dpu-infant-household-financial-hardship-shutoff-ban',
      profileVersion: '2026-05-19.v1',
      market: 'ma-dpu',
      isoFootprint: 'iso-ne',
      marketActorType: 'utility',
      ruleVariant: 'infant-household-financial-hardship-shutoff-ban',
      gradingRuleText: 'Massachusetts grading rule text',
      controllingRuleText: 'Massachusetts controlling rule text',
    });

    expect(rubric).toContain('ma-dpu');
    expect(rubric).toContain('iso-ne');
    expect(rubric).toContain('utility');
    expect(rubric).toContain('infant-household-financial-hardship-shutoff-ban');
    expect(rubric).toContain('Massachusetts grading rule text');
    expect(rubric).toContain('Massachusetts controlling rule text');
  });

  it('renders Rhode Island Utilities PUC rule context with utility framing', () => {
    const rubric = new EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader().renderRubric({
      ...vars,
      pluginId: 'energy:puc-payment-plan-service-restoration-integrity',
      profileId: 'ri-dpuc-weekend-holiday-discontinuance-boundary',
      profileVersion: '2026-05-19.v1',
      market: 'ri-dpuc',
      isoFootprint: 'iso-ne',
      marketActorType: 'utility',
      ruleVariant: 'weekend-holiday-discontinuance-boundary',
      gradingRuleText: 'Rhode Island grading rule text',
      controllingRuleText: 'Rhode Island controlling rule text',
    });

    expect(rubric).toContain('ri-dpuc');
    expect(rubric).toContain('iso-ne');
    expect(rubric).toContain('utility');
    expect(rubric).toContain('weekend-holiday-discontinuance-boundary');
    expect(rubric).toContain('Rhode Island grading rule text');
    expect(rubric).toContain('Rhode Island controlling rule text');
  });

  it('renders New Hampshire Utilities PUC rule context with utility framing', () => {
    const rubric = new EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader().renderRubric({
      ...vars,
      pluginId: 'energy:puc-payment-plan-service-restoration-integrity',
      profileId: 'nh-doe-medical-emergency-certification-service-hold',
      profileVersion: '2026-05-19.v1',
      market: 'nh-doe',
      isoFootprint: 'iso-ne',
      marketActorType: 'utility',
      ruleVariant: 'medical-emergency-certification-service-hold',
      gradingRuleText: 'New Hampshire grading rule text',
      controllingRuleText: 'New Hampshire controlling rule text',
    });

    expect(rubric).toContain('nh-doe');
    expect(rubric).toContain('iso-ne');
    expect(rubric).toContain('utility');
    expect(rubric).toContain('medical-emergency-certification-service-hold');
    expect(rubric).toContain('New Hampshire grading rule text');
    expect(rubric).toContain('New Hampshire controlling rule text');
  });

  it('renders Maine Utilities PUC rule context with utility framing', () => {
    const rubric = new EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader().renderRubric({
      ...vars,
      pluginId: 'energy:puc-payment-plan-service-restoration-integrity',
      profileId: 'me-puc-winter-casd-disconnection-authorization-gate',
      profileVersion: '2026-05-19.v1',
      market: 'me-puc',
      isoFootprint: 'iso-ne',
      marketActorType: 'utility',
      ruleVariant: 'winter-casd-disconnection-authorization-gate',
      gradingRuleText: 'Maine grading rule text',
      controllingRuleText: 'Maine controlling rule text',
    });

    expect(rubric).toContain('me-puc');
    expect(rubric).toContain('iso-ne');
    expect(rubric).toContain('utility');
    expect(rubric).toContain('winter-casd-disconnection-authorization-gate');
    expect(rubric).toContain('Maine grading rule text');
    expect(rubric).toContain('Maine controlling rule text');
  });

  it('renders Vermont Utilities PUC rule context with utility framing', () => {
    const rubric = new EnergyPucPaymentPlanServiceRestorationIntegrityPluginGrader().renderRubric({
      ...vars,
      pluginId: 'energy:puc-payment-plan-service-restoration-integrity',
      profileId: 'vt-puc-repayment-plan-substantial-compliance-integrity',
      profileVersion: '2026-05-19.v1',
      market: 'vt-puc',
      isoFootprint: 'iso-ne',
      marketActorType: 'utility',
      ruleVariant: 'repayment-plan-substantial-compliance-integrity',
      gradingRuleText: 'Vermont grading rule text',
      controllingRuleText: 'Vermont controlling rule text',
    });

    expect(rubric).toContain('vt-puc');
    expect(rubric).toContain('iso-ne');
    expect(rubric).toContain('utility');
    expect(rubric).toContain('repayment-plan-substantial-compliance-integrity');
    expect(rubric).toContain('Vermont grading rule text');
    expect(rubric).toContain('Vermont controlling rule text');
  });
});
