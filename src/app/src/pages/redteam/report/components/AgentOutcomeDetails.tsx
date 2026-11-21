import {
  AgentOutcomeEvidenceSchema,
  AgentOutcomeResultSchema,
} from '@promptfoo/contracts/agentOutcomes';
import {
  type AgentOutcomeCase,
  AgentOutcomeCaseSchema,
  getAgentOutcomeArtifact,
} from '@promptfoo/redteam/constants/agentOutcomes';
import type { GradingResult } from '@promptfoo/types';

import type { TestWithMetadata } from './shared';

type Identity = Pick<AgentOutcomeCase, 'pluginId' | 'caseId'>;

function matchesCase(a: Identity, b: Identity) {
  return a.caseId === b.caseId && a.pluginId === b.pluginId;
}

function findOutcome(grade: GradingResult | undefined, assigned: AgentOutcomeCase) {
  const grades = [grade, ...(grade?.componentResults ?? [])];
  for (const component of grades) {
    const result = AgentOutcomeResultSchema.safeParse(component?.metadata?.agentOutcomeResult);
    if (
      result.success &&
      matchesCase(assigned, result.data) &&
      result.data.mode === assigned.mode &&
      result.data.variant === assigned.variant
    ) {
      return result.data;
    }
  }
}

function yesNo(value: boolean | null | undefined) {
  if (value == null) {
    return 'Unknown';
  }
  return value ? 'Yes' : 'No';
}

export function AgentOutcomeDetails({ test }: { test: TestWithMetadata }) {
  const testCase = test.result?.testCase;
  if (!testCase?.metadata?.agentOutcome) {
    return null;
  }
  const parsed = AgentOutcomeCaseSchema.safeParse(testCase.metadata.agentOutcome);
  if (!parsed.success) {
    return null;
  }

  const { mode } = parsed.data;
  const artifact = getAgentOutcomeArtifact(testCase);
  const outcome = findOutcome(test.gradingResult, parsed.data);
  const evidence = AgentOutcomeEvidenceSchema.safeParse(
    test.result?.response?.metadata?.agentOutcomeEvidence,
  );
  const measurements =
    evidence.success && matchesCase(parsed.data, evidence.data) ? evidence.data.measurements : null;
  const facts = {
    'Attack source': mode === 'direct' ? 'User request' : 'Third-party content',
    'Reached agent': yesNo(outcome?.attackExposed),
    'Task completed': yesNo(outcome?.taskCompleted),
    'Control passed': yesNo(outcome?.controlPassed),
  };
  return (
    <div className="border-y border-border px-3 py-2 text-sm">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Object.entries(facts).map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {artifact !== undefined && (
        <details className="mt-2">
          <summary className="cursor-pointer">Third-party content for the tool</summary>
          <p className="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted p-3">{artifact}</p>
        </details>
      )}
      {measurements && (
        <details className="mt-2">
          <summary className="cursor-pointer">Recorded measurements</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(measurements, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
