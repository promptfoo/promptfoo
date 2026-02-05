import React, { useState } from 'react';

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
import { Switch } from '@app/components/ui/switch';
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

const TlsHttpsConfigTab: React.FC<TlsHttpsConfigTabProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  const { showToast } = useToast();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <>
      <p className="mb-6">
        Configure TLS certificates for secure HTTPS connections, including custom CA certificates,
        client certificates for mutual TLS, and PFX certificate bundles. See{' '}
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

      <div className="flex items-center gap-2">
        <Switch
          id="tls-enabled"
          checked={!!selectedTarget.config?.tls?.enabled}
          onCheckedChange={(checked) => {
            if (checked) {
              updateCustomTarget('tls', {
                ...selectedTarget.config?.tls,
                enabled: true,
                rejectUnauthorized: selectedTarget.config?.tls?.rejectUnauthorized ?? true,
              });
            } else {
              updateCustomTarget('tls', undefined);
            }
          }}
        />
        <Label htmlFor="tls-enabled">Enable TLS configuration</Label>
      </div>

      {selectedTarget.config?.tls?.enabled && (
        <div className="mt-6 space-y-8">
          {/* Certificate Type Selection */}
          <div className="space-y-2">
            <Label>Certificate Type</Label>
            <Select
              value={selectedTarget.config?.tls?.certificateType || 'none'}
              onValueChange={(value) => {
                const certType = value;
                updateCustomTarget('tls', {
                  ...selectedTarget.config?.tls,
                  certificateType: certType,
                  // Clear type-specific fields when changing
                  cert:
                    certType !== 'pem' && certType !== 'jks'
                      ? undefined
                      : selectedTarget.config?.tls?.cert,
                  certPath:
                    certType !== 'pem' && certType !== 'jks'
                      ? undefined
                      : selectedTarget.config?.tls?.certPath,
                  key:
                    certType !== 'pem' && certType !== 'jks'
                      ? undefined
                      : selectedTarget.config?.tls?.key,
                  keyPath:
                    certType !== 'pem' && certType !== 'jks'
                      ? undefined
                      : selectedTarget.config?.tls?.keyPath,
                  pfx: certType !== 'pfx' ? undefined : selectedTarget.config?.tls?.pfx,
                  pfxPath: certType !== 'pfx' ? undefined : selectedTarget.config?.tls?.pfxPath,
                  passphrase:
                    certType !== 'pfx' && certType !== 'jks' && certType !== 'pem'
                      ? undefined
                      : selectedTarget.config?.tls?.passphrase,
                  jksPath: certType !== 'jks' ? undefined : selectedTarget.config?.tls?.jksPath,
                  keyAlias: certType !== 'jks' ? undefined : selectedTarget.config?.tls?.keyAlias,
                });
              }}
            >
              <SelectTrigger>
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

          {/* PEM Certificate Configuration */}
          {selectedTarget.config?.tls?.certificateType === 'pem' && (
            <div className="space-y-4">
              <h3 className="font-medium">PEM Certificate Configuration</h3>

              {/* Client Certificate */}
              <div className="rounded-lg border border-border p-4 space-y-4">
                <h4 className="font-medium">Client Certificate</h4>
                <div className="flex gap-2">
                  <Button
                    variant={
                      selectedTarget.config?.tls?.certInputType === 'upload' ? 'default' : 'outline'
                    }
                    onClick={() =>
                      updateCustomTarget('tls', {
                        ...selectedTarget.config?.tls,
                        certInputType: 'upload',
                      })
                    }
                  >
                    <Upload className="mr-2 size-4" />
                    Upload
                  </Button>
                  <Button
                    variant={
                      selectedTarget.config?.tls?.certInputType === 'path' ? 'default' : 'outline'
                    }
                    onClick={() =>
                      updateCustomTarget('tls', {
                        ...selectedTarget.config?.tls,
                        certInputType: 'path',
                      })
                    }
                  >
                    <File className="mr-2 size-4" />
                    File Path
                  </Button>
                  <Button
                    variant={
                      selectedTarget.config?.tls?.certInputType === 'inline' ? 'default' : 'outline'
                    }
                    onClick={() =>
                      updateCustomTarget('tls', {
                        ...selectedTarget.config?.tls,
                        certInputType: 'inline',
                      })
                    }
                  >
                    <Key className="mr-2 size-4" />
                    Paste Inline
                  </Button>
                </div>

                {selectedTarget.config?.tls?.certInputType === 'upload' && (
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
                              ...selectedTarget.config?.tls,
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
                          {selectedTarget.config?.tls?.cert
                            ? 'Replace Certificate'
                            : 'Choose Certificate File'}
                        </span>
                      </Button>
                    </label>
                    {selectedTarget.config?.tls?.cert && (
                      <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Check className="size-4" /> Certificate loaded
                      </span>
                    )}
                  </div>
                )}

                {selectedTarget.config?.tls?.certInputType === 'path' && (
                  <Input
                    placeholder="/path/to/client-cert.pem"
                    value={selectedTarget.config?.tls?.certPath || ''}
                    onChange={(e) =>
                      updateCustomTarget('tls', {
                        ...selectedTarget.config?.tls,
                        certPath: e.target.value,
                        cert: undefined,
                      })
                    }
                  />
                )}

                {selectedTarget.config?.tls?.certInputType === 'inline' && (
                  <Textarea
                    rows={4}
                    placeholder="-----BEGIN CERTIFICATE-----&#10;...certificate content...&#10;-----END CERTIFICATE-----"
                    value={selectedTarget.config?.tls?.cert || ''}
                    onChange={(e) =>
                      updateCustomTarget('tls', {
                        ...selectedTarget.config?.tls,
                        cert: e.target.value,
                        certPath: undefined,
                      })
                    }
                  />
                )}
              </div>

              {/* Private Key */}
              <div className="rounded-lg border border-border p-4 space-y-4">
                <h4 className="font-medium">Private Key</h4>
                <div className="flex gap-2">
                  <Button
                    variant={
                      selectedTarget.config?.tls?.keyInputType === 'upload' ? 'default' : 'outline'
                    }
                    onClick={() =>
                      updateCustomTarget('tls', {
                        ...selectedTarget.config?.tls,
                        keyInputType: 'upload',
                      })
                    }
                  >
                    <Upload className="mr-2 size-4" />
                    Upload
                  </Button>
                  <Button
                    variant={
                      selectedTarget.config?.tls?.keyInputType === 'path' ? 'default' : 'outline'
                    }
                    onClick={() =>
                      updateCustomTarget('tls', {
                        ...selectedTarget.config?.tls,
                        keyInputType: 'path',
                      })
                    }
                  >
                    <File className="mr-2 size-4" />
                    File Path
                  </Button>
                  <Button
                    variant={
                      selectedTarget.config?.tls?.keyInputType === 'inline' ? 'default' : 'outline'
                    }
                    onClick={() =>
                      updateCustomTarget('tls', {
                        ...selectedTarget.config?.tls,
                        keyInputType: 'inline',
                      })
                    }
                  >
                    <KeyRound className="mr-2 size-4" />
                    Paste Inline
                  </Button>
                </div>

                {selectedTarget.config?.tls?.keyInputType === 'upload' && (
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
                              ...selectedTarget.config?.tls,
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
                        <span>
                          {selectedTarget.config?.tls?.key ? 'Replace Key' : 'Choose Key File'}
                        </span>
                      </Button>
                    </label>
                    {selectedTarget.config?.tls?.key && (
                      <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Check className="size-4" /> Key loaded
                      </span>
                    )}
                  </div>
                )}

                {selectedTarget.config?.tls?.keyInputType === 'path' && (
                  <Input
                    placeholder="/path/to/client-key.pem"
                    value={selectedTarget.config?.tls?.keyPath || ''}
                    onChange={(e) =>
                      updateCustomTarget('tls', {
                        ...selectedTarget.config?.tls,
                        keyPath: e.target.value,
                        key: undefined,
                      })
                    }
                  />
                )}

                {selectedTarget.config?.tls?.keyInputType === 'inline' && (
                  <Textarea
                    rows={4}
                    placeholder="-----BEGIN PRIVATE KEY-----&#10;...key content...&#10;-----END PRIVATE KEY-----"
                    value={selectedTarget.config?.tls?.key || ''}
                    onChange={(e) =>
                      updateCustomTarget('tls', {
                        ...selectedTarget.config?.tls,
                        key: e.target.value,
                        keyPath: undefined,
                      })
                    }
                  />
                )}
              </div>

              {/* Private Key Password (Optional) */}
              <div className="rounded-lg border border-border p-4 space-y-4">
                <h4 className="font-medium">Private Key Password (Optional)</h4>
                <SensitiveTextField
                  label="Password"
                  placeholder="Enter password for encrypted private key"
                  value={selectedTarget.config?.tls?.passphrase || ''}
                  onChange={(e) =>
                    updateCustomTarget('tls', {
                      ...selectedTarget.config?.tls,
                      passphrase: e.target.value,
                    })
                  }
                  helperText="Required only if your private key file is encrypted (e.g., starts with 'BEGIN ENCRYPTED PRIVATE KEY')"
                />
              </div>
            </div>
          )}

          {/* JKS Certificate Configuration */}
          {selectedTarget.config?.tls?.certificateType === 'jks' && (
            <div className="space-y-4">
              <h3 className="font-medium">JKS (Java KeyStore) Certificate</h3>

              <div className="rounded-lg border border-border p-4 space-y-4">
                <Alert variant="info">
                  <Info className="size-4" />
                  <AlertContent>
                    <AlertDescription>
                      Upload a JKS file to automatically extract the certificate and private key for
                      TLS configuration. The jks-js library will be used to convert the JKS content
                      to PEM format.
                    </AlertDescription>
                  </AlertContent>
                </Alert>

                <div className="space-y-2">
                  <h4 className="font-medium">JKS File Input</h4>
                  <div className="flex gap-2">
                    <Button
                      variant={
                        selectedTarget.config?.tls?.jksInputType === 'upload'
                          ? 'default'
                          : 'outline'
                      }
                      onClick={() =>
                        updateCustomTarget('tls', {
                          ...selectedTarget.config?.tls,
                          jksInputType: 'upload',
                        })
                      }
                    >
                      <Upload className="mr-2 size-4" />
                      Upload JKS
                    </Button>
                    <Button
                      variant={
                        selectedTarget.config?.tls?.jksInputType === 'path' ? 'default' : 'outline'
                      }
                      onClick={() =>
                        updateCustomTarget('tls', {
                          ...selectedTarget.config?.tls,
                          jksInputType: 'path',
                        })
                      }
                    >
                      <File className="mr-2 size-4" />
                      File Path
                    </Button>
                  </div>

                  {selectedTarget.config?.tls?.jksInputType === 'upload' && (
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
                                const base64 = btoa(
                                  String.fromCharCode(...new Uint8Array(arrayBuffer)),
                                );

                                updateCustomTarget('tls', {
                                  ...selectedTarget.config?.tls,
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
                            {selectedTarget.config?.tls?.jksContent
                              ? `Replace JKS (${selectedTarget.config?.tls?.jksFileName || 'loaded'})`
                              : 'Choose JKS File'}
                          </span>
                        </Button>
                      </label>
                      {selectedTarget.config?.tls?.jksContent && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <Check className="size-4" /> JKS file loaded:{' '}
                            {selectedTarget.config?.tls?.jksFileName || 'keystore.jks'}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive"
                            onClick={() =>
                              updateCustomTarget('tls', {
                                ...selectedTarget.config?.tls,
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

                  {selectedTarget.config?.tls?.jksInputType === 'path' && (
                    <div className="space-y-2">
                      <Input
                        placeholder="/path/to/keystore.jks"
                        value={selectedTarget.config?.tls?.jksPath || ''}
                        onChange={(e) =>
                          updateCustomTarget('tls', {
                            ...selectedTarget.config?.tls,
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
                  value={selectedTarget.config?.tls?.passphrase || ''}
                  onChange={(e) =>
                    updateCustomTarget('tls', {
                      ...selectedTarget.config?.tls,
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
                    value={selectedTarget.config?.tls?.keyAlias || ''}
                    onChange={(e) =>
                      updateCustomTarget('tls', {
                        ...selectedTarget.config?.tls,
                        keyAlias: e.target.value,
                      })
                    }
                  />
                  <p className="text-sm text-muted-foreground">
                    Alias of the key to extract. If not specified, the first available key will be
                    used.
                  </p>
                </div>

                {selectedTarget.config?.tls?.jksContent &&
                  selectedTarget.config?.tls?.passphrase && (
                    <div className="space-y-2">
                      <Button
                        onClick={async () => {
                          try {
                            showToast(
                              'JKS extraction will be performed on the backend. The certificate and key will be automatically converted to PEM format for TLS use.',
                              'info',
                            );

                            updateCustomTarget('tls', {
                              ...selectedTarget.config?.tls,
                              jksExtractConfigured: true,
                            });
                          } catch (error) {
                            showToast(
                              `Failed to configure JKS extraction: ${(error as Error).message}`,
                              'error',
                            );
                          }
                        }}
                      >
                        <KeyRound className="mr-2 size-4" />
                        Configure JKS Extraction
                      </Button>

                      {selectedTarget.config?.tls?.jksExtractConfigured && (
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

          {/* PFX Certificate Configuration */}
          {selectedTarget.config?.tls?.certificateType === 'pfx' && (
            <div className="space-y-4">
              <h3 className="font-medium">PFX/PKCS#12 Certificate Bundle</h3>

              <div className="rounded-lg border border-border p-4 space-y-4">
                <div className="flex gap-2">
                  <Button
                    variant={
                      selectedTarget.config?.tls?.pfxInputType === 'upload' ? 'default' : 'outline'
                    }
                    onClick={() =>
                      updateCustomTarget('tls', {
                        ...selectedTarget.config?.tls,
                        pfxInputType: 'upload',
                      })
                    }
                  >
                    <Upload className="mr-2 size-4" />
                    Upload
                  </Button>
                  <Button
                    variant={
                      selectedTarget.config?.tls?.pfxInputType === 'path' ? 'default' : 'outline'
                    }
                    onClick={() =>
                      updateCustomTarget('tls', {
                        ...selectedTarget.config?.tls,
                        pfxInputType: 'path',
                      })
                    }
                  >
                    <File className="mr-2 size-4" />
                    File Path
                  </Button>
                  <Button
                    variant={
                      selectedTarget.config?.tls?.pfxInputType === 'base64' ? 'default' : 'outline'
                    }
                    onClick={() =>
                      updateCustomTarget('tls', {
                        ...selectedTarget.config?.tls,
                        pfxInputType: 'base64',
                      })
                    }
                  >
                    <Lock className="mr-2 size-4" />
                    Base64
                  </Button>
                </div>

                {selectedTarget.config?.tls?.pfxInputType === 'upload' && (
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
                            const base64 = btoa(
                              String.fromCharCode(...new Uint8Array(arrayBuffer)),
                            );
                            updateCustomTarget('tls', {
                              ...selectedTarget.config?.tls,
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
                        <span>
                          {selectedTarget.config?.tls?.pfx ? 'Replace PFX' : 'Choose PFX File'}
                        </span>
                      </Button>
                    </label>
                    {selectedTarget.config?.tls?.pfx && (
                      <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <Check className="size-4" /> PFX loaded
                      </span>
                    )}
                  </div>
                )}

                {selectedTarget.config?.tls?.pfxInputType === 'path' && (
                  <Input
                    placeholder="/path/to/certificate.pfx"
                    value={selectedTarget.config?.tls?.pfxPath || ''}
                    onChange={(e) =>
                      updateCustomTarget('tls', {
                        ...selectedTarget.config?.tls,
                        pfxPath: e.target.value,
                        pfx: undefined,
                      })
                    }
                  />
                )}

                {selectedTarget.config?.tls?.pfxInputType === 'base64' && (
                  <div className="space-y-2">
                    <Textarea
                      rows={4}
                      placeholder="Base64-encoded PFX content"
                      value={
                        typeof selectedTarget.config?.tls?.pfx === 'string'
                          ? selectedTarget.config?.tls.pfx
                          : ''
                      }
                      onChange={(e) =>
                        updateCustomTarget('tls', {
                          ...selectedTarget.config?.tls,
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
                  value={selectedTarget.config?.tls?.passphrase || ''}
                  onChange={(e) =>
                    updateCustomTarget('tls', {
                      ...selectedTarget.config?.tls,
                      passphrase: e.target.value,
                    })
                  }
                  helperText="Password for the PFX certificate bundle"
                />
              </div>
            </div>
          )}

          {/* CA Certificate Configuration */}
          <div className="space-y-4">
            <h3 className="font-medium">CA Certificate (Optional)</h3>
            <div className="rounded-lg border border-border p-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Provide a custom CA certificate to verify the server's certificate
              </p>
              <div className="flex gap-2">
                <Button
                  variant={
                    selectedTarget.config?.tls?.caInputType === 'upload' ? 'default' : 'outline'
                  }
                  onClick={() =>
                    updateCustomTarget('tls', {
                      ...selectedTarget.config?.tls,
                      caInputType: 'upload',
                    })
                  }
                >
                  <ShieldCheck className="mr-2 size-4" />
                  Upload
                </Button>
                <Button
                  variant={
                    selectedTarget.config?.tls?.caInputType === 'path' ? 'default' : 'outline'
                  }
                  onClick={() =>
                    updateCustomTarget('tls', {
                      ...selectedTarget.config?.tls,
                      caInputType: 'path',
                    })
                  }
                >
                  <File className="mr-2 size-4" />
                  File Path
                </Button>
                <Button
                  variant={
                    selectedTarget.config?.tls?.caInputType === 'inline' ? 'default' : 'outline'
                  }
                  onClick={() =>
                    updateCustomTarget('tls', {
                      ...selectedTarget.config?.tls,
                      caInputType: 'inline',
                    })
                  }
                >
                  <Lock className="mr-2 size-4" />
                  Paste Inline
                </Button>
              </div>

              {selectedTarget.config?.tls?.caInputType === 'upload' && (
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
                            ...selectedTarget.config?.tls,
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
                      <span>
                        {selectedTarget.config?.tls?.ca
                          ? 'Replace CA Certificate'
                          : 'Choose CA File'}
                      </span>
                    </Button>
                  </label>
                  {selectedTarget.config?.tls?.ca && (
                    <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Check className="size-4" /> CA certificate loaded
                    </span>
                  )}
                </div>
              )}

              {selectedTarget.config?.tls?.caInputType === 'path' && (
                <Input
                  placeholder="/path/to/ca-cert.pem"
                  value={selectedTarget.config?.tls?.caPath || ''}
                  onChange={(e) =>
                    updateCustomTarget('tls', {
                      ...selectedTarget.config?.tls,
                      caPath: e.target.value,
                      ca: undefined,
                    })
                  }
                />
              )}

              {selectedTarget.config?.tls?.caInputType === 'inline' && (
                <Textarea
                  rows={4}
                  placeholder="-----BEGIN CERTIFICATE-----&#10;...CA certificate content...&#10;-----END CERTIFICATE-----"
                  value={selectedTarget.config?.tls?.ca || ''}
                  onChange={(e) =>
                    updateCustomTarget('tls', {
                      ...selectedTarget.config?.tls,
                      ca: e.target.value,
                      caPath: undefined,
                    })
                  }
                />
              )}
            </div>
          </div>

          {/* Security Options */}
          <div className="space-y-4">
            <h3 className="font-medium">Security Options</h3>
            <div className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="reject-unauthorized"
                  checked={selectedTarget.config?.tls?.rejectUnauthorized !== false}
                  onCheckedChange={(checked) =>
                    updateCustomTarget('tls', {
                      ...selectedTarget.config?.tls,
                      rejectUnauthorized: checked,
                    })
                  }
                />
                <Label htmlFor="reject-unauthorized">Reject Unauthorized Certificates</Label>
              </div>
              {selectedTarget.config?.tls?.rejectUnauthorized === false && (
                <Alert variant="warning">
                  <AlertTriangle className="size-4" />
                  <AlertContent>
                    <AlertDescription>
                      Disabling certificate verification is dangerous and should never be used in
                      production!
                    </AlertDescription>
                  </AlertContent>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="tls-servername">Server Name (SNI)</Label>
                <Input
                  id="tls-servername"
                  placeholder="api.example.com"
                  value={selectedTarget.config?.tls?.servername || ''}
                  onChange={(e) =>
                    updateCustomTarget('tls', {
                      ...selectedTarget.config?.tls,
                      servername: e.target.value,
                    })
                  }
                />
                <p className="text-sm text-muted-foreground">
                  Override the Server Name Indication (SNI) hostname
                </p>
              </div>
            </div>
          </div>

          {/* Advanced Options */}
          <SetupSection
            title="Advanced TLS Options"
            isExpanded={advancedOpen}
            onExpandedChange={setAdvancedOpen}
          >
            <div className="mt-2 rounded-lg border border-border p-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="tls-ciphers">Cipher Suites</Label>
                <Input
                  id="tls-ciphers"
                  placeholder="TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256"
                  value={selectedTarget.config?.tls?.ciphers || ''}
                  onChange={(e) =>
                    updateCustomTarget('tls', {
                      ...selectedTarget.config?.tls,
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
                  value={selectedTarget.config?.tls?.minVersion || 'default'}
                  onValueChange={(value) =>
                    updateCustomTarget('tls', {
                      ...selectedTarget.config?.tls,
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
                  value={selectedTarget.config?.tls?.maxVersion || 'default'}
                  onValueChange={(value) =>
                    updateCustomTarget('tls', {
                      ...selectedTarget.config?.tls,
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
                  value={selectedTarget.config?.tls?.secureProtocol || ''}
                  onChange={(e) =>
                    updateCustomTarget('tls', {
                      ...selectedTarget.config?.tls,
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
      )}
    </>
  );
};

export default TlsHttpsConfigTab;
