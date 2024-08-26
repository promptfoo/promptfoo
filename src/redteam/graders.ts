import type { RedteamModelGrader } from './plugins/base';
import { BflaGrader } from './plugins/bfla';
import { BolaGrader } from './plugins/bola';
import { BoplaGrader } from './plugins/bopla';
import { CompetitorsGrader } from './plugins/competitors';
import { ContractsGrader } from './plugins/contracts';
import { DebugAccessGrader } from './plugins/debugAccess';
import { ExcessiveAgencyGrader } from './plugins/excessiveAgency';
import { HallucinationGrader } from './plugins/hallucination';
import { HarmfulGrader } from './plugins/harmful';
import { HijackingGrader } from './plugins/hijacking';
import { ImitationGrader } from './plugins/imitation';
import { OverrelianceGrader } from './plugins/overreliance';
import { PiiGrader } from './plugins/pii';
import { PolicyViolationGrader } from './plugins/policy';
import { PoliticsGrader } from './plugins/politics';
import { PromptExtractionGrader } from './plugins/promptExtraction';
import { RbacGrader } from './plugins/rbac';
import { ResourceConsumptionGrader } from './plugins/resourceConsumption';
import { ShellInjectionGrader } from './plugins/shellInjection';
import { SqlInjectionGrader } from './plugins/sqlInjection';
import { SsrfGrader } from './plugins/ssrf';
import { UnrestrictedAccessGrader } from './plugins/unrestrictedAccess';

const GRADERS = {
  'promptfoo:redteam:overreliance': new OverrelianceGrader(),
  'promptfoo:redteam:competitors': new CompetitorsGrader(),
  'promptfoo:redteam:bopla': new BoplaGrader(),
  'promptfoo:redteam:unrestricted-access': new UnrestrictedAccessGrader(),
  'promptfoo:redteam:resource-consumption': new ResourceConsumptionGrader(),
  'promptfoo:redteam:contracts': new ContractsGrader(),
  'promptfoo:redteam:excessive-agency': new ExcessiveAgencyGrader(),
  'promptfoo:redteam:imitation': new ImitationGrader(),
  'promptfoo:redteam:hallucination': new HallucinationGrader(),
  'promptfoo:redteam:hijacking': new HijackingGrader(),
  'promptfoo:redteam:policy': new PolicyViolationGrader(),
  'promptfoo:redteam:politics': new PoliticsGrader(),
  'promptfoo:redteam:sql-injection': new SqlInjectionGrader(),
  'promptfoo:redteam:shell-injection': new ShellInjectionGrader(),
  'promptfoo:redteam:debug-access': new DebugAccessGrader(),
  'promptfoo:redteam:rbac': new RbacGrader(),
  'promptfoo:redteam:bfla': new BflaGrader(),
  'promptfoo:redteam:bola': new BolaGrader(),
  'promptfoo:redteam:ssrf': new SsrfGrader(),
  'promptfoo:redteam:harmful': new HarmfulGrader(),
  'promptfoo:redteam:harmful:violent-crime': new HarmfulGrader(),
  'promptfoo:redteam:harmful:non-violent-crime': new HarmfulGrader(),
  'promptfoo:redteam:harmful:sex-crime': new HarmfulGrader(),
  'promptfoo:redteam:harmful:child-exploitation': new HarmfulGrader(),
  'promptfoo:redteam:harmful:indiscriminate-weapons': new HarmfulGrader(),
  'promptfoo:redteam:harmful:hate': new HarmfulGrader(),
  'promptfoo:redteam:harmful:self-harm': new HarmfulGrader(),
  'promptfoo:redteam:harmful:sexual-content': new HarmfulGrader(),
  'promptfoo:redteam:harmful:cybercrime': new HarmfulGrader(),
  'promptfoo:redteam:harmful:chemical-biological-weapons': new HarmfulGrader(),
  'promptfoo:redteam:harmful:illegal-drugs': new HarmfulGrader(),
  'promptfoo:redteam:harmful:copyright-violations': new HarmfulGrader(),
  'promptfoo:redteam:harmful:harassment-bullying': new HarmfulGrader(),
  'promptfoo:redteam:harmful:illegal-activities': new HarmfulGrader(),
  'promptfoo:redteam:harmful:graphic-content': new HarmfulGrader(),
  'promptfoo:redteam:harmful:unsafe-practices': new HarmfulGrader(),
  'promptfoo:redteam:harmful:radicalization': new HarmfulGrader(),
  'promptfoo:redteam:harmful:profanity': new HarmfulGrader(),
  'promptfoo:redteam:harmful:insults': new HarmfulGrader(),
  'promptfoo:redteam:harmful:privacy': new HarmfulGrader(),
  // Commented out until the second harmful grader is implemented.
  //'promptfoo:redteam:harmful:intellectual-property': new HarmfulGrader(),
  //'promptfoo:redteam:harmful:misinformation-disinformation': new HarmfulGrader(),
  //'promptfoo:redteam:harmful:specialized-advice': new HarmfulGrader(),
  'promptfoo:redteam:pii': new PiiGrader(),
  'promptfoo:redteam:pii:api-db': new PiiGrader(),
  'promptfoo:redteam:pii:direct': new PiiGrader(),
  'promptfoo:redteam:pii:session': new PiiGrader(),
  'promptfoo:redteam:pii:social': new PiiGrader(),
  'promptfoo:redteam:prompt-extraction': new PromptExtractionGrader(),
};

export function getGraderById(id: string): RedteamModelGrader | undefined {
  return GRADERS[id as keyof typeof GRADERS];
}
