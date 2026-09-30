import React, { useEffect, useRef, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
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
import { Textarea } from '@app/components/ui/textarea';
import { useToast } from '@app/hooks/useToast';
import {
  AlertTriangle,
  Check,
  File,
  Info,
  Key,
  KeyRound,
  Lock,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { validatePrivateKey } from '../../../utils/crypto';
import { SetupSection } from '../../SetupSection';
import SensitiveTextField from './SensitiveTextField';

import type { HttpProviderOptions } from '../../../types';

interface TlsHttpsConfigTabProps {
  selectedTarget: HttpProviderOptions;
  updateCustomTarget: (field: string, value: unknown) => void;
}

type TlsConfig = NonNullable<NonNullable<HttpProviderOptions['config']>['tls']>;

function PemInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string | string[] | undefined;
  placeholder: string;
  onChange: (value: string | string[]) => void;
}) {
  const entries = Array.isArray(value) ? (value.length ? value : ['']) : [value ?? ''];
  return (
    <div className="space-y-2">
      {entries.map((entry, index) => (
        <Textarea
          // Entries retain their position while their contents are edited.
          key={index}
          rows={4}
          aria-label={Array.isArray(value) ? `${label} ${index + 1}` : label}
          placeholder={placeholder}
          value={entry}
          onChange={(event) =>
            onChange(
              Array.isArray(value)
                ? entries.map((previous, i) => (i === index ? event.target.value : previous))
                : event.target.value,
            )
          }
        />
      ))}
    </div>
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function setCertificateType(tls: TlsConfig | undefined, value: string): TlsConfig {
  // `none` is a UI-only sentinel; clear credentials when their type is deselected.
  const certificateType =
    value === 'none' ? undefined : (value as NonNullable<TlsConfig['certificateType']>);
  const isPem = certificateType === 'pem';
  const isJks = certificateType === 'jks';
  const isPfx = certificateType === 'pfx';

  return {
    ...tls,
    certificateType,
    cert: isPem ? tls?.cert : undefined,
    certPath: isPem ? tls?.certPath : undefined,
    key: isPem ? tls?.key : undefined,
    keyPath: isPem ? tls?.keyPath : undefined,
    pfx: isPfx ? tls?.pfx : undefined,
    pfxPath: isPfx ? tls?.pfxPath : undefined,
    passphrase: isPem || isJks || isPfx ? tls?.passphrase : undefined,
    jksPath: isJks ? tls?.jksPath : undefined,
    jksContent: isJks ? tls?.jksContent : undefined,
    jksFileName: isJks ? tls?.jksFileName : undefined,
    jksExtractConfigured: isJks ? tls?.jksExtractConfigured : undefined,
    keyAlias: isJks ? tls?.keyAlias : undefined,
  };
}

const TlsHttpsConfigTab: React.FC<TlsHttpsConfigTabProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  const { showToast } = useToast();
  const tls = selectedTarget.config?.tls;
  const rawCertificateType = tls?.certificateType as
    | TlsConfig['certificateType']
    | 'none'
    | undefined;
  const certificateType =
    rawCertificateType === 'none'
      ? undefined
      : rawCertificateType === 'pkcs12'
        ? 'pfx'
        : (rawCertificateType ??
          (tls?.jksPath || tls?.jksContent || tls?.keyAlias
            ? 'jks'
            : tls?.pfx || tls?.pfxPath
              ? 'pfx'
              : tls?.cert || tls?.certPath || tls?.key || tls?.keyPath
                ? 'pem'
                : undefined));
  const caInputType = tls?.caInputType ?? (tls?.ca ? 'inline' : tls?.caPath ? 'path' : undefined);
  const certInputType =
    tls?.certInputType ?? (tls?.cert ? 'inline' : tls?.certPath ? 'path' : undefined);
  const keyInputType =
    tls?.keyInputType ?? (tls?.key ? 'inline' : tls?.keyPath ? 'path' : undefined);
  const jksInputType =
    tls?.jksInputType ?? (tls?.jksContent ? 'upload' : tls?.jksPath ? 'path' : undefined);
  const pfxInputType =
    tls?.pfxInputType ?? (tls?.pfx ? 'base64' : tls?.pfxPath ? 'path' : undefined);

  useEffect(() => {
    // Keep inferred selections when an imported certificate value is cleared for editing.
    const defaults: Partial<TlsConfig> = {
      ...(certificateType && { certificateType }),
      ...(caInputType && { caInputType }),
      ...(certInputType && { certInputType }),
      ...(keyInputType && { keyInputType }),
      ...(jksInputType && { jksInputType }),
      ...(pfxInputType && { pfxInputType }),
    };
    if (
      (Object.keys(defaults) as (keyof TlsConfig)[]).some((key) => tls?.[key] !== defaults[key])
    ) {
      updateCustomTarget('tls', { ...tls, ...defaults });
    }
  }, [
    tls,
    certificateType,
    caInputType,
    certInputType,
    keyInputType,
    jksInputType,
    pfxInputType,
    updateCustomTarget,
  ]);

  const hasCA = !!(tls?.ca || tls?.caPath);
  const hasClientCert = !!certificateType;
  const hasAdvanced = !!(
    tls?.servername ||
    tls?.ciphers ||
    tls?.minVersion ||
    tls?.maxVersion ||
    tls?.secureProtocol
  );

  const targetKey = selectedTarget.id ?? selectedTarget.label ?? '';
  const prevTargetKey = useRef(targetKey);

  const [caOpen, setCaOpen] = useState(hasCA);
  const [clientCertOpen, setClientCertOpen] = useState(hasClientCert);
  const [advancedOpen, setAdvancedOpen] = useState(hasAdvanced);

  useEffect(() => {
    if (prevTargetKey.current !== targetKey) {
      prevTargetKey.current = targetKey;
      setCaOpen(hasCA);
      setClientCertOpen(hasClientCert);
      setAdvancedOpen(hasAdvanced);
      return;
    }

    if (hasCA) {
      setCaOpen(true);
    }
    if (hasClientCert) {
      setClientCertOpen(true);
    }
    if (hasAdvanced) {
      setAdvancedOpen(true);
    }
  }, [targetKey, hasCA, hasClientCert, hasAdvanced]);

  return (
    <>
      <p className="mb-6">
        Set a custom CA certificate or a client certificate for mutual TLS. PEM, JKS and PFX formats
        are supported. See{' '}
        <a
          href="https://www.promptfoo.dev/docs/providers/http/#tlshttps-configuration"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          docs
        </a>{' '}
        for more information.
      </p>

      <div className="space-y-3">
        <Label htmlFor="reject-unauthorized">Server certificate verification</Label>
        <Select
          value={tls?.rejectUnauthorized === undefined ? 'default' : String(tls.rejectUnauthorized)}
          onValueChange={(value) =>
            updateCustomTarget('tls', {
              ...tls,
              rejectUnauthorized: value === 'default' ? undefined : value === 'true',
            })
          }
        >
          <SelectTrigger id="reject-unauthorized" className="w-full max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Use default</SelectItem>
            <SelectItem value="true">Verify certificate</SelectItem>
            <SelectItem value="false">Skip verification</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">
          Custom TLS credentials enable verification by default. Without custom TLS settings, the
          server's transport settings apply. For a private CA, verify certificates and add its CA
          below.
        </p>
        {tls?.rejectUnauthorized === false && (
          <Alert variant="warning">
            <AlertTriangle className="size-4" />
            <AlertContent>
              <AlertDescription>
                Certificate verification is disabled. This should only be used for development or
                testing with self-signed certificates.
              </AlertDescription>
            </AlertContent>
          </Alert>
        )}
      </div>

      <div className="mt-6 space-y-4">
        <SetupSection
          title="Custom CA Certificate"
          description="Provide a custom CA certificate to verify the server's certificate"
          isExpanded={caOpen}
          onExpandedChange={setCaOpen}
        >
          <div className="mt-2 rounded-lg border border-border p-4 space-y-4">
            <div className="flex gap-2">
              <Button
                variant={caInputType === 'upload' ? 'default' : 'outline'}
                onClick={() =>
                  updateCustomTarget('tls', {
                    ...tls,
                    caInputType: 'upload',
                  })
                }
              >
                <ShieldCheck className="mr-2 size-4" />
                Upload
              </Button>
              <Button
                variant={caInputType === 'path' ? 'default' : 'outline'}
                onClick={() =>
                  updateCustomTarget('tls', {
                    ...tls,
                    caInputType: 'path',
                  })
                }
              >
                <File className="mr-2 size-4" />
                File Path
              </Button>
              <Button
                variant={caInputType === 'inline' ? 'default' : 'outline'}
                onClick={() =>
                  updateCustomTarget('tls', {
                    ...tls,
                    caInputType: 'inline',
                  })
                }
              >
                <Lock className="mr-2 size-4" />
                Paste Inline
              </Button>
            </div>

            {caInputType === 'upload' && (
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept=".pem,.crt,.cer"
                  className="hidden"
                  id="tls-ca-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (event) => {
                        const content = event.target?.result as string;
                        updateCustomTarget('tls', {
                          ...tls,
                          ca: content,
                          caPath: undefined,
                        });
                        showToast('CA certificate uploaded successfully', 'success');
                      };
                      reader.readAsText(file);
                    }
                  }}
                />
                <label htmlFor="tls-ca-upload">
                  <Button variant="outline" asChild>
                    <span>{tls?.ca ? 'Replace CA Certificate' : 'Choose CA File'}</span>
                  </Button>
                </label>
                {tls?.ca && (
                  <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="size-4" /> CA certificate loaded
                  </span>
                )}
              </div>
            )}

            {caInputType === 'path' && (
              <Input
                placeholder="/path/to/ca-cert.pem"
                value={tls?.caPath || ''}
                onChange={(e) =>
                  updateCustomTarget('tls', {
                    ...tls,
                    caPath: e.target.value,
                    ca: undefined,
                  })
                }
              />
            )}

            {caInputType === 'inline' && (
              <PemInput
                label="CA certificate"
                placeholder="-----BEGIN CERTIFICATE-----&#10;...CA certificate content...&#10;-----END CERTIFICATE-----"
                value={tls?.ca}
                onChange={(value) =>
                  updateCustomTarget('tls', {
                    ...tls,
                    ca: value,
                    caPath: undefined,
                  })
                }
              />
            )}
          </div>
        </SetupSection>

        <SetupSection
          title="Client Certificate — mTLS"
          description="Configure client certificates for mutual TLS authentication"
          isExpanded={clientCertOpen}
          onExpandedChange={setClientCertOpen}
        >
          <div className="mt-2 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tls-certificate-type">Certificate Type</Label>
              <Select
                value={certificateType || 'none'}
                onValueChange={(value) => updateCustomTarget('tls', setCertificateType(tls, value))}
              >
                <SelectTrigger id="tls-certificate-type">
                  <SelectValue placeholder="Select certificate type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Client Certificate</SelectItem>
                  <SelectItem value="pem">PEM (Separate cert/key files)</SelectItem>
                  <SelectItem value="jks">JKS (Java KeyStore)</SelectItem>
                  <SelectItem value="pfx">PFX/PKCS#12 Bundle</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Select "No Client Certificate" for server-only verification, or choose a certificate
                type for mutual TLS
              </p>
            </div>
            {certificateType === 'pem' && (
              <div className="space-y-4">
                <h3 className="font-medium">PEM Certificate Configuration</h3>
                <div className="rounded-lg border border-border p-4 space-y-4">
                  <h4 className="font-medium">Client Certificate</h4>
                  <div className="flex gap-2">
                    <Button
                      variant={certInputType === 'upload' ? 'default' : 'outline'}
                      onClick={() =>
                        updateCustomTarget('tls', {
                          ...tls,
                          certInputType: 'upload',
                        })
                      }
                    >
                      <Upload className="mr-2 size-4" />
                      Upload
                    </Button>
                    <Button
                      variant={certInputType === 'path' ? 'default' : 'outline'}
                      onClick={() =>
                        updateCustomTarget('tls', {
                          ...tls,
                          certInputType: 'path',
                        })
                      }
                    >
                      <File className="mr-2 size-4" />
                      File Path
                    </Button>
                    <Button
                      variant={certInputType === 'inline' ? 'default' : 'outline'}
                      onClick={() =>
                        updateCustomTarget('tls', {
                          ...tls,
                          certInputType: 'inline',
                        })
                      }
                    >
                      <Key className="mr-2 size-4" />
                      Paste Inline
                    </Button>
                  </div>

                  {certInputType === 'upload' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".pem,.crt,.cer"
                        className="hidden"
                        id="tls-cert-upload"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const content = event.target?.result as string;
                              updateCustomTarget('tls', {
                                ...tls,
                                cert: content,
                                certPath: undefined,
                              });
                              showToast('Certificate uploaded successfully', 'success');
                            };
                            reader.readAsText(file);
                          }
                        }}
                      />
                      <label htmlFor="tls-cert-upload">
                        <Button variant="outline" asChild>
                          <span>
                            {tls?.cert ? 'Replace Certificate' : 'Choose Certificate File'}
                          </span>
                        </Button>
                      </label>
                      {tls?.cert && (
                        <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Check className="size-4" /> Certificate loaded
                        </span>
                      )}
                    </div>
                  )}

                  {certInputType === 'path' && (
                    <Input
                      placeholder="/path/to/client-cert.pem"
                      value={tls?.certPath || ''}
                      onChange={(e) =>
                        updateCustomTarget('tls', {
                          ...tls,
                          certPath: e.target.value,
                          cert: undefined,
                        })
                      }
                    />
                  )}

                  {certInputType === 'inline' && (
                    <PemInput
                      label="Client certificate"
                      placeholder="-----BEGIN CERTIFICATE-----&#10;...certificate content...&#10;-----END CERTIFICATE-----"
                      value={tls?.cert}
                      onChange={(value) =>
                        updateCustomTarget('tls', {
                          ...tls,
                          cert: value,
                          certPath: undefined,
                        })
                      }
                    />
                  )}
                </div>
                <div className="rounded-lg border border-border p-4 space-y-4">
                  <h4 className="font-medium">Private Key</h4>
                  <div className="flex gap-2">
                    <Button
                      variant={keyInputType === 'upload' ? 'default' : 'outline'}
                      onClick={() =>
                        updateCustomTarget('tls', {
                          ...tls,
                          keyInputType: 'upload',
                        })
                      }
                    >
                      <Upload className="mr-2 size-4" />
                      Upload
                    </Button>
                    <Button
                      variant={keyInputType === 'path' ? 'default' : 'outline'}
                      onClick={() =>
                        updateCustomTarget('tls', {
                          ...tls,
                          keyInputType: 'path',
                        })
                      }
                    >
                      <File className="mr-2 size-4" />
                      File Path
                    </Button>
                    <Button
                      variant={keyInputType === 'inline' ? 'default' : 'outline'}
                      onClick={() =>
                        updateCustomTarget('tls', {
                          ...tls,
                          keyInputType: 'inline',
                        })
                      }
                    >
                      <KeyRound className="mr-2 size-4" />
                      Paste Inline
                    </Button>
                  </div>

                  {keyInputType === 'upload' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".pem,.key"
                        className="hidden"
                        id="tls-key-upload"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = async (event) => {
                              const content = event.target?.result as string;
                              updateCustomTarget('tls', {
                                ...tls,
                                key: content,
                                keyPath: undefined,
                              });
                              try {
                                await validatePrivateKey(content);
                                showToast('Private key validated successfully', 'success');
                              } catch (error) {
                                showToast(
                                  `Key loaded but validation failed: ${(error as Error).message}`,
                                  'warning',
                                );
                              }
                            };
                            reader.readAsText(file);
                          }
                        }}
                      />
                      <label htmlFor="tls-key-upload">
                        <Button variant="outline" asChild>
                          <span>{tls?.key ? 'Replace Key' : 'Choose Key File'}</span>
                        </Button>
                      </label>
                      {tls?.key && (
                        <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Check className="size-4" /> Key loaded
                        </span>
                      )}
                    </div>
                  )}

                  {keyInputType === 'path' && (
                    <Input
                      placeholder="/path/to/client-key.pem"
                      value={tls?.keyPath || ''}
                      onChange={(e) =>
                        updateCustomTarget('tls', {
                          ...tls,
                          keyPath: e.target.value,
                          key: undefined,
                        })
                      }
                    />
                  )}

                  {keyInputType === 'inline' && (
                    <PemInput
                      label="Private key"
                      placeholder="-----BEGIN PRIVATE KEY-----&#10;...key content...&#10;-----END PRIVATE KEY-----"
                      value={tls?.key}
                      onChange={(value) =>
                        updateCustomTarget('tls', {
                          ...tls,
                          key: value,
                          keyPath: undefined,
                        })
                      }
                    />
                  )}
                </div>
                <div className="rounded-lg border border-border p-4 space-y-4">
                  <h4 className="font-medium">Private Key Password (Optional)</h4>
                  <SensitiveTextField
                    label="Password"
                    placeholder="Enter password for encrypted private key"
                    value={tls?.passphrase || ''}
                    onChange={(e) =>
                      updateCustomTarget('tls', {
                        ...tls,
                        passphrase: e.target.value,
                      })
                    }
                    helperText="Required only if your private key file is encrypted (e.g., starts with 'BEGIN ENCRYPTED PRIVATE KEY')"
                  />
                </div>
              </div>
            )}
            {certificateType === 'jks' && (
              <div className="space-y-4">
                <h3 className="font-medium">JKS (Java KeyStore) Certificate</h3>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <Alert variant="info">
                    <Info className="size-4" />
                    <AlertContent>
                      <AlertDescription>
                        Provide a JKS file by uploading it or entering a server-side path. The
                        jks-js library converts it to the certificate and private key required for
                        TLS configuration.
                      </AlertDescription>
                    </AlertContent>
                  </Alert>

                  <div className="space-y-2">
                    <h4 className="font-medium">JKS File Input</h4>
                    <div className="flex gap-2">
                      <Button
                        variant={jksInputType === 'upload' ? 'default' : 'outline'}
                        onClick={() =>
                          updateCustomTarget('tls', {
                            ...tls,
                            jksInputType: 'upload',
                          })
                        }
                      >
                        <Upload className="mr-2 size-4" />
                        Upload JKS
                      </Button>
                      <Button
                        variant={jksInputType === 'path' ? 'default' : 'outline'}
                        onClick={() =>
                          updateCustomTarget('tls', {
                            ...tls,
                            jksInputType: 'path',
                          })
                        }
                      >
                        <File className="mr-2 size-4" />
                        File Path
                      </Button>
                    </div>

                    {jksInputType === 'upload' && (
                      <div className="space-y-2">
                        <input
                          type="file"
                          accept=".jks,.keystore"
                          className="hidden"
                          id="tls-jks-upload"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = async (event) => {
                                try {
                                  const arrayBuffer = event.target?.result as ArrayBuffer;
                                  const base64 = arrayBufferToBase64(arrayBuffer);

                                  updateCustomTarget('tls', {
                                    ...tls,
                                    jksContent: base64,
                                    jksPath: undefined,
                                    jksFileName: file.name,
                                  });

                                  showToast(
                                    'JKS file uploaded successfully. Enter password to extract certificates.',
                                    'success',
                                  );
                                } catch (error) {
                                  showToast(
                                    `Failed to load JKS file: ${(error as Error).message}`,
                                    'error',
                                  );
                                }
                              };
                              reader.readAsArrayBuffer(file);
                            }
                          }}
                        />
                        <label htmlFor="tls-jks-upload">
                          <Button variant="outline" asChild>
                            <span>
                              {tls?.jksContent
                                ? `Replace JKS (${tls?.jksFileName || 'loaded'})`
                                : 'Choose JKS File'}
                            </span>
                          </Button>
                        </label>
                        {tls?.jksContent && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <Check className="size-4" /> JKS file loaded:{' '}
                              {tls?.jksFileName || 'keystore.jks'}
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() =>
                                updateCustomTarget('tls', {
                                  ...tls,
                                  jksContent: undefined,
                                  jksFileName: undefined,
                                  cert: undefined,
                                  key: undefined,
                                })
                              }
                            >
                              Clear
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {jksInputType === 'path' && (
                      <div className="space-y-2">
                        <Input
                          placeholder="/path/to/keystore.jks"
                          value={tls?.jksPath || ''}
                          onChange={(e) =>
                            updateCustomTarget('tls', {
                              ...tls,
                              jksPath: e.target.value,
                              jksContent: undefined,
                            })
                          }
                        />
                        <p className="text-sm text-muted-foreground">
                          Path to JKS keystore file on the server
                        </p>
                      </div>
                    )}
                  </div>

                  <SensitiveTextField
                    label="Keystore Password"
                    placeholder="Enter keystore password"
                    value={tls?.passphrase || ''}
                    onChange={(e) =>
                      updateCustomTarget('tls', {
                        ...tls,
                        passphrase: e.target.value,
                      })
                    }
                    required
                    helperText="Password for the JKS keystore (required to extract certificates)"
                  />

                  <div className="space-y-2">
                    <Label htmlFor="jks-key-alias">Key Alias (Optional)</Label>
                    <Input
                      id="jks-key-alias"
                      placeholder="mykey"
                      value={tls?.keyAlias || ''}
                      onChange={(e) =>
                        updateCustomTarget('tls', {
                          ...tls,
                          keyAlias: e.target.value,
                        })
                      }
                    />
                    <p className="text-sm text-muted-foreground">
                      Alias of the key to extract. If not specified, the first available key will be
                      used.
                    </p>
                  </div>

                  {tls?.jksContent && tls?.passphrase && (
                    <div className="space-y-2">
                      <Button
                        onClick={() => {
                          showToast(
                            'JKS extraction will be performed on the backend. The certificate and key will be automatically converted to PEM format for TLS use.',
                            'info',
                          );

                          updateCustomTarget('tls', {
                            ...tls,
                            jksExtractConfigured: true,
                          });
                        }}
                      >
                        <KeyRound className="mr-2 size-4" />
                        Configure JKS Extraction
                      </Button>

                      {tls?.jksExtractConfigured && (
                        <Alert variant="success">
                          <Check className="size-4" />
                          <AlertContent>
                            <AlertDescription>
                              JKS extraction configured. The certificate and private key will be
                              extracted from the JKS file on the backend using the provided password
                              and key alias.
                            </AlertDescription>
                          </AlertContent>
                        </Alert>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
            {certificateType === 'pfx' && (
              <div className="space-y-4">
                <h3 className="font-medium">PFX/PKCS#12 Certificate Bundle</h3>

                <div className="rounded-lg border border-border p-4 space-y-4">
                  <div className="flex gap-2">
                    <Button
                      variant={pfxInputType === 'upload' ? 'default' : 'outline'}
                      onClick={() =>
                        updateCustomTarget('tls', {
                          ...tls,
                          pfxInputType: 'upload',
                        })
                      }
                    >
                      <Upload className="mr-2 size-4" />
                      Upload
                    </Button>
                    <Button
                      variant={pfxInputType === 'path' ? 'default' : 'outline'}
                      onClick={() =>
                        updateCustomTarget('tls', {
                          ...tls,
                          pfxInputType: 'path',
                        })
                      }
                    >
                      <File className="mr-2 size-4" />
                      File Path
                    </Button>
                    <Button
                      variant={pfxInputType === 'base64' ? 'default' : 'outline'}
                      onClick={() =>
                        updateCustomTarget('tls', {
                          ...tls,
                          pfxInputType: 'base64',
                        })
                      }
                    >
                      <Lock className="mr-2 size-4" />
                      Base64
                    </Button>
                  </div>

                  {pfxInputType === 'upload' && (
                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".pfx,.p12"
                        className="hidden"
                        id="tls-pfx-upload"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              const arrayBuffer = event.target?.result as ArrayBuffer;
                              const base64 = arrayBufferToBase64(arrayBuffer);
                              updateCustomTarget('tls', {
                                ...tls,
                                pfx: base64,
                                pfxPath: undefined,
                              });
                              showToast('PFX certificate uploaded successfully', 'success');
                            };
                            reader.readAsArrayBuffer(file);
                          }
                        }}
                      />
                      <label htmlFor="tls-pfx-upload">
                        <Button variant="outline" asChild>
                          <span>{tls?.pfx ? 'Replace PFX' : 'Choose PFX File'}</span>
                        </Button>
                      </label>
                      {tls?.pfx && (
                        <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                          <Check className="size-4" /> PFX loaded
                        </span>
                      )}
                    </div>
                  )}

                  {pfxInputType === 'path' && (
                    <Input
                      placeholder="/path/to/certificate.pfx"
                      value={tls?.pfxPath || ''}
                      onChange={(e) =>
                        updateCustomTarget('tls', {
                          ...tls,
                          pfxPath: e.target.value,
                          pfx: undefined,
                        })
                      }
                    />
                  )}

                  {pfxInputType === 'base64' && (
                    <div className="space-y-2">
                      <Textarea
                        rows={4}
                        placeholder="Base64-encoded PFX content"
                        value={typeof tls?.pfx === 'string' ? tls.pfx : ''}
                        onChange={(e) =>
                          updateCustomTarget('tls', {
                            ...tls,
                            pfx: e.target.value,
                            pfxPath: undefined,
                          })
                        }
                      />
                      <p className="text-sm text-muted-foreground">
                        Paste the base64-encoded content of your PFX file
                      </p>
                    </div>
                  )}

                  <SensitiveTextField
                    label="PFX Passphrase"
                    placeholder="Enter passphrase for PFX"
                    value={tls?.passphrase || ''}
                    onChange={(e) =>
                      updateCustomTarget('tls', {
                        ...tls,
                        passphrase: e.target.value,
                      })
                    }
                    helperText="Password for the PFX certificate bundle"
                  />
                </div>
              </div>
            )}
          </div>
        </SetupSection>
        <SetupSection
          title="Advanced TLS Options"
          isExpanded={advancedOpen}
          onExpandedChange={setAdvancedOpen}
        >
          <div className="mt-2 rounded-lg border border-border p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="tls-servername">Server Name (SNI)</Label>
              <Input
                id="tls-servername"
                placeholder="api.example.com"
                value={tls?.servername || ''}
                onChange={(e) =>
                  updateCustomTarget('tls', {
                    ...tls,
                    servername: e.target.value,
                  })
                }
              />
              <p className="text-sm text-muted-foreground">
                Override the Server Name Indication (SNI) hostname
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tls-ciphers">Cipher Suites</Label>
              <Input
                id="tls-ciphers"
                placeholder="TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256"
                value={tls?.ciphers || ''}
                onChange={(e) =>
                  updateCustomTarget('tls', {
                    ...tls,
                    ciphers: e.target.value,
                  })
                }
              />
              <p className="text-sm text-muted-foreground">
                Specify allowed cipher suites (OpenSSL format)
              </p>
            </div>

            <div className="space-y-2">
              <Label>Minimum TLS Version</Label>
              <Select
                value={tls?.minVersion || 'default'}
                onValueChange={(value) =>
                  updateCustomTarget('tls', {
                    ...tls,
                    minVersion: value === 'default' ? undefined : value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="TLSv1">TLS 1.0</SelectItem>
                  <SelectItem value="TLSv1.1">TLS 1.1</SelectItem>
                  <SelectItem value="TLSv1.2">TLS 1.2</SelectItem>
                  <SelectItem value="TLSv1.3">TLS 1.3</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Maximum TLS Version</Label>
              <Select
                value={tls?.maxVersion || 'default'}
                onValueChange={(value) =>
                  updateCustomTarget('tls', {
                    ...tls,
                    maxVersion: value === 'default' ? undefined : value,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Default" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="TLSv1">TLS 1.0</SelectItem>
                  <SelectItem value="TLSv1.1">TLS 1.1</SelectItem>
                  <SelectItem value="TLSv1.2">TLS 1.2</SelectItem>
                  <SelectItem value="TLSv1.3">TLS 1.3</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tls-secure-protocol">Secure Protocol</Label>
              <Input
                id="tls-secure-protocol"
                placeholder="TLSv1_3_method"
                value={tls?.secureProtocol || ''}
                onChange={(e) =>
                  updateCustomTarget('tls', {
                    ...tls,
                    secureProtocol: e.target.value,
                  })
                }
              />
              <p className="text-sm text-muted-foreground">
                SSL method to use (e.g., 'TLSv1_2_method', 'TLSv1_3_method')
              </p>
            </div>
          </div>
        </SetupSection>
      </div>
    </>
  );
};

export default TlsHttpsConfigTab;
