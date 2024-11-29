import { AsciiSmugglingGrader } from './plugins/asciiSmuggling';
import type { RedteamGraderBase } from './plugins/base';
import { BflaGrader } from './plugins/bfla';
import { BolaGrader } from './plugins/bola';
import { CompetitorsGrader } from './plugins/competitors';
import { ContractsGrader } from './plugins/contracts';
import { CrossSessionLeakGrader } from './plugins/crossSessionLeak';
import { DebugAccessGrader } from './plugins/debugAccess';
import { ExcessiveAgencyGrader } from './plugins/excessiveAgency';
import { HallucinationGrader } from './plugins/hallucination';
import { HarmfulGrader, HarmfulPrivacyGrader } from './plugins/harmful/graders';
import { HijackingGrader } from './plugins/hijacking';
import { ImitationGrader } from './plugins/imitation';
import { IndirectPromptInjectionGrader } from './plugins/indirectPromptInjection';
import { IntentGrader } from './plugins/intent';
import { OverrelianceGrader } from './plugins/overreliance';
import { PiiGrader } from './plugins/pii';
import { PolicyViolationGrader } from './plugins/policy';
import { PoliticsGrader } from './plugins/politics';
import { PromptExtractionGrader } from './plugins/promptExtraction';
import { RbacGrader } from './plugins/rbac';
import { ReligionGrader } from './plugins/religion';
import { ShellInjectionGrader } from './plugins/shellInjection';
import { SqlInjectionGrader } from './plugins/sqlInjection';
import { SsrfGrader } from './plugins/ssrf';
import type { RedteamAssertionTypes } from './types';

export const GRADERS: Record<RedteamAssertionTypes, RedteamGraderBase> = {
  'promptfoo:redteam:ascii-smuggling': new AsciiSmugglingGrader(),
  'promptfoo:redteam:bfla': new BflaGrader(),
  'promptfoo:redteam:bola': new BolaGrader(),
  'promptfoo:redteam:competitors': new CompetitorsGrader(),
  'promptfoo:redteam:contracts': new ContractsGrader(),
  'promptfoo:redteam:cross-session-leak': new CrossSessionLeakGrader(),
  'promptfoo:redteam:debug-access': new DebugAccessGrader(),
  'promptfoo:redteam:excessive-agency': new ExcessiveAgencyGrader(),
  'promptfoo:redteam:hallucination': new HallucinationGrader(),
  'promptfoo:redteam:harmful:chemical-biological-weapons': new HarmfulGrader(),
  'promptfoo:redteam:harmful:child-exploitation': new HarmfulGrader(),
  'promptfoo:redteam:harmful:copyright-violations': new HarmfulGrader(),
  'promptfoo:redteam:harmful:cybercrime': new HarmfulGrader(),
  'promptfoo:redteam:harmful:graphic-content': new HarmfulGrader(),
  'promptfoo:redteam:harmful:harassment-bullying': new HarmfulGrader(),
  'promptfoo:redteam:harmful:hate': new HarmfulGrader(),
  'promptfoo:redteam:harmful:illegal-activities': new HarmfulGrader(),
  'promptfoo:redteam:harmful:illegal-drugs': new HarmfulGrader(),
  'promptfoo:redteam:harmful:indiscriminate-weapons': new HarmfulGrader(),
  'promptfoo:redteam:harmful:insults': new HarmfulGrader(),
  'promptfoo:redteam:harmful:intellectual-property': new HarmfulGrader(),
  'promptfoo:redteam:harmful:misinformation-disinformation': new HarmfulGrader(),
  'promptfoo:redteam:harmful:non-violent-crime': new HarmfulGrader(),
  'promptfoo:redteam:harmful:privacy': new HarmfulPrivacyGrader(),
  'promptfoo:redteam:harmful:profanity': new HarmfulGrader(),
  'promptfoo:redteam:harmful:radicalization': new HarmfulGrader(),
  'promptfoo:redteam:harmful:self-harm': new HarmfulGrader(),
  'promptfoo:redteam:harmful:sex-crime': new HarmfulGrader(),
  'promptfoo:redteam:harmful:sexual-content': new HarmfulGrader(),
  'promptfoo:redteam:harmful:specialized-advice': new HarmfulGrader(),
  'promptfoo:redteam:harmful:unsafe-practices': new HarmfulGrader(),
  'promptfoo:redteam:harmful:violent-crime': new HarmfulGrader(),
  'promptfoo:redteam:harmful': new HarmfulGrader(),
  'promptfoo:redteam:hijacking': new HijackingGrader(),
  'promptfoo:redteam:imitation': new ImitationGrader(),
  'promptfoo:redteam:indirect-prompt-injection': new IndirectPromptInjectionGrader(),
  'promptfoo:redteam:intent': new IntentGrader(),
  'promptfoo:redteam:overreliance': new OverrelianceGrader(),
  'promptfoo:redteam:pii:api-db': new PiiGrader(),
  'promptfoo:redteam:pii:direct': new PiiGrader(),
  'promptfoo:redteam:pii:session': new PiiGrader(),
  'promptfoo:redteam:pii:social': new PiiGrader(),
  'promptfoo:redteam:pii': new PiiGrader(),
  'promptfoo:redteam:policy': new PolicyViolationGrader(),
  'promptfoo:redteam:politics': new PoliticsGrader(),
  'promptfoo:redteam:prompt-extraction': new PromptExtractionGrader(),
  'promptfoo:redteam:rbac': new RbacGrader(),
  'promptfoo:redteam:religion': new ReligionGrader(),
  'promptfoo:redteam:shell-injection': new ShellInjectionGrader(),
  'promptfoo:redteam:sql-injection': new SqlInjectionGrader(),
  'promptfoo:redteam:ssrf': new SsrfGrader(),
};

export function getGraderById(id: string): RedteamGraderBase | undefined {
  return GRADERS[id as keyof typeof GRADERS];
}
