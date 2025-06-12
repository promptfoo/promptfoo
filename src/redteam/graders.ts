import { AegisGrader } from './plugins/aegis';
import { REDTEAM_MEMORY_POISONING_PLUGIN_ID } from './plugins/agentic/constants';
import { MemoryPoisoningPluginGrader } from './plugins/agentic/memoryPoisoning';
import { AsciiSmugglingGrader } from './plugins/asciiSmuggling';
import type { RedteamGraderBase } from './plugins/base';
import { BeavertailsGrader } from './plugins/beavertails';
import { BflaGrader } from './plugins/bfla';
import { BolaGrader } from './plugins/bola';
import { CompetitorsGrader } from './plugins/competitors';
import { CcaGrader } from './plugins/contextComplianceAttack';
import { ContractsGrader } from './plugins/contracts';
import { CrossSessionLeakGrader } from './plugins/crossSessionLeak';
import { DebugAccessGrader } from './plugins/debugAccess';
import { DivergentRepetitionGrader } from './plugins/divergentRepetition';
import { ExcessiveAgencyGrader } from './plugins/excessiveAgency';
import { HallucinationGrader } from './plugins/hallucination';
import { HarmbenchGrader } from './plugins/harmbench';
import {
  ChildExploitationGrader,
  CopyrightViolationGrader,
  CybercrimeGrader,
  GenderBiasGrader,
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
import { IntentGrader } from './plugins/intent';
import { MCPPluginGrader } from './plugins/mcp';
import { MedicalAnchoringBiasPluginGrader } from './plugins/medical/medicalAnchoringBias';
import { MedicalHallucinationPluginGrader } from './plugins/medical/medicalHallucination';
import { MedicalIncorrectKnowledgePluginGrader } from './plugins/medical/medicalIncorrectKnowledge';
import { MedicalPrioritizationErrorPluginGrader } from './plugins/medical/medicalPrioritizationError';
import { MedicalSycophancyPluginGrader } from './plugins/medical/medicalSycophancy';
import { OffTopicPluginGrader } from './plugins/offTopic';
import { OverrelianceGrader } from './plugins/overreliance';
import { PiiGrader } from './plugins/pii';
import { PlinyGrader } from './plugins/pliny';
import { PolicyViolationGrader } from './plugins/policy';
import { PoliticsGrader } from './plugins/politics';
import { PromptExtractionGrader } from './plugins/promptExtraction';
import { RagDocumentExfiltrationGrader } from './plugins/ragDocumentExfiltration';
import { RbacGrader } from './plugins/rbac';
import { ReasoningDosGrader } from './plugins/reasoningDos';
import { ReligionGrader } from './plugins/religion';
import { ShellInjectionGrader } from './plugins/shellInjection';
import { SqlInjectionGrader } from './plugins/sqlInjection';
import { SsrfGrader } from './plugins/ssrf';
import { ToolDiscoveryGrader } from './plugins/toolDiscovery';
import { ToxicChatGrader } from './plugins/toxicchat';
import { UnsafeBenchGrader } from './plugins/unsafebench';
import type { RedteamAssertionTypes } from './types';

export const GRADERS: Record<RedteamAssertionTypes, RedteamGraderBase> = {
  [REDTEAM_MEMORY_POISONING_PLUGIN_ID]: new MemoryPoisoningPluginGrader(),
  'promptfoo:redteam:aegis': new AegisGrader(),
  'promptfoo:redteam:ascii-smuggling': new AsciiSmugglingGrader(),
  'promptfoo:redteam:beavertails': new BeavertailsGrader(),
  'promptfoo:redteam:bfla': new BflaGrader(),
  'promptfoo:redteam:bias:gender': new GenderBiasGrader(),
  'promptfoo:redteam:bola': new BolaGrader(),
  'promptfoo:redteam:cca': new CcaGrader(),
  'promptfoo:redteam:competitors': new CompetitorsGrader(),
  'promptfoo:redteam:contracts': new ContractsGrader(),
  'promptfoo:redteam:cross-session-leak': new CrossSessionLeakGrader(),
  'promptfoo:redteam:debug-access': new DebugAccessGrader(),
  'promptfoo:redteam:divergent-repetition': new DivergentRepetitionGrader(),
  'promptfoo:redteam:excessive-agency': new ExcessiveAgencyGrader(),
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
};

export function getGraderById(id: string): RedteamGraderBase | undefined {
  // First try to get the exact grader
  const grader = id in GRADERS ? GRADERS[id as keyof typeof GRADERS] : undefined;

  // If not found but the ID starts with 'promptfoo:redteam:harmful', use the general harmful grader
  if (!grader && id.startsWith('promptfoo:redteam:harmful')) {
    return GRADERS['promptfoo:redteam:harmful'];
  }

  return grader;
}
