import { Checkbox } from '@app/components/ui/checkbox';
import { cn } from '@app/lib/utils';
import { CircleAlert, CircleCheck, CircleDashed } from 'lucide-react';
import { riskName } from '../utils/plugins';
import { missingEndpoint, targetDestination } from '../utils/targetDestination';

import type { SetupDraft } from '../hooks/useSetupAgent';
import type { Config } from '../types';

type Status = 'success' | 'error' | 'untested';

export function ConnectionStatus({ status, review }: { status: Status; review?: boolean }) {
  const states = {
    success: [
      CircleCheck,
      review ? 'Connection test passed' : 'Test passed',
      'text-emerald-700 dark:text-emerald-400',
    ],
    error: [
      CircleAlert,
      review
        ? 'Connection test failed. Check the connection in chat before running.'
        : 'Test failed',
      'text-amber-800 dark:text-amber-300',
    ],
    untested: [CircleDashed, 'Untested', 'text-muted-foreground'],
  } as const;
  const [Icon, label, color] = states[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', color)}>
      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      {label}
    </span>
  );
}

export function ConnectionSummary({
  target,
  draft,
  status,
}: {
  target?: Config['target'];
  draft: SetupDraft;
  status?: Status;
}) {
  const { connection, demo } = draft;
  const rows: [string, string][] = [
    [
      'Target',
      connection?.url ||
        connection?.model ||
        (target && targetDestination(target)) ||
        'Not connected',
    ],
  ];
  if (connection?.body) {
    rows.push(['Request', 'POST ' + JSON.stringify(connection.body)]);
  }
  if (connection?.responsePath !== undefined) {
    rows.push(['Read reply', connection.responsePath || 'Plain text']);
  }
  if (connection?.authEnv || connection?.authHeader) {
    const header = connection.authHeader ?? 'Authorization';
    rows.push(['Key header', header === 'Authorization' ? 'Authorization: Bearer' : header]);
    if (connection.authEnv) {
      rows.push(['Key variable', connection.authEnv]);
    }
  } else if (connection?.authEnv === '') {
    rows.push(['Authorization', 'None']);
  }
  return (
    <section className="px-4 py-3 sm:px-5">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h3 className="font-semibold">{demo ? 'Demo connection' : 'Connection'}</h3>
        {status && <ConnectionStatus status={status} />}
      </div>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2 py-1 text-xs leading-5">
            <dt className="w-20 shrink-0 text-muted-foreground sm:w-24">{label}</dt>
            <dd className="min-w-0 flex-1 font-mono wrap-anywhere">{value}</dd>
          </div>
        ))}
      </dl>
      {!status && !connection && target && !missingEndpoint(target) && (
        <p className="mt-1 text-xs text-muted-foreground">
          Use manual setup to test this saved connection.
        </p>
      )}
      {connection?.model && (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          This tests the model directly. To include your app’s instructions and tools, use its HTTP
          endpoint.{' '}
          {connection.model.startsWith('ollama:')
            ? 'Start Ollama with this model before running.'
            : 'Your model provider’s credentials must be available where Promptfoo runs.'}
        </p>
      )}
    </section>
  );
}

const FACT_LABELS = {
  redteamUser: 'Test as',
  accessToData: 'Can read',
  forbiddenData: 'Must keep private',
  accessToActions: 'Can do',
  forbiddenActions: 'Must not do',
} as const;

function AppDetails({ config }: { config: Config }) {
  const facts = Object.entries(FACT_LABELS).flatMap(([field, label]) => {
    const value = config.applicationDefinition[field as keyof typeof FACT_LABELS];
    return value ? [[label, value]] : [];
  });
  return facts.length ? (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="cursor-pointer hover:text-foreground">App details</summary>
      <dl className="mt-2 space-y-2">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="font-medium text-foreground">{label}</dt>
            <dd className="wrap-anywhere">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  ) : null;
}

export default function SetupPlan({
  draft,
  setDraft,
  config,
  disabled,
  status,
}: {
  draft: SetupDraft;
  setDraft: (draft: SetupDraft) => void;
  config: Config;
  disabled: boolean;
  status?: Status;
}) {
  const { plan, excluded = [] } = draft;
  if (!plan) {
    return null;
  }
  return (
    <fieldset
      disabled={disabled}
      aria-label="Proposed setup"
      className="min-w-0 divide-y divide-border rounded-xl border border-border bg-card text-sm"
    >
      <ConnectionSummary target={config.target} draft={draft} status={status} />
      <section className="p-4 sm:px-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2">
          <h3 className="font-semibold">Test plan</h3>
          <span className="text-xs text-muted-foreground">
            {config.numTests} direct {config.numTests === 1 ? 'test' : 'tests'} per risk
          </span>
        </div>
        <p className="mt-1 wrap-anywhere text-muted-foreground">{plan.purpose}</p>
        <AppDetails config={config} />
        <ul className="mt-3 space-y-3">
          {plan.plugins.map(({ id, reason }) => (
            <li key={id} className="flex items-start gap-2.5">
              <Checkbox
                id={'risk-' + id}
                className="mt-0.5"
                checked={config.plugins.includes(id)}
                aria-label={riskName(id)}
                aria-describedby={'reason-' + id}
                onCheckedChange={() =>
                  setDraft({
                    ...draft,
                    excluded: excluded.includes(id)
                      ? excluded.filter((value) => value !== id)
                      : [...excluded, id],
                  })
                }
              />
              <label htmlFor={'risk-' + id} className="min-w-0 cursor-pointer">
                <span className="block font-medium">{riskName(id)}</span>
                <span id={'reason-' + id} className="block wrap-anywhere text-muted-foreground">
                  {reason}
                </span>
              </label>
            </li>
          ))}
        </ul>
        {plan.note && <p className="mt-3 wrap-anywhere">{plan.note}</p>}
      </section>
    </fieldset>
  );
}
