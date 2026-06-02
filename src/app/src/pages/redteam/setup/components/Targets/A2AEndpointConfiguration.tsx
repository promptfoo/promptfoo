import React, { useEffect, useRef, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import Editor from '@app/components/ui/code-editor';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import { HelperText } from '@app/components/ui/helper-text';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import Prism from '@app/lib/prism';
import { cn } from '@app/lib/utils';
import { AlertCircle, AlignLeft, ChevronDown, Code2, Eye, EyeOff, Server } from 'lucide-react';

import type { ProviderOptions } from '../../types';

interface A2AEndpointConfigurationProps {
  selectedTarget: ProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
  rawConfigJson: string;
  setRawConfigJson: (value: string) => void;
  bodyError: string | React.ReactNode | null;
}

type A2AAuthConfig = {
  type?: 'bearer' | 'basic' | 'api_key' | 'oauth' | 'no_auth';
  token?: string;
  username?: string;
  password?: string;
  keyName?: string;
  value?: string;
  placement?: 'header' | 'query';
  grantType?: 'client_credentials' | 'password';
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string[] | string;
};

type A2AProviderConfig = Record<string, unknown> & {
  url?: string;
  agentCardUrl?: string;
  auth?: A2AAuthConfig;
};

const A2A_STRUCTURED_CONFIG_KEYS = new Set(['url', 'agentCardUrl', 'auth']);

const A2A_DOC_URL = 'https://www.promptfoo.dev/docs/providers/a2a/';

const A2A_CONFIG_EXAMPLE = {
  mode: 'auto',
  tenant: 'optional-tenant',
  protocolVersion: '1.0',
  polling: {
    enabled: true,
    intervalMs: 1000,
    timeoutMs: 300000,
  },
  headers: {
    'X-Custom-Header': '{{value}}',
  },
  message: {
    role: 'ROLE_USER',
    parts: [{ text: '{{prompt}}' }],
  },
  transformResponse: 'text || JSON.stringify(json.raw)',
};

const asA2AConfig = (config?: ProviderOptions['config']): A2AProviderConfig =>
  (config ?? {}) as A2AProviderConfig;

const getA2AAdvancedConfig = (config?: ProviderOptions['config']): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(config ?? {}).filter(([key]) => !A2A_STRUCTURED_CONFIG_KEYS.has(key)),
  );

const getA2AStructuredConfig = (config?: ProviderOptions['config']): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(config ?? {}).filter(([key]) => A2A_STRUCTURED_CONFIG_KEYS.has(key)),
  );

const parseA2AScopes = (value: string): string[] =>
  value
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);

const highlightJSON = (code: string): string => {
  try {
    const grammar = Prism?.languages?.json;
    if (!grammar) {
      return code;
    }
    return Prism.highlight(code, grammar, 'json');
  } catch {
    return code;
  }
};

const SecretInput = ({
  id,
  label,
  value,
  onChange,
  placeholder,
  helperText,
  required,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helperText?: string;
  required?: boolean;
}) => {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type={isVisible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pr-10"
          autoComplete="off"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
              onClick={() => setIsVisible((current) => !current)}
              aria-label={isVisible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            >
              {isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isVisible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          </TooltipContent>
        </Tooltip>
      </div>
      {helperText && <p className="text-sm text-muted-foreground">{helperText}</p>}
    </div>
  );
};

const A2AEndpointConfiguration = ({
  selectedTarget,
  updateCustomTarget,
  rawConfigJson,
  setRawConfigJson,
  bodyError,
}: A2AEndpointConfigurationProps) => {
  const [targetId, setTargetId] = useState(selectedTarget.id || '');
  const [docsExpanded, setDocsExpanded] = useState(false);
  const [advancedConfigError, setAdvancedConfigError] = useState<string | null>(null);
  const initializedTargetId = useRef<string | null>(null);
  const a2aConfig = asA2AConfig(selectedTarget.config);

  useEffect(() => {
    setTargetId(selectedTarget.id || '');
  }, [selectedTarget.id]);

  useEffect(() => {
    const targetKey = selectedTarget.id ?? '';

    if (initializedTargetId.current === targetKey) {
      return;
    }

    initializedTargetId.current = targetKey;
    setRawConfigJson(JSON.stringify(getA2AAdvancedConfig(selectedTarget.config), null, 2));
    setAdvancedConfigError(null);
  }, [selectedTarget.config, selectedTarget.id, setRawConfigJson]);

  const handleTargetIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTargetId(value);
    updateCustomTarget('id', value);
  };

  const handleAdvancedConfigChange = (content: string) => {
    setRawConfigJson(content);

    try {
      const parsedConfig = JSON.parse(content);

      if (
        typeof parsedConfig !== 'object' ||
        parsedConfig === null ||
        Array.isArray(parsedConfig)
      ) {
        setAdvancedConfigError('Advanced configuration must be a JSON object');
        return;
      }

      setAdvancedConfigError(null);
      updateCustomTarget('config', {
        ...parsedConfig,
        ...getA2AStructuredConfig(selectedTarget.config),
      });
    } catch {
      setAdvancedConfigError('Invalid JSON configuration');
    }
  };

  const handleFormatJson = () => {
    if (!rawConfigJson.trim()) {
      return;
    }

    try {
      const parsed = JSON.parse(rawConfigJson);
      const formatted = JSON.stringify(parsed, null, 2);
      setRawConfigJson(formatted);
      updateCustomTarget('config', {
        ...parsed,
        ...getA2AStructuredConfig(selectedTarget.config),
      });
      setAdvancedConfigError(null);
    } catch {
      // Error state is already shown via bodyError/advancedConfigError.
    }
  };

  const updateA2AField = (field: string, value: unknown) => {
    updateCustomTarget(field, value);
  };

  const updateA2AAuth = (auth: A2AAuthConfig | undefined) => {
    updateCustomTarget('auth', auth);
  };

  const updateA2AAuthField = (field: keyof A2AAuthConfig, value: unknown) => {
    updateA2AAuth({
      ...(a2aConfig.auth ?? {}),
      [field]: value,
    });
  };

  const handleA2AAuthTypeChange = (value: string) => {
    switch (value) {
      case 'bearer':
        updateA2AAuth({ type: 'bearer', token: '' });
        break;
      case 'basic':
        updateA2AAuth({ type: 'basic', username: '', password: '' });
        break;
      case 'api_key':
        updateA2AAuth({ type: 'api_key', keyName: 'X-API-Key', placement: 'header', value: '' });
        break;
      case 'oauth':
        updateA2AAuth({
          type: 'oauth',
          grantType: 'client_credentials',
          tokenUrl: '',
          clientId: '',
          clientSecret: '',
          scopes: [],
        });
        break;
      default:
        updateA2AAuth(undefined);
    }
  };

  const handleA2AOAuthGrantTypeChange = (grantType: 'client_credentials' | 'password') => {
    const currentAuth = a2aConfig.auth ?? {};

    if (grantType === 'password') {
      updateA2AAuth({
        ...currentAuth,
        type: 'oauth',
        grantType,
        username: currentAuth.username ?? '',
        password: currentAuth.password ?? '',
      });
      return;
    }

    const { username: _username, password: _password, ...authWithoutPassword } = currentAuth;
    updateA2AAuth({
      ...authWithoutPassword,
      type: 'oauth',
      grantType,
    });
  };

  const renderA2AAuthFields = () => {
    const auth = a2aConfig.auth;

    return (
      <div className="mt-6 space-y-4 rounded-lg border border-border p-4">
        <div>
          <h4 className="font-medium">Authorization</h4>
          <p className="text-sm text-muted-foreground">
            Configure common A2A authentication without manually editing headers.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="a2a-auth-type">Authentication Type</Label>
          <Select value={auth?.type ?? 'no_auth'} onValueChange={handleA2AAuthTypeChange}>
            <SelectTrigger id="a2a-auth-type">
              <SelectValue placeholder="Select authentication type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="no_auth">No Auth</SelectItem>
              <SelectItem value="bearer">Bearer Token</SelectItem>
              <SelectItem value="basic">Basic Auth</SelectItem>
              <SelectItem value="api_key">API Key</SelectItem>
              <SelectItem value="oauth">OAuth 2.0</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {auth?.type === 'bearer' && (
          <SecretInput
            id="a2a-bearer-token"
            label="Bearer Token"
            value={auth.token ?? ''}
            onChange={(value) => updateA2AAuthField('token', value)}
            placeholder="{{A2A_API_KEY}}"
            helperText="Sent as an Authorization: Bearer header."
            required
          />
        )}

        {auth?.type === 'basic' && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="a2a-basic-username">
                Username <span className="text-destructive">*</span>
              </Label>
              <Input
                id="a2a-basic-username"
                value={auth.username ?? ''}
                onChange={(e) => updateA2AAuthField('username', e.target.value)}
              />
            </div>
            <SecretInput
              id="a2a-basic-password"
              label="Password"
              value={auth.password ?? ''}
              onChange={(value) => updateA2AAuthField('password', value)}
              required
            />
          </div>
        )}

        {auth?.type === 'api_key' && (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="a2a-api-key-placement">Placement</Label>
              <Select
                value={auth.placement ?? 'header'}
                onValueChange={(value) => updateA2AAuthField('placement', value)}
              >
                <SelectTrigger id="a2a-api-key-placement">
                  <SelectValue placeholder="Select placement" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="header">Header</SelectItem>
                  <SelectItem value="query">Query Parameter</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="a2a-api-key-name">
                Key Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="a2a-api-key-name"
                value={auth.keyName ?? 'X-API-Key'}
                onChange={(e) => updateA2AAuthField('keyName', e.target.value)}
                placeholder={auth.placement === 'query' ? 'api_key' : 'X-API-Key'}
              />
            </div>
            <SecretInput
              id="a2a-api-key-value"
              label="API Key Value"
              value={auth.value ?? ''}
              onChange={(value) => updateA2AAuthField('value', value)}
              placeholder="{{A2A_API_KEY}}"
              required
            />
          </div>
        )}

        {auth?.type === 'oauth' && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="a2a-oauth-grant-type">Grant Type</Label>
                <Select
                  value={auth.grantType ?? 'client_credentials'}
                  onValueChange={(value) =>
                    handleA2AOAuthGrantTypeChange(value as 'client_credentials' | 'password')
                  }
                >
                  <SelectTrigger id="a2a-oauth-grant-type">
                    <SelectValue placeholder="Select grant type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client_credentials">Client Credentials</SelectItem>
                    <SelectItem value="password">Username & Password</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="a2a-oauth-token-url">Token URL</Label>
                <Input
                  id="a2a-oauth-token-url"
                  value={auth.tokenUrl ?? ''}
                  onChange={(e) => updateA2AAuthField('tokenUrl', e.target.value)}
                  placeholder="https://agent.example.com/oauth/token"
                />
                <p className="text-sm text-muted-foreground">
                  Optional when the Agent Card exposes an auth realm that supports discovery.
                </p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="a2a-oauth-client-id">Client ID</Label>
                <Input
                  id="a2a-oauth-client-id"
                  value={auth.clientId ?? ''}
                  onChange={(e) => updateA2AAuthField('clientId', e.target.value)}
                  placeholder="{{A2A_CLIENT_ID}}"
                />
              </div>
              <SecretInput
                id="a2a-oauth-client-secret"
                label="Client Secret"
                value={auth.clientSecret ?? ''}
                onChange={(value) => updateA2AAuthField('clientSecret', value)}
                placeholder="{{A2A_CLIENT_SECRET}}"
              />
            </div>
            {auth.grantType === 'password' && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="a2a-oauth-username">
                    Username <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="a2a-oauth-username"
                    value={auth.username ?? ''}
                    onChange={(e) => updateA2AAuthField('username', e.target.value)}
                  />
                </div>
                <SecretInput
                  id="a2a-oauth-password"
                  label="Password"
                  value={auth.password ?? ''}
                  onChange={(value) => updateA2AAuthField('password', value)}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="a2a-oauth-scopes">Scopes</Label>
              <Input
                id="a2a-oauth-scopes"
                value={Array.isArray(auth.scopes) ? auth.scopes.join(', ') : (auth.scopes ?? '')}
                onChange={(e) => updateA2AAuthField('scopes', parseA2AScopes(e.target.value))}
                placeholder="agent:invoke, tasks:read"
              />
              <p className="text-sm text-muted-foreground">Comma-separated OAuth scopes.</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="mt-4">
      <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
        <Server className="size-5 text-primary" />
        A2A Provider
      </h3>

      <div className="rounded-lg border border-border p-4">
        <div className="space-y-2">
          <Label htmlFor="a2a-target-id">
            Provider ID <span className="text-destructive">*</span>
          </Label>
          <Input
            id="a2a-target-id"
            value={targetId}
            onChange={handleTargetIdChange}
            placeholder="a2a or a2a:https://agent.example.com/a2a/v1"
          />
          <p className="text-sm text-muted-foreground">
            Agent2Agent (A2A) HTTP+JSON endpoint configuration. Promptfoo sends test prompts as A2A
            messages and reads final messages, task artifacts, or streaming events. See{' '}
            <a
              href={A2A_DOC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              documentation
            </a>
            .
          </p>
        </div>

        <div className="mt-6 space-y-4 rounded-lg border border-border p-4">
          <div>
            <h4 className="font-medium">Connection</h4>
            <p className="text-sm text-muted-foreground">
              Start with an Agent Card when available. Use an endpoint URL only to override
              discovery or connect directly.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="a2a-agent-card-url">Agent Card URL</Label>
              <Input
                id="a2a-agent-card-url"
                value={a2aConfig.agentCardUrl ?? ''}
                onChange={(e) => updateA2AField('agentCardUrl', e.target.value)}
                placeholder="https://agent.example.com/.well-known/agent-card.json"
              />
              <p className="text-sm text-muted-foreground">
                Recommended. Used to discover the HTTP+JSON endpoint, tenant, and protocol version.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="a2a-url">A2A Endpoint URL</Label>
              <Input
                id="a2a-url"
                value={a2aConfig.url ?? ''}
                onChange={(e) => updateA2AField('url', e.target.value)}
                placeholder="https://agent.example.com/a2a/v1"
              />
              <p className="text-sm text-muted-foreground">
                Optional override. Used for /message:send, /message:stream, and task polling.
              </p>
            </div>
          </div>
        </div>

        {renderA2AAuthFields()}

        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="a2a-config-json">Advanced Configuration (JSON)</Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleFormatJson}
                  disabled={!rawConfigJson.trim() || !!bodyError || !!advancedConfigError}
                  className="h-7 px-2"
                >
                  <AlignLeft className="size-4" />
                  <span className="ml-1 text-xs">Format</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {bodyError || advancedConfigError ? 'Fix JSON errors first' : 'Format JSON'}
              </TooltipContent>
            </Tooltip>
          </div>

          <Collapsible
            open={docsExpanded}
            onOpenChange={setDocsExpanded}
            className="rounded-lg border border-border"
          >
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted data-[state=open]:rounded-b-none">
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Code2 className="size-4" />
                Examples
              </span>
              <ChevronDown
                className={cn(
                  'size-4 text-muted-foreground transition-transform',
                  docsExpanded && 'rotate-180',
                )}
              />
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-3 border-t border-border p-3">
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    A2A Provider Examples
                  </p>
                  <ul className="space-y-1 text-sm text-muted-foreground">
                    <li>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        a2a:https://agent.example.com/a2a/v1
                      </code>{' '}
                      - Endpoint shorthand
                    </li>
                    <li>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">a2a</code> - Use
                      config.url or config.agentCardUrl
                    </li>
                  </ul>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    JSON Config Example
                  </p>
                  <pre className="rounded bg-muted p-2 text-xs">
                    {JSON.stringify(A2A_CONFIG_EXAMPLE, null, 2)}
                  </pre>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div
            className={cn(
              'overflow-hidden rounded-lg border',
              bodyError || advancedConfigError ? 'border-destructive' : 'border-border',
            )}
          >
            <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
              <span className="text-xs text-muted-foreground">JSON</span>
            </div>
            <div className="bg-white dark:bg-zinc-950">
              <Editor
                value={rawConfigJson}
                onValueChange={handleAdvancedConfigChange}
                highlight={highlightJSON}
                padding={12}
                placeholder={JSON.stringify(A2A_CONFIG_EXAMPLE, null, 2)}
                style={{
                  fontFamily: 'ui-monospace, "Fira Code", monospace',
                  fontSize: 13,
                  minHeight: '120px',
                }}
              />
            </div>
          </div>

          {bodyError || advancedConfigError ? (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="size-4" />
              <AlertContent>
                <AlertDescription>{bodyError || advancedConfigError}</AlertDescription>
              </AlertContent>
            </Alert>
          ) : (
            <HelperText>
              Optional JSON merged with the fields above. Use it for headers, custom message
              templates, mode, tenant, protocol version, polling, timeouts, and transformResponse.
            </HelperText>
          )}
        </div>
      </div>
    </div>
  );
};

export default A2AEndpointConfiguration;
