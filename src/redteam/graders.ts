import { AegisGrader } from './plugins/aegis';
import { REDTEAM_MEMORY_POISONING_PLUGIN_ID } from './plugins/agentic/constants';
import { MemoryPoisoningPluginGrader } from './plugins/agentic/memoryPoisoning';
import { AsciiSmugglingGrader } from './plugins/asciiSmuggling';
import { BeavertailsGrader } from './plugins/beavertails';
import { BflaGrader } from './plugins/bfla';
import { BiasGrader } from './plugins/bias';
import { BolaGrader } from './plugins/bola';
import { CompetitorsGrader } from './plugins/competitors';
import { CoppaGrader } from './plugins/compliance/coppa';
import { FerpaGrader } from './plugins/compliance/ferpa';
import { CcaGrader } from './plugins/contextComplianceAttack';
import { ContractsGrader } from './plugins/contracts';
import { CrossSessionLeakGrader } from './plugins/crossSessionLeak';
import { DataExfilGrader } from './plugins/dataExfil';
import { DebugAccessGrader } from './plugins/debugAccess';
import { DivergentRepetitionGrader } from './plugins/divergentRepetition';
import { EcommerceComplianceBypassGrader } from './plugins/ecommerce/ecommerceComplianceBypass';
import { EcommerceOrderFraudGrader } from './plugins/ecommerce/ecommerceOrderFraud';
import { EcommercePciDssGrader } from './plugins/ecommerce/ecommercePciDss';
import { EcommercePriceManipulationGrader } from './plugins/ecommerce/ecommercePriceManipulation';
import { ExcessiveAgencyGrader } from './plugins/excessiveAgency';
import { FinancialCalculationErrorPluginGrader } from './plugins/financial/financialCalculationError';
import { FinancialComplianceViolationPluginGrader } from './plugins/financial/financialComplianceViolation';
import { FinancialConfidentialDisclosurePluginGrader } from './plugins/financial/financialConfidentialDisclosure';
import { FinancialCounterfactualPluginGrader } from './plugins/financial/financialCounterfactual';
import { FinancialDataLeakagePluginGrader } from './plugins/financial/financialDataLeakage';
import { FinancialDefamationPluginGrader } from './plugins/financial/financialDefamation';
import { FinancialHallucinationPluginGrader } from './plugins/financial/financialHallucination';
import { FinancialImpartialityPluginGrader } from './plugins/financial/financialImpartiality';
import { FinancialMisconductPluginGrader } from './plugins/financial/financialMisconduct';
import { FinancialSycophancyPluginGrader } from './plugins/financial/financialSycophancy';
import { GoalMisalignmentGrader } from './plugins/goalMisalignment';
import { HallucinationGrader } from './plugins/hallucination';
import { HarmbenchGrader } from './plugins/harmbench';
import {
  ChildExploitationGrader,
  CopyrightViolationGrader,
  CybercrimeGrader,
  GraphicContentGrader,
  HarmfulGrader,
  HarmfulPrivacyGrader,
  HateGrader,
  IllegalActivitiesGrader,
  IllegalDrugsGrader,
  IndiscriminateWeaponsGrader,
  InsultsGrader,
  MisinformationDisinformationGrader,
  NonViolentCrimeGrader,
  ProfanityGrader,
  RadicalizationGrader,
  SelfHarmGrader,
  SexCrimeGrader,
  SexualContentGrader,
  SpecializedAdviceGrader,
  UnsafePracticesGrader,
  ViolentCrimeGrader,
} from './plugins/harmful/graders';
import { HijackingGrader } from './plugins/hijacking';
import { ImitationGrader } from './plugins/imitation';
import { IndirectPromptInjectionGrader } from './plugins/indirectPromptInjection';
import { InsuranceCoverageDiscriminationPluginGrader } from './plugins/insurance/coverageDiscrimination';
import { InsuranceNetworkMisinformationPluginGrader } from './plugins/insurance/networkMisinformation';
import { InsurancePhiDisclosurePluginGrader } from './plugins/insurance/phiDisclosure';
import { IntentGrader } from './plugins/intent';
import { MCPPluginGrader } from './plugins/mcp';
import { MedicalAnchoringBiasPluginGrader } from './plugins/medical/medicalAnchoringBias';
import { MedicalHallucinationPluginGrader } from './plugins/medical/medicalHallucination';
import { MedicalIncorrectKnowledgePluginGrader } from './plugins/medical/medicalIncorrectKnowledge';
import { MedicalOffLabelUsePluginGrader } from './plugins/medical/medicalOffLabelUse';
import { MedicalPrioritizationErrorPluginGrader } from './plugins/medical/medicalPrioritizationError';
import { MedicalSycophancyPluginGrader } from './plugins/medical/medicalSycophancy';
import { OffTopicPluginGrader } from './plugins/offTopic';
import { OverrelianceGrader } from './plugins/overreliance';
import { PharmacyControlledSubstanceCompliancePluginGrader } from './plugins/pharmacy/controlledSubstanceCompliance';
import { PharmacyDosageCalculationPluginGrader } from './plugins/pharmacy/dosageCalculation';
import { PharmacyDrugInteractionPluginGrader } from './plugins/pharmacy/drugInteraction';
import { PiiGrader } from './plugins/pii';
import { PlinyGrader } from './plugins/pliny';
import { PolicyViolationGrader } from './plugins/policy/index';
import { PoliticsGrader } from './plugins/politics';
import { PromptExtractionGrader } from './plugins/promptExtraction';
import { RagDocumentExfiltrationGrader } from './plugins/ragDocumentExfiltration';
import { RagSourceAttributionGrader } from './plugins/ragSourceAttribution';
import { RbacGrader } from './plugins/rbac';
import { ReasoningDosGrader } from './plugins/reasoningDos';
import { ReligionGrader } from './plugins/religion';
import { ResourceExhaustionGrader } from './plugins/resourceExhaustion';
import { ShellInjectionGrader } from './plugins/shellInjection';
import { SqlInjectionGrader } from './plugins/sqlInjection';
import { SsrfGrader } from './plugins/ssrf';
import { TelecomAccessibilityViolationPluginGrader } from './plugins/telecom/accessibilityViolation';
import { TelecomAccountTakeoverPluginGrader } from './plugins/telecom/accountTakeover';
import { TelecomBillingMisinformationPluginGrader } from './plugins/telecom/billingMisinformation';
import { TelecomCoverageMisinformationPluginGrader } from './plugins/telecom/coverageMisinformation';
import { TelecomCpniDisclosurePluginGrader } from './plugins/telecom/cpniDisclosure';
import { TelecomE911MisinformationPluginGrader } from './plugins/telecom/e911Misinformation';
import { TelecomFraudEnablementPluginGrader } from './plugins/telecom/fraudEnablement';
import { TelecomLawEnforcementRequestHandlingPluginGrader } from './plugins/telecom/lawEnforcementRequestHandling';
import { TelecomLocationDisclosurePluginGrader } from './plugins/telecom/locationDisclosure';
import { TelecomPortingMisinformationPluginGrader } from './plugins/telecom/portingMisinformation';
import { TelecomTcpaViolationPluginGrader } from './plugins/telecom/tcpaViolation';
import { TelecomUnauthorizedChangesPluginGrader } from './plugins/telecom/unauthorizedChanges';
import { ToolDiscoveryGrader } from './plugins/toolDiscovery';
import { ToxicChatGrader } from './plugins/toxicChat';
import { UnsafeBenchGrader } from './plugins/unsafebench';
import { UnverifiableClaimsGrader } from './plugins/unverifiableClaims';
import { VLGuardGrader } from './plugins/vlguard';
import { VLSUGrader } from './plugins/vlsu';
import { WordplayGrader } from './plugins/wordplay';

import type { RedteamGraderBase } from './plugins/base';
import type { RedteamAssertionTypes } from './types';

export const GRADERS: Record<RedteamAssertionTypes, RedteamGraderBase> = {
  [REDTEAM_MEMORY_POISONING_PLUGIN_ID]: new MemoryPoisoningPluginGrader(),
  'promptfoo:redteam:aegis': new AegisGrader(),
  'promptfoo:redteam:ascii-smuggling': new AsciiSmugglingGrader(),
  'promptfoo:redteam:beavertails': new BeavertailsGrader(),
  'promptfoo:redteam:bfla': new BflaGrader(),
  'promptfoo:redteam:bias': new BiasGrader(),
  'promptfoo:redteam:bias:age': new BiasGrader(),
  'promptfoo:redteam:bias:disability': new BiasGrader(),
  'promptfoo:redteam:bias:gender': new BiasGrader(),
  'promptfoo:redteam:bias:race': new BiasGrader(),
  'promptfoo:redteam:bola': new BolaGrader(),
  'promptfoo:redteam:cca': new CcaGrader(),
  'promptfoo:redteam:competitors': new CompetitorsGrader(),
  'promptfoo:redteam:contracts': new ContractsGrader(),
  'promptfoo:redteam:coppa': new CoppaGrader(),
  'promptfoo:redteam:cross-session-leak': new CrossSessionLeakGrader(),
  'promptfoo:redteam:data-exfil': new DataExfilGrader(),
  'promptfoo:redteam:debug-access': new DebugAccessGrader(),
  'promptfoo:redteam:divergent-repetition': new DivergentRepetitionGrader(),
  'promptfoo:redteam:ecommerce:compliance-bypass': new EcommerceComplianceBypassGrader(),
  'promptfoo:redteam:ecommerce:order-fraud': new EcommerceOrderFraudGrader(),
  'promptfoo:redteam:ecommerce:pci-dss': new EcommercePciDssGrader(),
  'promptfoo:redteam:ecommerce:price-manipulation': new EcommercePriceManipulationGrader(),
  'promptfoo:redteam:excessive-agency': new ExcessiveAgencyGrader(),
  'promptfoo:redteam:ferpa': new FerpaGrader(),
  'promptfoo:redteam:financial:calculation-error': new FinancialCalculationErrorPluginGrader(),
  'promptfoo:redteam:financial:compliance-violation':
    new FinancialComplianceViolationPluginGrader(),
  'promptfoo:redteam:financial:confidential-disclosure':
    new FinancialConfidentialDisclosurePluginGrader(),
  'promptfoo:redteam:financial:counterfactual': new FinancialCounterfactualPluginGrader(),
  'promptfoo:redteam:financial:data-leakage': new FinancialDataLeakagePluginGrader(),
  'promptfoo:redteam:financial:defamation': new FinancialDefamationPluginGrader(),
  'promptfoo:redteam:financial:hallucination': new FinancialHallucinationPluginGrader(),
  'promptfoo:redteam:financial:impartiality': new FinancialImpartialityPluginGrader(),
  'promptfoo:redteam:financial:misconduct': new FinancialMisconductPluginGrader(),
  'promptfoo:redteam:financial:sycophancy': new FinancialSycophancyPluginGrader(),
  'promptfoo:redteam:goal-misalignment': new GoalMisalignmentGrader(),
  'promptfoo:redteam:hallucination': new HallucinationGrader(),
  'promptfoo:redteam:harmbench': new HarmbenchGrader(),
  'promptfoo:redteam:harmful': new HarmfulGrader(),
  'promptfoo:redteam:harmful:chemical-biological-weapons': new HarmfulGrader(),
  'promptfoo:redteam:harmful:child-exploitation': new ChildExploitationGrader(),
  'promptfoo:redteam:harmful:copyright-violations': new CopyrightViolationGrader(),
  'promptfoo:redteam:harmful:cybercrime': new CybercrimeGrader(),
  'promptfoo:redteam:harmful:cybercrime:malicious-code': new CybercrimeGrader(),
  'promptfoo:redteam:harmful:graphic-content': new GraphicContentGrader(),
  'promptfoo:redteam:harmful:harassment-bullying': new HarmfulGrader(),
  'promptfoo:redteam:harmful:hate': new HateGrader(),
  'promptfoo:redteam:harmful:illegal-activities': new IllegalActivitiesGrader(),
  'promptfoo:redteam:harmful:illegal-drugs': new IllegalDrugsGrader(),
  'promptfoo:redteam:harmful:illegal-drugs:meth': new IllegalDrugsGrader(),
  'promptfoo:redteam:harmful:indiscriminate-weapons': new IndiscriminateWeaponsGrader(),
  'promptfoo:redteam:harmful:insults': new InsultsGrader(),
  'promptfoo:redteam:harmful:intellectual-property': new CopyrightViolationGrader(),
  'promptfoo:redteam:harmful:misinformation-disinformation':
    new MisinformationDisinformationGrader(),
  'promptfoo:redteam:harmful:non-violent-crime': new NonViolentCrimeGrader(),
  'promptfoo:redteam:harmful:privacy': new HarmfulPrivacyGrader(),
  'promptfoo:redteam:harmful:profanity': new ProfanityGrader(),
  'promptfoo:redteam:harmful:radicalization': new RadicalizationGrader(),
  'promptfoo:redteam:harmful:self-harm': new SelfHarmGrader(),
  'promptfoo:redteam:harmful:sex-crime': new SexCrimeGrader(),
  'promptfoo:redteam:harmful:sexual-content': new SexualContentGrader(),
  'promptfoo:redteam:harmful:specialized-advice': new SpecializedAdviceGrader(),
  'promptfoo:redteam:harmful:unsafe-practices': new UnsafePracticesGrader(),
  'promptfoo:redteam:harmful:violent-crime': new ViolentCrimeGrader(),
  'promptfoo:redteam:harmful:weapons:ied': new HarmfulGrader(),
  'promptfoo:redteam:hijacking': new HijackingGrader(),
  'promptfoo:redteam:imitation': new ImitationGrader(),
  'promptfoo:redteam:indirect-prompt-injection': new IndirectPromptInjectionGrader(),
  'promptfoo:redteam:insurance:coverage-discrimination':
    new InsuranceCoverageDiscriminationPluginGrader(),
  'promptfoo:redteam:insurance:network-misinformation':
    new InsuranceNetworkMisinformationPluginGrader(),
  'promptfoo:redteam:insurance:phi-disclosure': new InsurancePhiDisclosurePluginGrader(),
  'promptfoo:redteam:intent': new IntentGrader(),
  'promptfoo:redteam:mcp': new MCPPluginGrader(),
  'promptfoo:redteam:medical:anchoring-bias': new MedicalAnchoringBiasPluginGrader(),
  'promptfoo:redteam:medical:hallucination': new MedicalHallucinationPluginGrader(),
  'promptfoo:redteam:medical:incorrect-knowledge': new MedicalIncorrectKnowledgePluginGrader(),
  'promptfoo:redteam:medical:off-label-use': new MedicalOffLabelUsePluginGrader(),
  'promptfoo:redteam:medical:prioritization-error': new MedicalPrioritizationErrorPluginGrader(),
  'promptfoo:redteam:medical:sycophancy': new MedicalSycophancyPluginGrader(),
  'promptfoo:redteam:off-topic': new OffTopicPluginGrader(),
  'promptfoo:redteam:pharmacy:controlled-substance-compliance':
    new PharmacyControlledSubstanceCompliancePluginGrader(),
  'promptfoo:redteam:pharmacy:dosage-calculation': new PharmacyDosageCalculationPluginGrader(),
  'promptfoo:redteam:pharmacy:drug-interaction': new PharmacyDrugInteractionPluginGrader(),
  'promptfoo:redteam:telecom:cpni-disclosure': new TelecomCpniDisclosurePluginGrader(),
  'promptfoo:redteam:telecom:location-disclosure': new TelecomLocationDisclosurePluginGrader(),
  'promptfoo:redteam:telecom:account-takeover': new TelecomAccountTakeoverPluginGrader(),
  'promptfoo:redteam:telecom:e911-misinformation': new TelecomE911MisinformationPluginGrader(),
  'promptfoo:redteam:telecom:tcpa-violation': new TelecomTcpaViolationPluginGrader(),
  'promptfoo:redteam:telecom:unauthorized-changes': new TelecomUnauthorizedChangesPluginGrader(),
  'promptfoo:redteam:telecom:fraud-enablement': new TelecomFraudEnablementPluginGrader(),
  'promptfoo:redteam:telecom:porting-misinformation':
    new TelecomPortingMisinformationPluginGrader(),
  'promptfoo:redteam:telecom:billing-misinformation':
    new TelecomBillingMisinformationPluginGrader(),
  'promptfoo:redteam:telecom:coverage-misinformation':
    new TelecomCoverageMisinformationPluginGrader(),
  'promptfoo:redteam:telecom:law-enforcement-request-handling':
    new TelecomLawEnforcementRequestHandlingPluginGrader(),
  'promptfoo:redteam:telecom:accessibility-violation':
    new TelecomAccessibilityViolationPluginGrader(),
  'promptfoo:redteam:overreliance': new OverrelianceGrader(),
  'promptfoo:redteam:pii': new PiiGrader(),
  'promptfoo:redteam:pii:api-db': new PiiGrader(),
  'promptfoo:redteam:pii:direct': new PiiGrader(),
  'promptfoo:redteam:pii:session': new PiiGrader(),
  'promptfoo:redteam:pii:social': new PiiGrader(),
  'promptfoo:redteam:pliny': new PlinyGrader(),
  'promptfoo:redteam:policy': new PolicyViolationGrader(),
  'promptfoo:redteam:politics': new PoliticsGrader(),
  'promptfoo:redteam:prompt-extraction': new PromptExtractionGrader(),
  'promptfoo:redteam:rag-document-exfiltration': new RagDocumentExfiltrationGrader(),
  'promptfoo:redteam:rag-source-attribution': new RagSourceAttributionGrader(),
  'promptfoo:redteam:rbac': new RbacGrader(),
  'promptfoo:redteam:reasoning-dos': new ReasoningDosGrader(),
  'promptfoo:redteam:religion': new ReligionGrader(),
  'promptfoo:redteam:resource-exhaustion': new ResourceExhaustionGrader(),
  'promptfoo:redteam:shell-injection': new ShellInjectionGrader(),
  'promptfoo:redteam:sql-injection': new SqlInjectionGrader(),
  'promptfoo:redteam:ssrf': new SsrfGrader(),
  'promptfoo:redteam:tool-discovery': new ToolDiscoveryGrader(),
  'promptfoo:redteam:toxic-chat': new ToxicChatGrader(),
  'promptfoo:redteam:unsafebench': new UnsafeBenchGrader(),
  'promptfoo:redteam:unverifiable-claims': new UnverifiableClaimsGrader(),
  'promptfoo:redteam:vlguard': new VLGuardGrader(),
  'promptfoo:redteam:vlsu': new VLSUGrader(),
  'promptfoo:redteam:wordplay': new WordplayGrader(),
};

export function getGraderById(id: string): RedteamGraderBase | undefined {
  // Handle null or undefined IDs
  if (!id) {
    return undefined;
  }

  // First try to get the exact grader
  const grader = id in GRADERS ? GRADERS[id as keyof typeof GRADERS] : undefined;

  // If not found but the ID starts with 'promptfoo:redteam:harmful', use the general harmful grader
  if (!grader && id.startsWith('promptfoo:redteam:harmful')) {
    return GRADERS['promptfoo:redteam:harmful'];
  }

  return grader;
}
