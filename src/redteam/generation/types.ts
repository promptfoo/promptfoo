export type AttackPredicateSignature = Record<string, boolean>;

export interface AttackSignature {
  predicates: AttackPredicateSignature;
  attributes?: Record<string, string>;
}

export interface AttackFamily {
  id: string;
  label: string;
  description: string;
  instructions: string;
  examples?: string[];
  requiredPredicates?: string[];
}

export interface PlannedAttackFamily extends AttackFamily {
  count: number;
}

export interface AttackPlan {
  requestedCount: number;
  families: PlannedAttackFamily[];
}

export interface AttackCandidate {
  prompt: string;
  pluginId: string;
  familyId: string;
  familyLabel: string;
  generationPhase: 'initial' | 'repair';
  signature: AttackSignature;
}
