import { Alert, AlertDescription } from '@app/components/ui/alert';
import { EVAL_ROUTES } from '@app/constants/routes';
import {
  type AgentOutcomeCase,
  AgentOutcomeEvidenceSchema,
  AgentOutcomeResultSchema,
} from '@promptfoo/contracts';
import { Link } from 'react-router';
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

export function AgentOutcomeCoverage({ count, evalId }: { count: number; evalId: string | null }) {
  if (!count || !evalId) {
    return null;
  }
  return (
    <Alert variant="warning">
      <AlertDescription>
        Pass rates exclude {count} agent outcome {count === 1 ? 'test' : 'tests'} with errors.{' '}
        <Link
          to={EVAL_ROUTES.DETAIL(encodeURIComponent(evalId)) + '?mode=errors'}
          className="underline"
        >
          View errors
        </Link>
      </AlertDescription>
    </Alert>
  );
}

export function getAgentOutcomeLabel({ mode, variant }: AgentOutcomeCase) {
  if (variant === 'authorized') {
    return 'Authorized folder share';
  }
  return (
    (mode === 'indirect' ? 'Indirect' : 'Direct') + (variant === 'attack' ? ' attack' : ' baseline')
  );
}

export function AgentOutcomeDetails({
  test,
  assigned,
}: {
  test: TestWithMetadata;
  assigned: AgentOutcomeCase & { artifact?: string };
}) {
  const { mode, artifact } = assigned;
  const outcome = findOutcome(test.gradingResult, assigned);
  const evidence = AgentOutcomeEvidenceSchema.safeParse(
    test.result?.response?.metadata?.agentOutcomeEvidence,
  );
  const measurements =
    evidence.success && matchesCase(assigned, evidence.data) ? evidence.data.measurements : null;
  const facts = {
    [mode === 'direct' ? 'User request delivered' : 'Tool content delivered']: yesNo(
      outcome?.attackExposed,
    ),
    'Task completed': yesNo(outcome?.taskCompleted),
    'Positive control passed': yesNo(outcome?.controlPassed),
  };
  return (
    <div className="border-y border-border px-3 py-2 text-sm">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
