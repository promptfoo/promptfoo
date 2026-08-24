import { useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Info } from 'lucide-react';

import type { ProviderOptions } from '../../types';

interface CodexSecurityConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
}

const PROVIDER_PREFIX = 'openai:codex-security';

const OPERATION_OPTIONS = [
  { value: 'security-scan', label: 'Standard security scan' },
  { value: 'deep-security-scan', label: 'Deep security scan' },
  { value: 'security-diff-scan', label: 'Git diff security scan' },
  { value: 'validation', label: 'Validate a finding' },
  { value: 'fix-finding', label: 'Fix a finding' },
  { value: 'verify-fix', label: 'Verify a security fix' },
  { value: 'threat-model', label: 'Create a threat model' },
  { value: 'finding-discovery', label: 'Discover candidate findings' },
  { value: 'attack-path-analysis', label: 'Analyze an attack path' },
  { value: 'triage-finding', label: 'Triage a finding' },
  { value: 'define-security-policy', label: 'Define a security policy' },
  { value: 'propose-security-hardening', label: 'Propose security hardening' },
  { value: 'vulnerability-writeup', label: 'Write a vulnerability report' },
  { value: 'track-findings', label: 'Track findings externally' },
] as const;

const REASONING_OPTIONS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];

const SELECT_CLASS_NAME =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background';

const DEEP_SCAN_FIELDS = [
  'workers',
  'subagents',
  'stop_after_no_new',
  'max_discovery_runs',
  'max_time_hours',
] as const;

export default function CodexSecurityConfiguration({
  selectedTarget,
  updateCustomTarget,
}: CodexSecurityConfigurationProps) {
  const config = selectedTarget.config ?? {};
  const operation = typeof config.operation === 'string' ? config.operation : 'security-scan';
  const model = selectedTarget.id.startsWith(`${PROVIDER_PREFIX}:`)
    ? selectedTarget.id.slice(PROVIDER_PREFIX.length + 1)
    : typeof config.model === 'string'
      ? config.model
      : '';
  const isScan = ['security-scan', 'deep-security-scan', 'security-diff-scan'].includes(operation);
  const isRepositoryScan = ['security-scan', 'deep-security-scan'].includes(operation);
  const isDeepScan = operation === 'deep-security-scan';
  const isDiffScan = operation === 'security-diff-scan';
  const isFindingOperation = ['validation', 'fix-finding', 'verify-fix'].includes(operation);
  const isRemediationOperation = ['fix-finding', 'verify-fix'].includes(operation);
  const changesRepository = ['fix-finding', 'define-security-policy'].includes(operation);
  const [scopedPaths, setScopedPaths] = useState(() =>
    Array.isArray(config.paths) ? config.paths.join(', ') : '',
  );

  const updateOperation = (nextOperation: string) => {
    const nextConfig: ProviderOptions['config'] = { ...config, operation: nextOperation };

    if (nextOperation === 'deep-security-scan') {
      nextConfig.workers ??= 2;
      nextConfig.subagents ??= 1;
      nextConfig.max_discovery_runs ??= 3;
    } else {
      for (const field of DEEP_SCAN_FIELDS) {
        delete nextConfig[field];
      }
    }

    if (nextOperation !== 'security-diff-scan') {
      delete nextConfig.base_ref;
      delete nextConfig.head_ref;
      delete nextConfig.working_tree;
    }

    if (!['security-scan', 'deep-security-scan'].includes(nextOperation)) {
      delete nextConfig.paths;
      setScopedPaths('');
    }

    if (!['validation', 'fix-finding', 'verify-fix'].includes(nextOperation)) {
      delete nextConfig.finding_file;
    }

    if (['fix-finding', 'verify-fix'].includes(nextOperation)) {
      if (nextConfig.model_reasoning_effort === 'ultra') {
        nextConfig.model_reasoning_effort = 'max';
      }
      if (nextConfig.reasoning_effort === 'ultra') {
        nextConfig.reasoning_effort = 'max';
      }
    } else {
      delete nextConfig.finding_id;
      delete nextConfig.scan_id;
      delete nextConfig.severity;
    }

    if (!['fix-finding', 'define-security-policy'].includes(nextOperation)) {
      delete nextConfig.allow_file_writes;
    }

    if (nextOperation !== 'track-findings') {
      delete nextConfig.allow_external_writes;
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
      <Alert variant="info">
        <Info className="size-4" />
        <AlertContent>
          <AlertDescription>
            <p className="font-semibold">Codex Security SDK</p>
            <p className="mt-1">
              Compare repository scans, security skills, finding remediation, model reasoning, and
              estimated cost. Install <code>@openai/codex-security@^0.1.18</code> and use an
              existing Codex login or OpenAI API key.
            </p>
          </AlertDescription>
        </AlertContent>
      </Alert>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="codex-security-operation">Security operation</Label>
          <select
            id="codex-security-operation"
            className={SELECT_CLASS_NAME}
            value={operation}
            onChange={(event) => updateOperation(event.target.value)}
          >
            {OPERATION_OPTIONS.map((option) => (
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
            onChange={(event) =>
              updateCustomTarget(
                'id',
                event.target.value ? `${PROVIDER_PREFIX}:${event.target.value}` : PROVIDER_PREFIX,
              )
            }
          />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="codex-security-repository">
            Repository path <span className="text-destructive">*</span>
          </Label>
          <Input
            id="codex-security-repository"
            value={typeof config.repository === 'string' ? config.repository : ''}
            placeholder="/absolute/path/to/repository"
            onChange={(event) => updateCustomTarget('repository', event.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            Use the same authorized repository for every model or scan-depth comparison.
          </p>
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
              Optional comma-separated repository paths. Leave blank to scan the entire repository.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="codex-security-reasoning">Reasoning effort</Label>
          <select
            id="codex-security-reasoning"
            className={SELECT_CLASS_NAME}
            value={config.model_reasoning_effort ?? 'high'}
            onChange={(event) => updateCustomTarget('model_reasoning_effort', event.target.value)}
          >
            {REASONING_OPTIONS.filter(
              (effort) => !isRemediationOperation || effort !== 'ultra',
            ).map((effort) => (
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
            value={config.auth ?? 'auto'}
            onChange={(event) => updateCustomTarget('auth', event.target.value)}
          >
            <option value="auto">Automatic</option>
            <option value="chatgpt">Existing Codex / ChatGPT login</option>
            <option value="api-key">OpenAI API key</option>
          </select>
        </div>

        {isScan && (
          <>
            <div className="space-y-2">
              <Label htmlFor="codex-security-max-cost">Maximum cost (USD)</Label>
              <Input
                id="codex-security-max-cost"
                type="number"
                min="0.01"
                step="0.01"
                value={config.max_cost_usd ?? ''}
                placeholder="1"
                onChange={(event) => updateOptionalNumber('max_cost_usd', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="codex-security-output-dir">Artifact output directory</Label>
              <Input
                id="codex-security-output-dir"
                value={typeof config.output_dir === 'string' ? config.output_dir : ''}
                placeholder="Optional; choose a path outside the repository"
                onChange={(event) => updateOptionalString('output_dir', event.target.value)}
              />
            </div>
          </>
        )}

        {isDeepScan && (
          <>
            <div className="space-y-2">
              <Label htmlFor="codex-security-workers">Discovery workers</Label>
              <Input
                id="codex-security-workers"
                type="number"
                min="1"
                step="1"
                value={config.workers ?? ''}
                onChange={(event) => updateOptionalNumber('workers', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="codex-security-subagents">Subagents per worker</Label>
              <Input
                id="codex-security-subagents"
                type="number"
                min="0"
                step="1"
                value={config.subagents ?? ''}
                onChange={(event) => updateOptionalNumber('subagents', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="codex-security-max-runs">Maximum discovery passes</Label>
              <Input
                id="codex-security-max-runs"
                type="number"
                min="1"
                step="1"
                value={config.max_discovery_runs ?? ''}
                onChange={(event) => updateOptionalNumber('max_discovery_runs', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="codex-security-max-hours">Maximum runtime (hours)</Label>
              <Input
                id="codex-security-max-hours"
                type="number"
                min="0.01"
                step="0.1"
                value={config.max_time_hours ?? ''}
                placeholder="Optional"
                onChange={(event) => updateOptionalNumber('max_time_hours', event.target.value)}
              />
            </div>
          </>
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
            <Label htmlFor="codex-security-finding-file">Finding file</Label>
            <Input
              id="codex-security-finding-file"
              value={typeof config.finding_file === 'string' ? config.finding_file : ''}
              placeholder="Optional; otherwise the evaluation prompt supplies the finding"
              onChange={(event) => updateOptionalString('finding_file', event.target.value)}
            />
          </div>
        )}

        {isRemediationOperation && (
          <>
            <div className="space-y-2">
              <Label htmlFor="codex-security-finding-id">Finding ID</Label>
              <Input
                id="codex-security-finding-id"
                value={typeof config.finding_id === 'string' ? config.finding_id : ''}
                placeholder="Optional saved finding ID"
                onChange={(event) => updateOptionalString('finding_id', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="codex-security-scan-id">Scan ID</Label>
              <Input
                id="codex-security-scan-id"
                value={typeof config.scan_id === 'string' ? config.scan_id : ''}
                placeholder="Optional saved scan ID"
                onChange={(event) => updateOptionalString('scan_id', event.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="codex-security-severity">Minimum finding severity</Label>
              <select
                id="codex-security-severity"
                className={SELECT_CLASS_NAME}
                value={typeof config.severity === 'string' ? config.severity : ''}
                onChange={(event) => updateOptionalString('severity', event.target.value)}
              >
                <option value="">Any severity</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </>
        )}

        {changesRepository && (
          <label className="flex items-start gap-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={config.allow_file_writes === true}
              onChange={(event) => updateCustomTarget('allow_file_writes', event.target.checked)}
            />
            <span>
              Allow repository file changes. Run remediation against an isolated repository
              checkout.
            </span>
          </label>
        )}

        {operation === 'track-findings' && (
          <label className="flex items-start gap-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={config.allow_external_writes === true}
              onChange={(event) =>
                updateCustomTarget('allow_external_writes', event.target.checked)
              }
            />
            <span>Allow creating or updating findings in external issue trackers.</span>
          </label>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Provider ID: <code>{selectedTarget.id}</code>
      </p>
    </div>
  );
}
