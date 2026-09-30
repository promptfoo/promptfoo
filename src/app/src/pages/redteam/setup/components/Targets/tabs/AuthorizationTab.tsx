import React, { useId } from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { NumberInput } from '@app/components/ui/number-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { useToast } from '@app/hooks/useToast';
import { cn } from '@app/lib/utils';
import { Check, File, Key, Upload, X } from 'lucide-react';
import { convertStringKeyToPem, validatePrivateKey } from '../../../utils/crypto';
import SensitiveTextField from './SensitiveTextField';

import type { HttpProviderOptions } from '../../../types';

interface AuthorizationTabProps {
  selectedTarget: HttpProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
}

const AuthorizationTab: React.FC<AuthorizationTabProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  const { showToast } = useToast();

  const privateKeyId = useId();
  const signatureHelpId = `${privateKeyId}-help`;

  // Auth configuration helpers
  const getAuthType = (): string | undefined => {
    // Check if digital signature is enabled (it's outside the auth object)
    if (selectedTarget.config?.signatureAuth?.enabled) {
      return 'digital_signature';
    }
    return selectedTarget.config?.auth?.type;
  };

  const handleAuthTypeChange = (newType: string | undefined) => {
    // Clear signature auth for all auth types except digital_signature
    if (newType !== 'digital_signature') {
      updateCustomTarget('signatureAuth', undefined);
    }

    if (newType === undefined || newType === 'no_auth') {
      // Clear all auth config
      updateCustomTarget('auth', undefined);
    } else if (newType === 'digital_signature') {
      // Clear auth object and enable signature auth
      updateCustomTarget('auth', undefined);
      updateCustomTarget('signatureAuth', {
        enabled: true,
        certificateType: selectedTarget.config?.signatureAuth?.certificateType || 'pem',
        keyInputType: selectedTarget.config?.signatureAuth?.keyInputType || 'upload',
      });
    } else if (newType === 'oauth') {
      // Set up OAuth structure with client_credentials as default
      updateCustomTarget('auth', {
        type: 'oauth',
        grantType: 'client_credentials',
        clientId: '',
        clientSecret: '',
        tokenUrl: '',
        scopes: [],
      });
    } else if (newType === 'basic') {
      // Set up Basic structure
      updateCustomTarget('auth', {
        type: 'basic',
        username: '',
        password: '',
      });
    } else if (newType === 'bearer') {
      // Set up Bearer structure
      updateCustomTarget('auth', {
        type: 'bearer',
        token: '',
      });
    } else if (newType === 'api_key') {
      // Set up API Key structure
      updateCustomTarget('auth', {
        type: 'api_key',
        value: '',
        placement: 'header',
        keyName: 'X-API-Key',
      });
    } else if (newType === 'file') {
      updateCustomTarget('auth', {
        type: 'file',
        path: '',
      });
    }
  };

  const handleOAuthGrantTypeChange = (newGrantType: 'client_credentials' | 'password') => {
    // biome-ignore lint/suspicious/noExplicitAny: TypeScript cannot narrow discriminated union through function calls
    const currentAuth = selectedTarget.config?.auth as any;
    if (newGrantType === 'password') {
      // Add username and password fields for password grant
      updateCustomTarget('auth', {
        ...currentAuth,
        grantType: 'password',
        username: currentAuth?.username ?? '',
        password: currentAuth?.password ?? '',
      });
    } else {
      // Remove username and password fields for client_credentials grant
      if (currentAuth) {
        const { username: _username, password: _password, ...restAuth } = currentAuth;
        updateCustomTarget('auth', {
          ...restAuth,
          grantType: 'client_credentials',
        });
      } else {
        updateCustomTarget('auth', {
          type: 'oauth',
          grantType: 'client_credentials',
        });
      }
    }
  };

  const updateAuthField = (field: string, value: unknown) => {
    const currentAuth = selectedTarget.config?.auth ?? {};
    updateCustomTarget('auth', {
      ...currentAuth,
      [field]: value,
    });
  };

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="auth-type">Authentication Type</Label>
        <Select
          value={getAuthType() ?? 'no_auth'}
          onValueChange={(value) => {
            handleAuthTypeChange(value === '' || value === 'no_auth' ? undefined : value);
          }}
        >
          <SelectTrigger id="auth-type">
            <SelectValue placeholder="Select authentication type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="no_auth">No Auth</SelectItem>
            <SelectItem value="api_key">API Key</SelectItem>
            <SelectItem value="basic">Basic</SelectItem>
            <SelectItem value="bearer">Bearer</SelectItem>
            <SelectItem value="file">File</SelectItem>
            <SelectItem value="digital_signature">Digital Signature</SelectItem>
            <SelectItem value="oauth">OAuth 2.0</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* OAuth 2.0 Form */}
      {getAuthType() === 'oauth' &&
        (() => {
          const auth = selectedTarget.config?.auth as
            | {
                type: 'oauth';
                grantType?: 'client_credentials' | 'password';
                clientId?: string;
                clientSecret?: string;
                tokenUrl?: string;
                scopes?: string[];
                username?: string;
                password?: string;
              }
            | undefined;
          return (
            <div className="mt-6 space-y-4">
              <p className="font-medium">OAuth 2.0 Configuration</p>

              <div className="space-y-2">
                <Label htmlFor="oauth-grant-type">Grant Type</Label>
                <Select
                  value={auth?.grantType || 'client_credentials'}
                  onValueChange={(value) =>
                    handleOAuthGrantTypeChange(value as 'client_credentials' | 'password')
                  }
                >
                  <SelectTrigger id="oauth-grant-type">
                    <SelectValue placeholder="Select grant type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client_credentials">Client Credentials</SelectItem>
                    <SelectItem value="password">Username & Password</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="token-url">
                  Token URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="token-url"
                  value={auth?.tokenUrl || ''}
                  onChange={(e) => updateAuthField('tokenUrl', e.target.value)}
                  placeholder="https://example.com/oauth/token"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="client-id">
                  Client ID
                  {auth?.grantType !== 'password' && <span className="text-destructive"> *</span>}
                </Label>
                <Input
                  id="client-id"
                  value={auth?.clientId || ''}
                  onChange={(e) => updateAuthField('clientId', e.target.value)}
                />
                {auth?.grantType === 'password' && (
                  <p className="text-sm text-muted-foreground">Optional for password grant</p>
                )}
              </div>

              <SensitiveTextField
                id="client-secret"
                label="Client Secret"
                value={auth?.clientSecret || ''}
                onChange={(event) => updateAuthField('clientSecret', event.target.value)}
                required={auth?.grantType !== 'password'}
                helperText={
                  auth?.grantType === 'password' ? 'Optional for password grant' : undefined
                }
              />

              {/* Show username/password fields only for password grant type */}
              {auth?.grantType === 'password' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="oauth-username">
                      Username <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="oauth-username"
                      value={auth?.username || ''}
                      onChange={(e) => updateAuthField('username', e.target.value)}
                    />
                  </div>

                  <SensitiveTextField
                    id="oauth-password"
                    label="Password"
                    value={auth?.password || ''}
                    onChange={(event) => updateAuthField('password', event.target.value)}
                    required
                  />
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="scopes">Scopes (comma-separated)</Label>
                <Input
                  id="scopes"
                  value={Array.isArray(auth?.scopes) ? auth?.scopes.join(', ') : auth?.scopes || ''}
                  onChange={(e) => {
                    const scopes = e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .filter((s) => s.length > 0);
                    updateAuthField('scopes', scopes);
                  }}
                  placeholder="read, write, admin"
                />
                <p className="text-sm text-muted-foreground">
                  Enter scopes separated by commas (optional)
                </p>
              </div>
            </div>
          );
        })()}

      {/* Basic Auth Form */}
      {getAuthType() === 'basic' &&
        (() => {
          const auth = selectedTarget.config?.auth as
            | { type: 'basic'; username?: string; password?: string }
            | undefined;
          return (
            <div className="mt-6 space-y-4">
              <p className="font-medium">Basic Authentication Configuration</p>

              <div className="space-y-2">
                <Label htmlFor="basic-username">
                  Username <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="basic-username"
                  value={auth?.username || ''}
                  onChange={(e) => updateAuthField('username', e.target.value)}
                />
              </div>

              <SensitiveTextField
                id="basic-password"
                label="Password"
                value={auth?.password || ''}
                onChange={(event) => updateAuthField('password', event.target.value)}
                required
              />
            </div>
          );
        })()}

      {/* Bearer Auth Form */}
      {getAuthType() === 'bearer' &&
        (() => {
          const auth = selectedTarget.config?.auth as
            | { type: 'bearer'; token?: string }
            | undefined;
          return (
            <div className="mt-6 space-y-4">
              <p className="font-medium">Bearer Token Authentication Configuration</p>

              <SensitiveTextField
                id="bearer-token"
                label="Token"
                value={auth?.token || ''}
                onChange={(event) => updateAuthField('token', event.target.value)}
                placeholder="Enter your Bearer token"
                helperText="This token will be sent in the Authorization header as: Bearer {token}"
                required
              />
            </div>
          );
        })()}

      {/* API Key Auth Form */}
      {getAuthType() === 'api_key' &&
        (() => {
          const auth = selectedTarget.config?.auth as
            | { type: 'api_key'; placement?: 'header' | 'query'; keyName?: string; value?: string }
            | undefined;
          return (
            <div className="mt-6 space-y-4">
              <p className="font-medium">API Key Authentication Configuration</p>

              <div className="space-y-2">
                <Label htmlFor="api-key-placement">Placement</Label>
                <Select
                  value={auth?.placement || 'header'}
                  onValueChange={(value) => updateAuthField('placement', value)}
                >
                  <SelectTrigger id="api-key-placement">
                    <SelectValue placeholder="Select placement" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="header">Header</SelectItem>
                    <SelectItem value="query">Query Parameter</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="key-name">
                  Key Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="key-name"
                  value={auth?.keyName || 'X-API-Key'}
                  onChange={(e) => updateAuthField('keyName', e.target.value)}
                  placeholder="X-API-Key"
                />
                <p className="text-sm text-muted-foreground">
                  {auth?.placement === 'header'
                    ? 'Header name where the API key will be placed (e.g., X-API-Key, Authorization)'
                    : 'Query parameter name where the API key will be placed (e.g., api_key, key)'}
                </p>
              </div>

              <SensitiveTextField
                id="api-key-value"
                label="API Key Value"
                value={auth?.value || ''}
                onChange={(event) => updateAuthField('value', event.target.value)}
                placeholder="Enter your API key"
                required
              />
            </div>
          );
        })()}

      {/* File Auth Form */}
      {getAuthType() === 'file' &&
        (() => {
          const auth = selectedTarget.config?.auth as { type: 'file'; path?: string } | undefined;
          return (
            <div className="mt-6 space-y-4">
              <p className="font-medium">File-Based Authentication Configuration</p>

              <div className="space-y-2">
                <Label htmlFor="file-auth-path">
                  Auth File Path <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="file-auth-path"
                  value={auth?.path || ''}
                  onChange={(e) => updateAuthField('path', e.target.value)}
                  placeholder="./auth/get-token.ts"
                />
                <p className="text-sm text-muted-foreground">
                  Load a token from a JavaScript, TypeScript, or Python auth file. See{' '}
                  <a
                    href="https://www.promptfoo.dev/docs/providers/http/#file-based-authentication"
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    docs
                  </a>{' '}
                  for details.
                </p>
              </div>
            </div>
          );
        })()}

      {/* Digital Signature Auth Form */}
      {getAuthType() === 'digital_signature' && (
        <div className="mt-6 space-y-6">
          <p id={signatureHelpId} className="text-sm">
            Pasted or uploaded private keys are included in this provider configuration and may
            appear in copied or downloaded YAML. Use a file path to keep the key contents out of the
            configuration. See{' '}
            <a
              href="https://www.promptfoo.dev/docs/providers/http/#digital-signature-authentication"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              docs
            </a>{' '}
            for more information.
          </p>

          <div className="space-y-2">
            <Label htmlFor="certificate-type">Certificate Type</Label>
            <Select
              value={selectedTarget.config?.signatureAuth?.certificateType || 'pem'}
              onValueChange={(certType) => {
                updateCustomTarget('signatureAuth', {
                  ...selectedTarget.config?.signatureAuth,
                  certificateType: certType,
                  // Clear all type-specific fields when changing certificate type
                  keyInputType: certType === 'pem' ? 'upload' : undefined,
                  privateKey: undefined,
                  privateKeyPath: undefined,
                  keystorePath: undefined,
                  keystorePassword: undefined,
                  keyAlias: undefined,
                  pfxPath: undefined,
                  pfxPassword: undefined,
                  certPath: undefined,
                  keyPath: undefined,
                  pfxMode: undefined,
                  type: certType,
                });
              }}
            >
              <SelectTrigger id="certificate-type">
                <SelectValue placeholder="Select certificate type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pem">PEM</SelectItem>
                <SelectItem value="jks">JKS</SelectItem>
                <SelectItem value="pfx">PFX/PKCS#12</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {selectedTarget.config?.signatureAuth?.certificateType === 'pem' && (
            <div>
              <p className="mb-3 font-medium">PEM Key Input Method</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {[
                  { value: 'upload', icon: Upload, label: 'Upload Key', desc: 'Upload PEM file' },
                  { value: 'path', icon: File, label: 'File Path', desc: 'Specify key location' },
                  {
                    value: 'base64',
                    icon: Key,
                    label: 'Base64 Key String',
                    desc: 'Paste encoded key',
                  },
                ].map(({ value, icon: Icon, label, desc }) => (
                  <div
                    key={value}
                    className={cn(
                      'flex cursor-pointer flex-col items-center rounded-lg border p-4 transition-colors hover:bg-muted/50',
                      selectedTarget.config?.signatureAuth?.keyInputType === value
                        ? 'border-primary bg-primary/5'
                        : 'border-border',
                    )}
                    onClick={() =>
                      updateCustomTarget('signatureAuth', {
                        ...selectedTarget.config?.signatureAuth,
                        keyInputType: value,
                      })
                    }
                  >
                    <Icon
                      className={cn(
                        'mb-2 size-6',
                        selectedTarget.config?.signatureAuth?.keyInputType === value
                          ? 'text-primary'
                          : 'text-muted-foreground',
                      )}
                    />
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-center text-xs text-muted-foreground">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedTarget.config?.signatureAuth?.certificateType === 'pem' &&
            selectedTarget.config?.signatureAuth?.keyInputType === 'upload' && (
              <div className="rounded-lg border border-border p-6 text-center">
                <input
                  type="file"
                  accept=".pem,.key"
                  style={{ display: 'none' }}
                  id="private-key-upload"
                  onClick={(e) => {
                    (e.target as HTMLInputElement).value = '';
                  }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = async (event) => {
                        try {
                          const content = event.target?.result as string;
                          updateCustomTarget('signatureAuth', {
                            ...selectedTarget.config?.signatureAuth,
                            type: 'pem',
                            privateKey: content,
                            privateKeyPath: undefined,
                            keystorePath: undefined,
                            keystorePassword: undefined,
                            keyAlias: undefined,
                            pfxPath: undefined,
                            pfxPassword: undefined,
                          });
                          await validatePrivateKey(content);
                          showToast('Private key validated successfully', 'success');
                        } catch (error) {
                          console.warn(
                            'Key was loaded but could not be successfully validated:',
                            error,
                          );
                          showToast(
                            `Key was loaded but could not be successfully validated: ${(error as Error).message}`,
                            'warning',
                          );
                        }
                      };
                      reader.readAsText(file);
                    }
                  }}
                />
                {selectedTarget.config?.signatureAuth?.privateKey ? (
                  <>
                    <p className="mb-2 text-green-600 dark:text-green-400">
                      Key file loaded successfully
                    </p>
                    <Button
                      variant="outline"
                      onClick={() =>
                        updateCustomTarget('signatureAuth', {
                          ...selectedTarget.config?.signatureAuth,
                          privateKey: undefined,
                          privateKeyPath: undefined,
                        })
                      }
                    >
                      <X className="mr-2 size-4" />
                      Remove Key
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="mb-2 text-muted-foreground">Upload your PEM format private key</p>
                    <label htmlFor="private-key-upload">
                      <Button variant="outline" asChild>
                        <span className="cursor-pointer">
                          <Key className="mr-2 size-4" />
                          Choose File
                        </span>
                      </Button>
                    </label>
                  </>
                )}
              </div>
            )}

          {selectedTarget.config?.signatureAuth?.certificateType === 'pem' &&
            selectedTarget.config?.signatureAuth?.keyInputType === 'path' && (
              <div className="rounded-lg border border-border p-6">
                <div className="space-y-2">
                  <Label htmlFor="private-key-path">Private Key File Path</Label>
                  <Input
                    id="private-key-path"
                    placeholder="/path/to/private_key.pem"
                    value={selectedTarget.config?.signatureAuth?.privateKeyPath || ''}
                    onChange={(e) => {
                      updateCustomTarget('signatureAuth', {
                        ...selectedTarget.config?.signatureAuth,
                        type: 'pem',
                        privateKeyPath: e.target.value,
                        privateKey: undefined,
                        keystorePath: undefined,
                        keystorePassword: undefined,
                        keyAlias: undefined,
                        pfxPath: undefined,
                        pfxPassword: undefined,
                      });
                    }}
                  />
                  <p className="text-sm text-muted-foreground">
                    Specify the path on disk to your PEM format private key file
                  </p>
                </div>
              </div>
            )}

          {selectedTarget.config?.signatureAuth?.certificateType === 'pem' &&
            selectedTarget.config?.signatureAuth?.keyInputType === 'base64' && (
              <div className="space-y-4 rounded-lg border border-border p-6">
                <Label htmlFor={privateKeyId}>Private Key</Label>
                <textarea
                  id={privateKeyId}
                  autoComplete="off"
                  spellCheck={false}
                  data-1p-ignore
                  data-lpignore="true"
                  data-form-type="other"
                  aria-describedby={signatureHelpId}
                  className="h-32 w-full rounded-md border border-border bg-transparent p-3 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="-----BEGIN PRIVATE KEY-----&#10;Base64 encoded key content in PEM format&#10;-----END PRIVATE KEY-----"
                  value={selectedTarget.config?.signatureAuth?.privateKey || ''}
                  onChange={(e) => {
                    updateCustomTarget('signatureAuth', {
                      ...selectedTarget.config?.signatureAuth,
                      type: 'pem',
                      privateKey: e.target.value,
                      privateKeyPath: undefined,
                      keystorePath: undefined,
                      keystorePassword: undefined,
                      keyAlias: undefined,
                      pfxPath: undefined,
                      pfxPassword: undefined,
                    });
                  }}
                />
                <div className="text-center">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        const inputKey = selectedTarget.config?.signatureAuth?.privateKey || '';
                        const formattedKey = await convertStringKeyToPem(inputKey);
                        updateCustomTarget('signatureAuth', {
                          ...selectedTarget.config?.signatureAuth,
                          type: 'pem',
                          privateKey: formattedKey,
                          privateKeyPath: undefined,
                          keystorePath: undefined,
                          keystorePassword: undefined,
                          keyAlias: undefined,
                          pfxPath: undefined,
                          pfxPassword: undefined,
                        });
                        await validatePrivateKey(formattedKey);
                        showToast('Private key validated successfully', 'success');
                      } catch (error) {
                        console.warn(
                          'Key was loaded but could not be successfully validated:',
                          error,
                        );
                        showToast(
                          `Key was loaded but could not be successfully validated: ${(error as Error).message}`,
                          'warning',
                        );
                      }
                    }}
                  >
                    <Check className="mr-2 size-4" />
                    Format & Validate
                  </Button>
                </div>
              </div>
            )}

          {selectedTarget.config?.signatureAuth?.certificateType === 'jks' && (
            <div className="space-y-4 rounded-lg border border-border p-6">
              <p className="text-muted-foreground">
                Configure Java KeyStore (JKS) settings for signature authentication
              </p>

              <div className="space-y-2">
                <Label htmlFor="keystore-path">Keystore Path</Label>
                <Input
                  id="keystore-path"
                  placeholder="/path/to/keystore.jks"
                  value={selectedTarget.config?.signatureAuth?.keystorePath || ''}
                  onChange={(e) => {
                    updateCustomTarget('signatureAuth', {
                      ...selectedTarget.config?.signatureAuth,
                      type: 'jks',
                      keystorePath: e.target.value,
                      privateKey: undefined,
                      privateKeyPath: undefined,
                      pfxPath: undefined,
                      pfxPassword: undefined,
                    });
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  Enter full path to your JKS keystore file
                </p>
              </div>

              <SensitiveTextField
                id="keystore-password"
                label="Keystore Password"
                value={selectedTarget.config?.signatureAuth?.keystorePassword || ''}
                onChange={(event) => {
                  updateCustomTarget('signatureAuth', {
                    ...selectedTarget.config?.signatureAuth,
                    keystorePassword: event.target.value,
                  });
                }}
                placeholder="Enter keystore password"
                helperText="Password for the JKS keystore. Can also be set via PROMPTFOO_JKS_PASSWORD environment variable."
              />

              <div className="space-y-2">
                <Label htmlFor="key-alias">Key Alias</Label>
                <Input
                  id="key-alias"
                  placeholder="client"
                  value={selectedTarget.config?.signatureAuth?.keyAlias || ''}
                  onChange={(e) => {
                    updateCustomTarget('signatureAuth', {
                      ...selectedTarget.config?.signatureAuth,
                      keyAlias: e.target.value,
                    });
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  Alias of the key to use from the keystore. If not specified, the first available
                  key will be used.
                </p>
              </div>
            </div>
          )}

          {selectedTarget.config?.signatureAuth?.certificateType === 'pfx' && (
            <div className="space-y-4 rounded-lg border border-border p-6">
              <p className="text-muted-foreground">
                Configure PFX (PKCS#12) certificate settings for signature authentication
              </p>

              <div>
                <p className="mb-2 font-medium">Certificate Format</p>
                <div className="flex gap-4">
                  {['pfx', 'separate'].map((mode) => (
                    <label key={mode} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="pfxMode"
                        value={mode}
                        checked={(selectedTarget.config?.signatureAuth?.pfxMode || 'pfx') === mode}
                        onChange={(e) => {
                          const newMode = e.target.value;
                          updateCustomTarget('signatureAuth', {
                            ...selectedTarget.config?.signatureAuth,
                            pfxMode: newMode,
                            ...(newMode === 'pfx'
                              ? {
                                  certPath: undefined,
                                  keyPath: undefined,
                                }
                              : {
                                  pfxPath: undefined,
                                  pfxPassword: undefined,
                                }),
                          });
                        }}
                        className="size-4"
                      />
                      <span>{mode === 'pfx' ? 'PFX/P12 File' : 'Separate CRT/KEY Files'}</span>
                    </label>
                  ))}
                </div>
              </div>

              {(!selectedTarget.config?.signatureAuth?.pfxMode ||
                selectedTarget.config?.signatureAuth?.pfxMode === 'pfx') && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="pfx-path">PFX File Path</Label>
                    <Input
                      id="pfx-path"
                      placeholder="/path/to/certificate.pfx"
                      value={selectedTarget.config?.signatureAuth?.pfxPath || ''}
                      onChange={(e) => {
                        updateCustomTarget('signatureAuth', {
                          ...selectedTarget.config?.signatureAuth,
                          type: 'pfx',
                          pfxPath: e.target.value,
                          privateKey: undefined,
                          privateKeyPath: undefined,
                          keystorePath: undefined,
                          keystorePassword: undefined,
                          keyAlias: undefined,
                          certPath: undefined,
                          keyPath: undefined,
                        });
                      }}
                    />
                    <p className="text-sm text-muted-foreground">
                      Enter full path to your PFX/P12 certificate file
                    </p>
                  </div>

                  <SensitiveTextField
                    id="pfx-password"
                    label="PFX Password"
                    value={selectedTarget.config?.signatureAuth?.pfxPassword || ''}
                    onChange={(event) => {
                      updateCustomTarget('signatureAuth', {
                        ...selectedTarget.config?.signatureAuth,
                        pfxPassword: event.target.value,
                      });
                    }}
                    placeholder="Enter PFX password"
                    helperText="Password for the PFX certificate file. Can also be set via PROMPTFOO_PFX_PASSWORD environment variable."
                  />
                </>
              )}

              {selectedTarget.config?.signatureAuth?.pfxMode === 'separate' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="cert-path">Certificate File Path</Label>
                    <Input
                      id="cert-path"
                      placeholder="/path/to/certificate.crt"
                      value={selectedTarget.config?.signatureAuth?.certPath || ''}
                      onChange={(e) => {
                        updateCustomTarget('signatureAuth', {
                          ...selectedTarget.config?.signatureAuth,
                          type: 'pfx',
                          certPath: e.target.value,
                          privateKey: undefined,
                          privateKeyPath: undefined,
                          keystorePath: undefined,
                          keystorePassword: undefined,
                          keyAlias: undefined,
                          pfxPath: undefined,
                          pfxPassword: undefined,
                        });
                      }}
                    />
                    <p className="text-sm text-muted-foreground">
                      Enter full path to your certificate file
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="key-path">Private Key File Path</Label>
                    <Input
                      id="key-path"
                      placeholder="/path/to/private.key"
                      value={selectedTarget.config?.signatureAuth?.keyPath || ''}
                      onChange={(e) => {
                        updateCustomTarget('signatureAuth', {
                          ...selectedTarget.config?.signatureAuth,
                          keyPath: e.target.value,
                        });
                      }}
                    />
                    <p className="text-sm text-muted-foreground">
                      Enter full path to your private key file
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="signature-data-template">Signature Data Template</Label>
            <Input
              id="signature-data-template"
              value={
                selectedTarget.config?.signatureAuth?.signatureDataTemplate ||
                '{{signatureTimestamp}}'
              }
              onChange={(e) =>
                updateCustomTarget('signatureAuth', {
                  ...selectedTarget.config?.signatureAuth,
                  signatureDataTemplate: e.target.value,
                })
              }
              placeholder="Template for generating signature data"
            />
            <p className="text-sm text-muted-foreground">
              Supported variables: {'{{signatureTimestamp}}'}. Use \n for newlines
            </p>
          </div>

          <NumberInput
            fullWidth
            label="Signature Validity (ms)"
            value={selectedTarget.config?.signatureAuth?.signatureValidityMs}
            onChange={(v) =>
              updateCustomTarget('signatureAuth', {
                ...selectedTarget.config?.signatureAuth,
                signatureValidityMs: v,
              })
            }
            onBlur={() => {
              if (
                selectedTarget.config?.signatureAuth?.signatureValidityMs === undefined ||
                selectedTarget.config?.signatureAuth?.signatureValidityMs === ''
              ) {
                updateCustomTarget('signatureAuth', {
                  ...selectedTarget.config?.signatureAuth,
                  signatureValidityMs: 300000,
                });
              }
            }}
            placeholder="How long the signature remains valid"
          />

          <NumberInput
            fullWidth
            label="Signature Refresh Buffer (ms)"
            value={selectedTarget.config?.signatureAuth?.signatureRefreshBufferMs}
            onChange={(v) =>
              updateCustomTarget('signatureAuth', {
                ...selectedTarget.config?.signatureAuth,
                signatureRefreshBufferMs: v,
              })
            }
            placeholder="Buffer time before signature expiry to refresh - defaults to 10% of signature validity"
          />

          <div className="space-y-2">
            <Label htmlFor="signature-algorithm">Signature Algorithm</Label>
            <Input
              id="signature-algorithm"
              value={selectedTarget.config?.signatureAuth?.signatureAlgorithm || 'SHA256'}
              onChange={(e) =>
                updateCustomTarget('signatureAuth', {
                  ...selectedTarget.config?.signatureAuth,
                  signatureAlgorithm: e.target.value,
                })
              }
              placeholder="Signature algorithm (default: SHA256)"
            />
          </div>
        </div>
      )}
    </>
  );
};

export default AuthorizationTab;
