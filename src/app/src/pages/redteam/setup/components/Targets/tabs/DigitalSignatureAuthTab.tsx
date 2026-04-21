import React from 'react';

import { Button } from '@app/components/ui/button';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@app/components/ui/select';
import { Switch } from '@app/components/ui/switch';
import { Textarea } from '@app/components/ui/textarea';
import { useToast } from '@app/hooks/useToast';
import { cn } from '@app/lib/utils';
import { Check, File, Key, KeyRound, Upload, X } from 'lucide-react';
import { convertStringKeyToPem, validatePrivateKey } from '../../../utils/crypto';

import type { HttpProviderOptions } from '../../../types';

interface DigitalSignatureAuthTabProps {
  selectedTarget: HttpProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
}

const DigitalSignatureAuthTab: React.FC<DigitalSignatureAuthTabProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  const { showToast } = useToast();

  return (
    <>
      <p className="mb-6">
        Configure signature-based authentication for secure API calls. Your private key is never
        sent to Promptfoo and will always be stored locally on your system. See{' '}
        <a
          href="https://www.promptfoo.dev/docs/providers/http/#digital-signature-authentication"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          docs
        </a>{' '}
        for more information.
      </p>

      <div className="flex items-center gap-2">
        <Switch
          id="signature-auth-enabled"
          checked={!!selectedTarget.config?.signatureAuth?.enabled}
          onCheckedChange={(checked) => {
            if (checked) {
              updateCustomTarget('signatureAuth', {
                enabled: true,
                certificateType: selectedTarget.config?.signatureAuth?.certificateType || 'pem',
                keyInputType: selectedTarget.config?.signatureAuth?.keyInputType || 'upload',
              });
            } else {
              updateCustomTarget('signatureAuth', undefined);
            }
          }}
        />
        <Label htmlFor="signature-auth-enabled">Enable signature authentication</Label>
      </div>

      {selectedTarget.config?.signatureAuth?.enabled && (
        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <Label>Certificate Type</Label>
            <Select
              value={selectedTarget.config?.signatureAuth?.certificateType || 'pem'}
              onValueChange={(value) => {
                const certType = value;
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
              <SelectTrigger>
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
            <div className="space-y-4">
              <Label>PEM Key Input Method</Label>
              <div className="grid grid-cols-3 gap-3">
                <div
                  className={cn(
                    'flex flex-col items-center rounded-lg border p-4 cursor-pointer transition-colors',
                    selectedTarget.config?.signatureAuth?.keyInputType === 'upload'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50',
                  )}
                  onClick={() =>
                    updateCustomTarget('signatureAuth', {
                      ...selectedTarget.config?.signatureAuth,
                      keyInputType: 'upload',
                    })
                  }
                >
                  <Upload
                    className={cn(
                      'size-6 mb-2',
                      selectedTarget.config?.signatureAuth?.keyInputType === 'upload'
                        ? 'text-primary'
                        : 'text-muted-foreground',
                    )}
                  />
                  <span className="font-medium">Upload Key</span>
                  <span className="text-sm text-muted-foreground text-center">Upload PEM file</span>
                </div>

                <div
                  className={cn(
                    'flex flex-col items-center rounded-lg border p-4 cursor-pointer transition-colors',
                    selectedTarget.config?.signatureAuth?.keyInputType === 'path'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50',
                  )}
                  onClick={() =>
                    updateCustomTarget('signatureAuth', {
                      ...selectedTarget.config?.signatureAuth,
                      keyInputType: 'path',
                    })
                  }
                >
                  <File
                    className={cn(
                      'size-6 mb-2',
                      selectedTarget.config?.signatureAuth?.keyInputType === 'path'
                        ? 'text-primary'
                        : 'text-muted-foreground',
                    )}
                  />
                  <span className="font-medium">File Path</span>
                  <span className="text-sm text-muted-foreground text-center">
                    Specify key location
                  </span>
                </div>

                <div
                  className={cn(
                    'flex flex-col items-center rounded-lg border p-4 cursor-pointer transition-colors',
                    selectedTarget.config?.signatureAuth?.keyInputType === 'base64'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-muted/50',
                  )}
                  onClick={() =>
                    updateCustomTarget('signatureAuth', {
                      ...selectedTarget.config?.signatureAuth,
                      keyInputType: 'base64',
                    })
                  }
                >
                  <Key
                    className={cn(
                      'size-6 mb-2',
                      selectedTarget.config?.signatureAuth?.keyInputType === 'base64'
                        ? 'text-primary'
                        : 'text-muted-foreground',
                    )}
                  />
                  <span className="font-medium">Base64 Key String</span>
                  <span className="text-sm text-muted-foreground text-center">
                    Paste encoded key
                  </span>
                </div>
              </div>
            </div>
          )}

          {selectedTarget.config?.signatureAuth?.certificateType === 'pem' &&
            selectedTarget.config?.signatureAuth?.keyInputType === 'upload' && (
              <div className="rounded-lg border border-border p-6">
                <input
                  type="file"
                  accept=".pem,.key"
                  className="hidden"
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
                <div className="text-center">
                  {selectedTarget.config?.signatureAuth?.privateKey ? (
                    <>
                      <p className="text-emerald-600 dark:text-emerald-400 mb-4">
                        Key file loaded successfully
                      </p>
                      <Button
                        variant="outline"
                        className="text-destructive"
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
                      <p className="text-muted-foreground mb-4">
                        Upload your PEM format private key
                      </p>
                      <label htmlFor="private-key-upload">
                        <Button variant="outline" asChild>
                          <span>
                            <KeyRound className="mr-2 size-4" />
                            Choose File
                          </span>
                        </Button>
                      </label>
                    </>
                  )}
                </div>
              </div>
            )}

          {selectedTarget.config?.signatureAuth?.certificateType === 'pem' &&
            selectedTarget.config?.signatureAuth?.keyInputType === 'path' && (
              <div className="rounded-lg border border-border p-6 space-y-4">
                <p className="text-muted-foreground">
                  Specify the path on disk to your PEM format private key file
                </p>
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
                </div>
              </div>
            )}

          {selectedTarget.config?.signatureAuth?.certificateType === 'pem' &&
            selectedTarget.config?.signatureAuth?.keyInputType === 'base64' && (
              <div className="rounded-lg border border-border p-6 space-y-4">
                <Textarea
                  rows={4}
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
            <div className="rounded-lg border border-border p-6 space-y-4">
              <p className="text-muted-foreground">
                Configure Java KeyStore (JKS) settings for signature authentication
              </p>

              <div className="space-y-2">
                <Label htmlFor="keystore-path">Keystore File</Label>
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

              <div className="space-y-2">
                <Label htmlFor="keystore-password">Keystore Password</Label>
                <Input
                  id="keystore-password"
                  type="password"
                  placeholder="Enter keystore password"
                  value={selectedTarget.config?.signatureAuth?.keystorePassword || ''}
                  onChange={(e) => {
                    updateCustomTarget('signatureAuth', {
                      ...selectedTarget.config?.signatureAuth,
                      keystorePassword: e.target.value,
                    });
                  }}
                />
                <p className="text-sm text-muted-foreground">
                  Password for the JKS keystore. Can also be set via PROMPTFOO_JKS_PASSWORD
                  environment variable.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="jks-key-alias">Key Alias</Label>
                <Input
                  id="jks-key-alias"
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
            <div className="rounded-lg border border-border p-6 space-y-4">
              <p className="text-muted-foreground">
                Configure PFX (PKCS#12) certificate settings for signature authentication
              </p>

              <div className="space-y-2">
                <Label>Certificate Format</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pfxMode"
                      value="pfx"
                      checked={
                        !selectedTarget.config?.signatureAuth?.pfxMode ||
                        selectedTarget.config?.signatureAuth?.pfxMode === 'pfx'
                      }
                      onChange={() => {
                        updateCustomTarget('signatureAuth', {
                          ...selectedTarget.config?.signatureAuth,
                          pfxMode: 'pfx',
                          certPath: undefined,
                          keyPath: undefined,
                        });
                      }}
                      className="size-4 text-primary"
                    />
                    <span>PFX/P12 File</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="pfxMode"
                      value="separate"
                      checked={selectedTarget.config?.signatureAuth?.pfxMode === 'separate'}
                      onChange={() => {
                        updateCustomTarget('signatureAuth', {
                          ...selectedTarget.config?.signatureAuth,
                          pfxMode: 'separate',
                          pfxPath: undefined,
                          pfxPassword: undefined,
                        });
                      }}
                      className="size-4 text-primary"
                    />
                    <span>Separate CRT/KEY Files</span>
                  </label>
                </div>
              </div>

              {(!selectedTarget.config?.signatureAuth?.pfxMode ||
                selectedTarget.config?.signatureAuth?.pfxMode === 'pfx') && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="pfx-path">PFX/P12 Certificate File</Label>
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

                  <div className="space-y-2">
                    <Label htmlFor="pfx-password">PFX Password</Label>
                    <Input
                      id="pfx-password"
                      type="password"
                      placeholder="Enter PFX password"
                      value={selectedTarget.config?.signatureAuth?.pfxPassword || ''}
                      onChange={(e) => {
                        updateCustomTarget('signatureAuth', {
                          ...selectedTarget.config?.signatureAuth,
                          pfxPassword: e.target.value,
                        });
                      }}
                    />
                    <p className="text-sm text-muted-foreground">
                      Password for the PFX certificate file. Can also be set via
                      PROMPTFOO_PFX_PASSWORD environment variable.
                    </p>
                  </div>
                </>
              )}

              {selectedTarget.config?.signatureAuth?.pfxMode === 'separate' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="cert-path">Certificate File (CRT)</Label>
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
                    <Label htmlFor="key-path">Private Key File (KEY)</Label>
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

          <div className="space-y-2">
            <Label htmlFor="signature-validity">Signature Validity (ms)</Label>
            <Input
              id="signature-validity"
              type="number"
              value={selectedTarget.config?.signatureAuth?.signatureValidityMs || ''}
              onChange={(e) => {
                const value = e.target.value === '' ? undefined : Number(e.target.value);
                updateCustomTarget('signatureAuth', {
                  ...selectedTarget.config?.signatureAuth,
                  signatureValidityMs: value,
                });
              }}
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="signature-refresh-buffer">Signature Refresh Buffer (ms)</Label>
            <Input
              id="signature-refresh-buffer"
              type="number"
              value={selectedTarget.config?.signatureAuth?.signatureRefreshBufferMs || ''}
              onChange={(e) => {
                const value = e.target.value === '' ? undefined : Number(e.target.value);
                updateCustomTarget('signatureAuth', {
                  ...selectedTarget.config?.signatureAuth,
                  signatureRefreshBufferMs: value,
                });
              }}
              placeholder="Buffer time before signature expiry to refresh - defaults to 10% of signature validity"
            />
          </div>

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

export default DigitalSignatureAuthTab;
