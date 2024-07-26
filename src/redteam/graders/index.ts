import RedteamModelGrader from './base';
import CompetitorsGrader from './competitors';
import ContractsGrader from './contracts';
import DebugAccessGrader from './debugAccess';
import ExcessiveAgencyGrader from './excessiveAgency';
import HallucinationGrader from './hallucination';
import HarmfulGrader from './harmful';
import HijackingGrader from './hijacking';
import OverrelianceGrader from './overreliance';
import PiiGrader from './pii';
import PoliticsGrader from './politics';
import RbacGrader from './rbac';
import ShellInjectionGrader from './shellInjection';
import SqlInjectionGrader from './sqlInjection';

const GRADERS = {
  'promptfoo:redteam:overreliance': new OverrelianceGrader(),
  'promptfoo:redteam:competitors': new CompetitorsGrader(),
  'promptfoo:redteam:contracts': new ContractsGrader(),
  'promptfoo:redteam:excessive-agency': new ExcessiveAgencyGrader(),
  'promptfoo:redteam:hallucination': new HallucinationGrader(),
  'promptfoo:redteam:hijacking': new HijackingGrader(),
  'promptfoo:redteam:politics': new PoliticsGrader(),
  'promptfoo:redteam:sql-injection': new SqlInjectionGrader(),
  'promptfoo:redteam:shell-injection': new ShellInjectionGrader(),
  'promptfoo:redteam:debug-access': new DebugAccessGrader(),
  'promptfoo:redteam:rbac': new RbacGrader(),
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
};

export function getGraderById(id: string): RedteamModelGrader | undefined {
  return GRADERS[id as keyof typeof GRADERS];
}
