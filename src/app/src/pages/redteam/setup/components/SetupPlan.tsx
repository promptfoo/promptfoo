import { cn } from '@app/lib/utils';
import { isPlainObject } from '@app/utils/isPlainObject';
import { CircleAlert, CircleCheck, CircleDashed } from 'lucide-react';
import { credentialHeaders, type SetupDraft, targets } from '../hooks/useSetupAgent';
import { riskName } from '../utils/plugins';

function ConnectionStatus({ success }: { success?: boolean }) {
  const [Icon, label, color] =
    success === undefined
      ? ([CircleDashed, 'Untested', 'text-muted-foreground'] as const)
      : success
        ? ([CircleCheck, 'Test passed', 'text-emerald-700 dark:text-emerald-400'] as const)
        : ([CircleAlert, 'Test failed', 'text-amber-800 dark:text-amber-300'] as const);
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 text-xs font-medium', color)}>
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
}

function targetName(target: unknown) {
  if (typeof target === 'string') {
    return target;
  }
  if (!isPlainObject(target)) {
    return 'Custom target';
  }
  const config = isPlainObject(target.config) ? target.config : {};
  const url =
    typeof config.url === 'string'
      ? config.url
      : typeof config.apiBaseUrl === 'string'
        ? config.apiBaseUrl
        : undefined;
  const id = typeof target.id === 'string' ? target.id : undefined;
  const destination = url || id || 'Custom target';
  const address =
    typeof config.method === 'string' ? config.method + ' ' + destination : destination;
  return typeof target.label === 'string' && target.label !== destination
    ? target.label + ' · ' + address
    : address;
}

function names(items: unknown, plugin = false): string[] {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item) => {
    const id = typeof item === 'string' ? item : typeof item?.id === 'string' ? item.id : 'Custom';
    if (!plugin) {
      return id;
    }
    const count = item?.numTests;
    return (
      riskName(id) +
      (typeof count === 'number' ? ' (' + count + (count === 1 ? ' test)' : ' tests)') : '')
    );
  });
}

// This is a summary only. Export and execution always use the untouched native config.
export default function SetupPlan({
  draft,
  review = false,
}: {
  draft: SetupDraft;
  review?: boolean;
}) {
  const { config } = draft;
  if (!config) {
    return null;
  }
  const entries = targets(config);
  const redteam = isPlainObject(config.redteam) ? config.redteam : {};
  const plugins = names(redteam.plugins, true);
  const strategies = names(redteam.strategies);
  const languages =
    typeof redteam.language === 'string' ? [redteam.language] : names(redteam.language);
  return (
    <section
      aria-label="Proposed setup"
      className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4 text-sm wrap-anywhere sm:px-5"
    >
      {typeof redteam.purpose === 'string' && <p>{redteam.purpose}</p>}
      <dl className="space-y-3">
        <div>
          <dt className="text-xs font-medium text-muted-foreground">
            {entries.length > 1 ? 'Targets' : 'Target'}
          </dt>
          {!entries.length && <dd>Not connected</dd>}
          {entries.map((target, index) => (
            <dd
              key={index}
              className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
            >
              <span className="min-w-0 font-mono text-xs">
                {targetName(target)}
                {review &&
                  credentialHeaders(target).map((header) => (
                    <span key={header} className="mt-1 block text-muted-foreground">
                      {header}
                    </span>
                  ))}
              </span>
              {draft.testableTargets?.includes(index) && (
                <ConnectionStatus
                  success={draft.tested?.find((result) => result.targetIndex === index)?.success}
                />
              )}
            </dd>
          ))}
        </div>
        {plugins.length > 0 && (
          <div>
            <dt className="text-xs font-medium text-muted-foreground">
              Tests
              {typeof redteam.numTests === 'number' &&
                ' · ' + redteam.numTests + ' per plugin by default'}
            </dt>
            <dd>{plugins.join(' · ')}</dd>
          </div>
        )}
        {strategies.length > 0 && (
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Strategies</dt>
            <dd>{strategies.join(' · ')}</dd>
          </div>
        )}
        {languages.length > 0 && (
          <div>
            <dt className="text-xs font-medium text-muted-foreground">Languages</dt>
            <dd>{languages.join(' · ')}</dd>
          </div>
        )}
      </dl>
      {review && plugins.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Strategies, languages and targets can multiply the number of requests.
        </p>
      )}
    </section>
  );
}
