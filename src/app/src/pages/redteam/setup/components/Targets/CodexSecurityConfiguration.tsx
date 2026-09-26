import { useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Info } from 'lucide-react';
import CodexSecuritySetupCheck from './CodexSecuritySetupCheck';

import type { ProviderOptions } from '../../types';

interface CodexSecurityConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
}

const PROVIDER_PREFIX = 'openai:codex-security';

export const CODEX_SECURITY_OPERATION_OPTIONS = [
  { value: 'security-scan', label: 'Standard security scan' },
  { value: 'deep-security-scan', label: 'Deep security scan' },
  { value: 'security-diff-scan', label: 'Git diff security scan' },
  { value: 'validation', label: 'Validate a finding' },
] as const;

export const CODEX_SECURITY_REASONING_OPTIONS = [
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
  'ultra',
] as const;

export const CODEX_SECURITY_AUTH_OPTIONS = [
  { value: 'auto', label: 'Automatic' },
  { value: 'chatgpt', label: 'Existing Codex / ChatGPT login' },
  { value: 'api-key', label: 'OpenAI API key' },
] as const;

const SELECT_CLASS_NAME =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background';

function getBudgetInputValue(value: unknown): string | number {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
    ? value
    : '';
}

function getOperation(value: unknown): string {
  return typeof value === 'string'
    ? (CODEX_SECURITY_OPERATION_OPTIONS.find((option) => option.value === value)?.value ?? '')
    : 'security-scan';
}

function getModel(provider: ProviderOptions): string {
  if (provider.id.startsWith(`${PROVIDER_PREFIX}:`)) {
    return provider.id.slice(PROVIDER_PREFIX.length + 1);
  }
  return typeof provider.config?.model === 'string' ? provider.config.model : '';
}

function getReasoning(value: unknown): string {
  return value === undefined
    ? ''
    : (CODEX_SECURITY_REASONING_OPTIONS.find((option) => option === value) ?? 'unsupported');
}

export default function CodexSecurityConfiguration({
  selectedTarget,
  updateCustomTarget,
}: CodexSecurityConfigurationProps) {
  const config = selectedTarget.config ?? {};
  const isSavedReport = Object.prototype.hasOwnProperty.call(config, 'report_file');
  const operation = getOperation(config.operation);
  const model = getModel(selectedTarget);
  const isScan = ['security-scan', 'deep-security-scan', 'security-diff-scan'].includes(operation);
  const isRepositoryScan = ['security-scan', 'deep-security-scan'].includes(operation);
  const isDiffScan = operation === 'security-diff-scan';
  const isFindingOperation = operation === 'validation';
  const repository =
    typeof config.repository === 'string'
      ? config.repository
      : typeof config.working_dir === 'string'
        ? config.working_dir
        : '';
  const reasoningValue = config.model_reasoning_effort ?? config.reasoning_effort;
  const reasoning = getReasoning(reasoningValue);
  const configuredAuth = config.auth ?? 'auto';
  const auth = CODEX_SECURITY_AUTH_OPTIONS.some((option) => option.value === configuredAuth)
    ? configuredAuth
    : '';
  const [scopedPaths, setScopedPaths] = useState(() =>
    Array.isArray(config.paths) ? config.paths.join(', ') : '',
  );

  const updateSource = (source: string) => {
    const nextConfig = { ...config };
    if (source === 'saved-report') {
      nextConfig.report_file = '';
    } else {
      delete nextConfig.report_file;
    }
    updateCustomTarget('config', nextConfig);
  };

  const updateOperation = (nextOperation: string) => {
    const nextConfig: ProviderOptions['config'] = { ...config, operation: nextOperation };

    if (nextOperation !== 'security-diff-scan') {
      delete nextConfig.base_ref;
      delete nextConfig.head_ref;
      delete nextConfig.working_tree;
    }

    if (!['security-scan', 'deep-security-scan'].includes(nextOperation)) {
      delete nextConfig.paths;
      setScopedPaths('');
    }

    if (nextOperation !== 'validation') {
      delete nextConfig.finding_file;
    }

    updateCustomTarget('config', nextConfig);
  };

  const updateOptionalString = (field: string, value: string) => {
    const nextConfig: ProviderOptions['config'] = { ...config };
    if (value.trim() === '') {
      delete nextConfig[field];
    } else {
      nextConfig[field] = value;
    }
    updateCustomTarget('config', nextConfig);
  };

  const updateOptionalNumber = (field: string, value: string) => {
    const nextConfig: ProviderOptions['config'] = { ...config };
    if (value.trim() === '') {
      delete nextConfig[field];
    } else {
      nextConfig[field] = Number(value);
    }
    updateCustomTarget('config', nextConfig);
  };

  const updateCanonicalSetting = (field: string, alias: string, value: unknown) => {
    const nextConfig: ProviderOptions['config'] = { ...config, [field]: value };
    if (value === undefined) {
      delete nextConfig[field];
    }
    delete nextConfig[alias];
    updateCustomTarget('config', nextConfig);
  };

  const updateScopedPaths = (value: string) => {
    setScopedPaths(value);
    const nextConfig: ProviderOptions['config'] = { ...config };
    const paths = value
      .split(',')
      .map((path) => path.trim())
      .filter(Boolean);
    if (paths.length > 0) {
      nextConfig.paths = paths;
    } else {
      delete nextConfig.paths;
    }
    updateCustomTarget('config', nextConfig);
  };

  const updateWorkingTree = (enabled: boolean) => {
    const nextConfig: ProviderOptions['config'] = { ...config };
    if (enabled) {
      nextConfig.working_tree = true;
      delete nextConfig.head_ref;
    } else {
      delete nextConfig.working_tree;
    }
    updateCustomTarget('config', nextConfig);
  };

  return (
    <div className="space-y-6">
      {!isSavedReport && (
        <Alert variant="info">
          <Info className="size-4" />
          <AlertContent>
            <AlertDescription>
              <p className="font-semibold">Codex Security SDK</p>
              <p className="mt-1">
                Compare repository scans, finding validation, model reasoning, and estimated cost.
                Install <code>promptfoo</code> and <code>@openai/codex-security@^0.1.18</code>{' '}
                together on the machine running the Promptfoo server.
              </p>
              <p className="mt-2">
                Sign in with Codex on that machine, or set <code>OPENAI_API_KEY</code> or{' '}
                <code>CODEX_API_KEY</code> in the server process environment before starting it. The
                Setup page’s API keys dialog and provider-scoped keys do not configure this SDK.
              </p>
            </AlertDescription>
          </AlertContent>
        </Alert>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="codex-security-label">Provider label</Label>
          <Input
            id="codex-security-label"
            value={selectedTarget.label ?? ''}
            placeholder="e.g., Standard scan — high reasoning"
            onChange={(event) => updateCustomTarget('label', event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Give each comparison a distinct label to identify its results.
          </p>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="codex-security-source">Result source</Label>
          <select
            id="codex-security-source"
            className={SELECT_CLASS_NAME}
            value={isSavedReport ? 'saved-report' : 'sdk'}
            onChange={(event) => updateSource(event.target.value)}
          >
            <option value="sdk">SDK operation</option>
            <option value="saved-report">Saved report</option>
          </select>
        </div>

        {isSavedReport ? (
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="codex-security-report-file">
              Report file <span className="text-destructive">*</span>
            </Label>
            <Input
              id="codex-security-report-file"
              value={typeof config.report_file === 'string' ? config.report_file : ''}
              placeholder="/absolute/path/to/report.json"
              onChange={(event) => updateCustomTarget('report_file', event.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              Read an existing Codex Security JSON report from the Promptfoo server. Use an absolute
              path. No SDK operation is run; displayed settings and metrics come from the report.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="codex-security-operation">Security operation</Label>
              <select
                id="codex-security-operation"
                className={SELECT_CLASS_NAME}
                value={operation}
                onChange={(event) => updateOperation(event.target.value)}
              >
                {operation === '' && (
                  <option value="" disabled>
                    Unsupported security operation
                  </option>
                )}
                {CODEX_SECURITY_OPERATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="codex-security-model">Model</Label>
              <Input
                id="codex-security-model"
                value={model}
                placeholder="gpt-5.6-luna"
                onChange={(event) => {
                  const nextModel = event.target.value.trim();
                  updateCustomTarget(
                    'id',
                    nextModel ? `${PROVIDER_PREFIX}:${nextModel}` : PROVIDER_PREFIX,
                  );
                }}
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="codex-security-repository">
                Repository path <span className="text-destructive">*</span>
              </Label>
              <Input
                id="codex-security-repository"
                value={repository}
                placeholder="/absolute/path/to/repository"
                onChange={(event) =>
                  updateCanonicalSetting('repository', 'working_dir', event.target.value)
                }
              />
              <p className="text-sm text-muted-foreground">
                This path must exist on the machine running the Promptfoo server. Use an absolute
                path for web evaluations. To compare repositories, set{' '}
                <code>{'{{repository}}'}</code> here and define a <code>repository</code> variable
                in each test case.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateCanonicalSetting('repository', 'working_dir', '{{repository}}')
                }
              >
                Use repository from test cases
              </Button>
            </div>

            {isRepositoryScan && (
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="codex-security-paths">Scoped paths</Label>
                <Input
                  id="codex-security-paths"
                  value={scopedPaths}
                  placeholder="src/auth, src/api"
                  onChange={(event) => updateScopedPaths(event.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Optional comma-separated repository paths. Leave blank to scan the entire
                  repository.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="codex-security-reasoning">Reasoning effort</Label>
              <select
                id="codex-security-reasoning"
                className={SELECT_CLASS_NAME}
                value={reasoning}
                onChange={(event) =>
                  updateCanonicalSetting(
                    'model_reasoning_effort',
                    'reasoning_effort',
                    event.target.value || undefined,
                  )
                }
              >
                <option value="">SDK default</option>
                {reasoning === 'unsupported' && (
                  <option value="unsupported" disabled>
                    Unsupported reasoning effort
                  </option>
                )}
                {CODEX_SECURITY_REASONING_OPTIONS.map((effort) => (
                  <option key={effort} value={effort}>
                    {effort}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="codex-security-auth">Authentication</Label>
              <select
                id="codex-security-auth"
                className={SELECT_CLASS_NAME}
                value={auth}
                onChange={(event) => updateCustomTarget('auth', event.target.value)}
              >
                {auth === '' && (
                  <option value="" disabled>
                    Unsupported authentication method
                  </option>
                )}
                {CODEX_SECURITY_AUTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            {isScan && (
              <div className="space-y-2">
                <Label htmlFor="codex-security-max-cost">Estimated scan budget (USD)</Label>
                <Input
                  id="codex-security-max-cost"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={getBudgetInputValue(config.max_cost_usd)}
                  placeholder="1"
                  onChange={(event) => updateOptionalNumber('max_cost_usd', event.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Applies to each scan. The SDK stops when estimated spend exceeds this amount, so
                  in-flight work can overshoot it. This is not an exact billing cap or a budget for
                  the whole evaluation. Leave blank to use the SDK default.
                </p>
              </div>
            )}

            {isDiffScan && (
              <>
                <label className="flex items-start gap-3 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={config.working_tree === true}
                    onChange={(event) => updateWorkingTree(event.target.checked)}
                  />
                  <span>Scan uncommitted working-tree changes.</span>
                </label>

                <div className="space-y-2">
                  <Label htmlFor="codex-security-base-ref">Base Git reference</Label>
                  <Input
                    id="codex-security-base-ref"
                    value={typeof config.base_ref === 'string' ? config.base_ref : ''}
                    placeholder={config.working_tree ? 'HEAD' : 'origin/main'}
                    onChange={(event) => updateOptionalString('base_ref', event.target.value)}
                  />
                </div>

                {!config.working_tree && (
                  <div className="space-y-2">
                    <Label htmlFor="codex-security-head-ref">Head Git reference</Label>
                    <Input
                      id="codex-security-head-ref"
                      value={typeof config.head_ref === 'string' ? config.head_ref : ''}
                      placeholder="HEAD"
                      onChange={(event) => updateOptionalString('head_ref', event.target.value)}
                    />
                  </div>
                )}
              </>
            )}

            {isFindingOperation && (
              <div className="space-y-2 sm:col-span-2">
                <p className="text-sm text-muted-foreground">
                  Finding validation does not report reliable token usage or cost. Any saved scan
                  budget does not apply to validation; omit cost assertions for this operation.
                </p>
                <Label htmlFor="codex-security-finding-file">Finding file</Label>
                <Input
                  id="codex-security-finding-file"
                  value={typeof config.finding_file === 'string' ? config.finding_file : ''}
                  placeholder="Optional; otherwise the evaluation prompt supplies the finding"
                  onChange={(event) => updateOptionalString('finding_file', event.target.value)}
                />
              </div>
            )}
          </>
        )}
      </div>

      <CodexSecuritySetupCheck provider={selectedTarget} />

      <p className="text-sm text-muted-foreground">
        Provider ID: <code>{selectedTarget.id}</code>
      </p>
    </div>
  );
}
