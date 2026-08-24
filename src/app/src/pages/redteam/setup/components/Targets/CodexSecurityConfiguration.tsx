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
] as const;

const REASONING_OPTIONS = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'];

const SELECT_CLASS_NAME =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background';

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
  const isDiffScan = operation === 'security-diff-scan';
  const isFindingOperation = operation === 'validation';
  const repository =
    typeof config.repository === 'string'
      ? config.repository
      : typeof config.working_dir === 'string'
        ? config.working_dir
        : '';
  const [scopedPaths, setScopedPaths] = useState(() =>
    Array.isArray(config.paths) ? config.paths.join(', ') : '',
  );

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
      <Alert variant="info">
        <Info className="size-4" />
        <AlertContent>
          <AlertDescription>
            <p className="font-semibold">Codex Security SDK</p>
            <p className="mt-1">
              Compare repository scans, finding validation, model reasoning, and estimated cost.
              Install <code>@openai/codex-security@^0.1.18</code> and use an existing Codex login or
              OpenAI API key.
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
            value={config.model_reasoning_effort ?? config.reasoning_effort ?? 'high'}
            onChange={(event) =>
              updateCanonicalSetting(
                'model_reasoning_effort',
                'reasoning_effort',
                event.target.value,
              )
            }
          >
            {REASONING_OPTIONS.map((effort) => (
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
      </div>

      <p className="text-sm text-muted-foreground">
        Provider ID: <code>{selectedTarget.id}</code>
      </p>
    </div>
  );
}
