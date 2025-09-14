import { AegisGrader } from './plugins/aegis.js';
import { REDTEAM_MEMORY_POISONING_PLUGIN_ID } from './plugins/agentic/constants.js';
import { MemoryPoisoningPluginGrader } from './plugins/agentic/memoryPoisoning.js';
import { AsciiSmugglingGrader } from './plugins/asciiSmuggling.js';
import type { RedteamGraderBase } from './plugins/base.js';
import { BeavertailsGrader } from './plugins/beavertails.js';
import { BflaGrader } from './plugins/bfla.js';
import { BiasGrader } from './plugins/bias.js';
import { BolaGrader } from './plugins/bola.js';
import { CompetitorsGrader } from './plugins/competitors.js';
import { CcaGrader } from './plugins/contextComplianceAttack.js';
import { ContractsGrader } from './plugins/contracts.js';
import { CrossSessionLeakGrader } from './plugins/crossSessionLeak.js';
import { DebugAccessGrader } from './plugins/debugAccess.js';
import { DivergentRepetitionGrader } from './plugins/divergentRepetition.js';
import { ExcessiveAgencyGrader } from './plugins/excessiveAgency.js';
import { FinancialCalculationErrorPluginGrader } from './plugins/financial/financialCalculationError.js';
import { FinancialComplianceViolationPluginGrader } from './plugins/financial/financialComplianceViolation.js';
import { FinancialConfidentialDisclosurePluginGrader } from './plugins/financial/financialConfidentialDisclosure.js';
import { FinancialCounterfactualPluginGrader } from './plugins/financial/financialCounterfactual.js';
import { FinancialDataLeakagePluginGrader } from './plugins/financial/financialDataLeakage.js';
import { FinancialDefamationPluginGrader } from './plugins/financial/financialDefamation.js';
import { FinancialHallucinationPluginGrader } from './plugins/financial/financialHallucination.js';
import { FinancialImpartialityPluginGrader } from './plugins/financial/financialImpartiality.js';
import { FinancialMisconductPluginGrader } from './plugins/financial/financialMisconduct.js';
import { FinancialSycophancyPluginGrader } from './plugins/financial/financialSycophancy.js';
import { HallucinationGrader } from './plugins/hallucination.js';
import { HarmbenchGrader } from './plugins/harmbench.js';
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
import { HijackingGrader } from './plugins/hijacking.js';
import { ImitationGrader } from './plugins/imitation.js';
import { IndirectPromptInjectionGrader } from './plugins/indirectPromptInjection.js';
import { IntentGrader } from './plugins/intent.js';
import { MCPPluginGrader } from './plugins/mcp.js';
import { MedicalAnchoringBiasPluginGrader } from './plugins/medical/medicalAnchoringBias.js';
import { MedicalHallucinationPluginGrader } from './plugins/medical/medicalHallucination.js';
import { MedicalIncorrectKnowledgePluginGrader } from './plugins/medical/medicalIncorrectKnowledge.js';
import { MedicalOffLabelUsePluginGrader } from './plugins/medical/medicalOffLabelUse.js';
import { MedicalPrioritizationErrorPluginGrader } from './plugins/medical/medicalPrioritizationError.js';
import { MedicalSycophancyPluginGrader } from './plugins/medical/medicalSycophancy.js';
import { OffTopicPluginGrader } from './plugins/offTopic.js';
import { OverrelianceGrader } from './plugins/overreliance.js';
import { PiiGrader } from './plugins/pii.js';
import { PlinyGrader } from './plugins/pliny.js';
import { PolicyViolationGrader } from './plugins/policy.js';
import { PoliticsGrader } from './plugins/politics.js';
import { PromptExtractionGrader } from './plugins/promptExtraction.js';
import { RagDocumentExfiltrationGrader } from './plugins/ragDocumentExfiltration.js';
import { RbacGrader } from './plugins/rbac.js';
import { ReasoningDosGrader } from './plugins/reasoningDos.js';
import { ReligionGrader } from './plugins/religion.js';
import { ShellInjectionGrader } from './plugins/shellInjection.js';
import { SqlInjectionGrader } from './plugins/sqlInjection.js';
import { SsrfGrader } from './plugins/ssrf.js';
import { ToolDiscoveryGrader } from './plugins/toolDiscovery.js';
import { ToxicChatGrader } from './plugins/toxicChat.js';
import { UnsafeBenchGrader } from './plugins/unsafebench.js';
import { UnverifiableClaimsGrader } from './plugins/unverifiableClaims.js';
import { VLGuardGrader } from './plugins/vlguard.js';
import type { RedteamAssertionTypes } from './types.js';

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
  'promptfoo:redteam:cross-session-leak': new CrossSessionLeakGrader(),
  'promptfoo:redteam:debug-access': new DebugAccessGrader(),
  'promptfoo:redteam:divergent-repetition': new DivergentRepetitionGrader(),
  'promptfoo:redteam:excessive-agency': new ExcessiveAgencyGrader(),
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
  'promptfoo:redteam:intent': new IntentGrader(),
  'promptfoo:redteam:mcp': new MCPPluginGrader(),
  'promptfoo:redteam:medical:anchoring-bias': new MedicalAnchoringBiasPluginGrader(),
  'promptfoo:redteam:medical:hallucination': new MedicalHallucinationPluginGrader(),
  'promptfoo:redteam:medical:incorrect-knowledge': new MedicalIncorrectKnowledgePluginGrader(),
  'promptfoo:redteam:medical:off-label-use': new MedicalOffLabelUsePluginGrader(),
  'promptfoo:redteam:medical:prioritization-error': new MedicalPrioritizationErrorPluginGrader(),
  'promptfoo:redteam:medical:sycophancy': new MedicalSycophancyPluginGrader(),
  'promptfoo:redteam:off-topic': new OffTopicPluginGrader(),
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
  'promptfoo:redteam:rbac': new RbacGrader(),
  'promptfoo:redteam:reasoning-dos': new ReasoningDosGrader(),
  'promptfoo:redteam:religion': new ReligionGrader(),
  'promptfoo:redteam:shell-injection': new ShellInjectionGrader(),
  'promptfoo:redteam:sql-injection': new SqlInjectionGrader(),
  'promptfoo:redteam:ssrf': new SsrfGrader(),
  'promptfoo:redteam:tool-discovery': new ToolDiscoveryGrader(),
  'promptfoo:redteam:toxic-chat': new ToxicChatGrader(),
  'promptfoo:redteam:unsafebench': new UnsafeBenchGrader(),
  'promptfoo:redteam:unverifiable-claims': new UnverifiableClaimsGrader(),
  'promptfoo:redteam:vlguard': new VLGuardGrader(),
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
