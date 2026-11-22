import { Alert, AlertDescription } from '@app/components/ui/alert';
import { EVAL_ROUTES } from '@app/constants/routes';
import {
  type AgentOutcomeCase,
  getAgentOutcomeEvidence,
  getAgentOutcomeResult,
} from '@promptfoo/redteam/constants';
import { Link } from 'react-router';

import type { TestWithMetadata } from './shared';

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

export function getAgentOutcomeLabel({
  mode,
  variant,
  metaTicketRevision,
  parentCaseId,
}: AgentOutcomeCase) {
  if (metaTicketRevision) {
    const attempt = parentCaseId ? 'Revised ticket' : 'Seed ticket';
    return `${attempt} · ${metaTicketRevision === 'public' ? 'Public feedback' : 'Blind'}`;
  }
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
  const { mode, artifact, metaTicketRevision, caseId, parentCaseId } = assigned;
  const grade = test.gradingResult ?? test.result?.gradingResult;
  const outcome = getAgentOutcomeResult(grade, assigned);
  const evidence = getAgentOutcomeEvidence(test.result?.response, assigned);
  const observed = grade == null ? evidence : outcome;
  const measurements = evidence?.measurements;
  const decision = test.result?.metadata?.metaTicketRevisionDecision;
  const facts = {
    [mode === 'direct' ? 'User request delivered' : 'Tool content delivered']: yesNo(
      metaTicketRevision ? outcome?.attackExposed : observed?.attackExposed,
    ),
    'Task completed': yesNo(observed?.taskCompleted),
    'Positive control passed': yesNo(outcome?.controlPassed),
    ...(test.result?.response?.guardrails?.flaggedOutput && {
      'Reply flagged by guardrail': 'Yes',
    }),
    ...(metaTicketRevision && { 'Seed case ID': parentCaseId ?? caseId }),
    ...(metaTicketRevision &&
      !parentCaseId &&
      typeof decision === 'string' && {
        'Revision decision': decision,
      }),
  };
  return (
    <div className="border-y border-border px-3 py-2 text-sm">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Object.entries(facts).map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="break-all">{value}</dd>
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
