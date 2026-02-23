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

interface PemKeyInputSelectorProps {
  signatureAuth: NonNullable<NonNullable<HttpProviderOptions['config']>['signatureAuth']>;
  updateCustomTarget: (field: string, value: unknown) => void;
}

const PemKeyInputSelector: React.FC<PemKeyInputSelectorProps> = ({
  signatureAuth,
  updateCustomTarget,
}) => {
  const setKeyInputType = (type: string) => {
    updateCustomTarget('signatureAuth', { ...signatureAuth, keyInputType: type });
  };

  const options = [
    { value: 'upload', label: 'Upload Key', sublabel: 'Upload PEM file', Icon: Upload },
    { value: 'path', label: 'File Path', sublabel: 'Specify key location', Icon: File },
    { value: 'base64', label: 'Base64 Key String', sublabel: 'Paste encoded key', Icon: Key },
  ];

  return (
    <div className="space-y-4">
      <Label>PEM Key Input Method</Label>
      <div className="grid grid-cols-3 gap-3">
        {options.map(({ value, label, sublabel, Icon }) => {
          const isActive = signatureAuth.keyInputType === value;
          return (
            <div
              key={value}
              className={cn(
                'flex flex-col items-center rounded-lg border p-4 cursor-pointer transition-colors',
                isActive ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
              )}
              onClick={() => setKeyInputType(value)}
            >
              <Icon
                className={cn('size-6 mb-2', isActive ? 'text-primary' : 'text-muted-foreground')}
              />
              <span className="font-medium">{label}</span>
              <span className="text-sm text-muted-foreground text-center">{sublabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface PemUploadSectionProps {
  signatureAuth: NonNullable<NonNullable<HttpProviderOptions['config']>['signatureAuth']>;
  updateCustomTarget: (field: string, value: unknown) => void;
  showToast: (message: string, type: 'success' | 'warning' | 'error') => void;
}

const PemUploadSection: React.FC<PemUploadSectionProps> = ({
  signatureAuth,
  updateCustomTarget,
  showToast,
}) => {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        updateCustomTarget('signatureAuth', {
          ...signatureAuth,
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
        console.warn('Key was loaded but could not be successfully validated:', error);
        showToast(
          `Key was loaded but could not be successfully validated: ${(error as Error).message}`,
          'warning',
        );
      }
    };
    reader.readAsText(file);
  };

  const handleRemoveKey = () => {
    updateCustomTarget('signatureAuth', {
      ...signatureAuth,
      privateKey: undefined,
      privateKeyPath: undefined,
    });
  };

  return (
    <div className="rounded-lg border border-border p-6">
      <input
        type="file"
        accept=".pem,.key"
        className="hidden"
        id="private-key-upload"
        onClick={(e) => {
          (e.target as HTMLInputElement).value = '';
        }}
        onChange={handleFileChange}
      />
      <div className="text-center">
        {signatureAuth.privateKey ? (
          <>
            <p className="text-emerald-600 dark:text-emerald-400 mb-4">
              Key file loaded successfully
            </p>
            <Button variant="outline" className="text-destructive" onClick={handleRemoveKey}>
              <X className="mr-2 size-4" />
              Remove Key
            </Button>
          </>
        ) : (
          <>
            <p className="text-muted-foreground mb-4">Upload your PEM format private key</p>
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
  );
};

interface PemPathSectionProps {
  signatureAuth: NonNullable<NonNullable<HttpProviderOptions['config']>['signatureAuth']>;
  updateCustomTarget: (field: string, value: unknown) => void;
}

const PemPathSection: React.FC<PemPathSectionProps> = ({ signatureAuth, updateCustomTarget }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateCustomTarget('signatureAuth', {
      ...signatureAuth,
      type: 'pem',
      privateKeyPath: e.target.value,
      privateKey: undefined,
      keystorePath: undefined,
      keystorePassword: undefined,
      keyAlias: undefined,
      pfxPath: undefined,
      pfxPassword: undefined,
    });
  };

  return (
    <div className="rounded-lg border border-border p-6 space-y-4">
      <p className="text-muted-foreground">
        Specify the path on disk to your PEM format private key file
      </p>
      <div className="space-y-2">
        <Label htmlFor="private-key-path">Private Key File Path</Label>
        <Input
          id="private-key-path"
          placeholder="/path/to/private_key.pem"
          value={signatureAuth.privateKeyPath || ''}
          onChange={handleChange}
        />
      </div>
    </div>
  );
};

interface PemBase64SectionProps {
  signatureAuth: NonNullable<NonNullable<HttpProviderOptions['config']>['signatureAuth']>;
  updateCustomTarget: (field: string, value: unknown) => void;
  showToast: (message: string, type: 'success' | 'warning' | 'error') => void;
}

const PemBase64Section: React.FC<PemBase64SectionProps> = ({
  signatureAuth,
  updateCustomTarget,
  showToast,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    updateCustomTarget('signatureAuth', {
      ...signatureAuth,
      type: 'pem',
      privateKey: e.target.value,
      privateKeyPath: undefined,
      keystorePath: undefined,
      keystorePassword: undefined,
      keyAlias: undefined,
      pfxPath: undefined,
      pfxPassword: undefined,
    });
  };

  const handleFormatAndValidate = async () => {
    try {
      const inputKey = signatureAuth.privateKey || '';
      const formattedKey = await convertStringKeyToPem(inputKey);
      updateCustomTarget('signatureAuth', {
        ...signatureAuth,
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
      console.warn('Key was loaded but could not be successfully validated:', error);
      showToast(
        `Key was loaded but could not be successfully validated: ${(error as Error).message}`,
        'warning',
      );
    }
  };

  return (
    <div className="rounded-lg border border-border p-6 space-y-4">
      <Textarea
        rows={4}
        placeholder="-----BEGIN PRIVATE KEY-----&#10;Base64 encoded key content in PEM format&#10;-----END PRIVATE KEY-----"
        value={signatureAuth.privateKey || ''}
        onChange={handleChange}
      />
      <div className="text-center">
        <Button variant="outline" onClick={handleFormatAndValidate}>
          <Check className="mr-2 size-4" />
          Format & Validate
        </Button>
      </div>
    </div>
  );
};

interface JksSectionProps {
  signatureAuth: NonNullable<NonNullable<HttpProviderOptions['config']>['signatureAuth']>;
  updateCustomTarget: (field: string, value: unknown) => void;
}

const JksSection: React.FC<JksSectionProps> = ({ signatureAuth, updateCustomTarget }) => {
  const updateField = (field: string, value: string) => {
    updateCustomTarget('signatureAuth', { ...signatureAuth, [field]: value });
  };

  return (
    <div className="rounded-lg border border-border p-6 space-y-4">
      <p className="text-muted-foreground">
        Configure Java KeyStore (JKS) settings for signature authentication
      </p>
      <div className="space-y-2">
        <Label htmlFor="keystore-path">Keystore File</Label>
        <Input
          id="keystore-path"
          placeholder="/path/to/keystore.jks"
          value={signatureAuth.keystorePath || ''}
          onChange={(e) => {
            updateCustomTarget('signatureAuth', {
              ...signatureAuth,
              type: 'jks',
              keystorePath: e.target.value,
              privateKey: undefined,
              privateKeyPath: undefined,
              pfxPath: undefined,
              pfxPassword: undefined,
            });
          }}
        />
        <p className="text-sm text-muted-foreground">Enter full path to your JKS keystore file</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="keystore-password">Keystore Password</Label>
        <Input
          id="keystore-password"
          type="password"
          placeholder="Enter keystore password"
          value={signatureAuth.keystorePassword || ''}
          onChange={(e) => updateField('keystorePassword', e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          Password for the JKS keystore. Can also be set via PROMPTFOO_JKS_PASSWORD environment
          variable.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="jks-key-alias">Key Alias</Label>
        <Input
          id="jks-key-alias"
          placeholder="client"
          value={signatureAuth.keyAlias || ''}
          onChange={(e) => updateField('keyAlias', e.target.value)}
        />
        <p className="text-sm text-muted-foreground">
          Alias of the key to use from the keystore. If not specified, the first available key will
          be used.
        </p>
      </div>
    </div>
  );
};

interface PfxSectionProps {
  signatureAuth: NonNullable<NonNullable<HttpProviderOptions['config']>['signatureAuth']>;
  updateCustomTarget: (field: string, value: unknown) => void;
}

const PfxSection: React.FC<PfxSectionProps> = ({ signatureAuth, updateCustomTarget }) => {
  const isPfxMode = !signatureAuth.pfxMode || signatureAuth.pfxMode === 'pfx';
  const isSeparateMode = signatureAuth.pfxMode === 'separate';

  const setPfxMode = (mode: string) => {
    if (mode === 'pfx') {
      updateCustomTarget('signatureAuth', {
        ...signatureAuth,
        pfxMode: 'pfx',
        certPath: undefined,
        keyPath: undefined,
      });
    } else {
      updateCustomTarget('signatureAuth', {
        ...signatureAuth,
        pfxMode: 'separate',
        pfxPath: undefined,
        pfxPassword: undefined,
      });
    }
  };

  return (
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
              checked={isPfxMode}
              onChange={() => setPfxMode('pfx')}
              className="size-4 text-primary"
            />
            <span>PFX/P12 File</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="pfxMode"
              value="separate"
              checked={isSeparateMode}
              onChange={() => setPfxMode('separate')}
              className="size-4 text-primary"
            />
            <span>Separate CRT/KEY Files</span>
          </label>
        </div>
      </div>

      {isPfxMode && (
        <>
          <div className="space-y-2">
            <Label htmlFor="pfx-path">PFX/P12 Certificate File</Label>
            <Input
              id="pfx-path"
              placeholder="/path/to/certificate.pfx"
              value={signatureAuth.pfxPath || ''}
              onChange={(e) => {
                updateCustomTarget('signatureAuth', {
                  ...signatureAuth,
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
              value={signatureAuth.pfxPassword || ''}
              onChange={(e) => {
                updateCustomTarget('signatureAuth', {
                  ...signatureAuth,
                  pfxPassword: e.target.value,
                });
              }}
            />
            <p className="text-sm text-muted-foreground">
              Password for the PFX certificate file. Can also be set via PROMPTFOO_PFX_PASSWORD
              environment variable.
            </p>
          </div>
        </>
      )}

      {isSeparateMode && (
        <>
          <div className="space-y-2">
            <Label htmlFor="cert-path">Certificate File (CRT)</Label>
            <Input
              id="cert-path"
              placeholder="/path/to/certificate.crt"
              value={signatureAuth.certPath || ''}
              onChange={(e) => {
                updateCustomTarget('signatureAuth', {
                  ...signatureAuth,
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
              value={signatureAuth.keyPath || ''}
              onChange={(e) => {
                updateCustomTarget('signatureAuth', {
                  ...signatureAuth,
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
  );
};

const DigitalSignatureAuthTab: React.FC<DigitalSignatureAuthTabProps> = ({
  selectedTarget,
  updateCustomTarget,
}) => {
  const { showToast } = useToast();
  const signatureAuth = selectedTarget.config?.signatureAuth;

  const handleEnabledChange = (checked: boolean) => {
    if (checked) {
      updateCustomTarget('signatureAuth', {
        enabled: true,
        certificateType: signatureAuth?.certificateType || 'pem',
        keyInputType: signatureAuth?.keyInputType || 'upload',
      });
    } else {
      updateCustomTarget('signatureAuth', undefined);
    }
  };

  const handleCertTypeChange = (value: string) => {
    updateCustomTarget('signatureAuth', {
      ...signatureAuth,
      certificateType: value,
      keyInputType: value === 'pem' ? 'upload' : undefined,
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
      type: value,
    });
  };

  const handleSignatureDataTemplateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateCustomTarget('signatureAuth', {
      ...signatureAuth,
      signatureDataTemplate: e.target.value,
    });
  };

  const handleSignatureValidityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value === '' ? undefined : Number(e.target.value);
    updateCustomTarget('signatureAuth', { ...signatureAuth, signatureValidityMs: value });
  };

  const handleSignatureValidityBlur = () => {
    if (
      signatureAuth?.signatureValidityMs === undefined ||
      signatureAuth?.signatureValidityMs === ''
    ) {
      updateCustomTarget('signatureAuth', { ...signatureAuth, signatureValidityMs: 300000 });
    }
  };

  const handleSignatureRefreshBufferChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value === '' ? undefined : Number(e.target.value);
    updateCustomTarget('signatureAuth', { ...signatureAuth, signatureRefreshBufferMs: value });
  };

  const handleSignatureAlgorithmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateCustomTarget('signatureAuth', { ...signatureAuth, signatureAlgorithm: e.target.value });
  };

  const certType = signatureAuth?.certificateType;
  const keyInputType = signatureAuth?.keyInputType;

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
          checked={!!signatureAuth?.enabled}
          onCheckedChange={handleEnabledChange}
        />
        <Label htmlFor="signature-auth-enabled">Enable signature authentication</Label>
      </div>

      {signatureAuth?.enabled && (
        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <Label>Certificate Type</Label>
            <Select value={certType || 'pem'} onValueChange={handleCertTypeChange}>
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

          {certType === 'pem' && (
            <PemKeyInputSelector
              signatureAuth={signatureAuth}
              updateCustomTarget={updateCustomTarget}
            />
          )}

          {certType === 'pem' && keyInputType === 'upload' && (
            <PemUploadSection
              signatureAuth={signatureAuth}
              updateCustomTarget={updateCustomTarget}
              showToast={showToast}
            />
          )}

          {certType === 'pem' && keyInputType === 'path' && (
            <PemPathSection signatureAuth={signatureAuth} updateCustomTarget={updateCustomTarget} />
          )}

          {certType === 'pem' && keyInputType === 'base64' && (
            <PemBase64Section
              signatureAuth={signatureAuth}
              updateCustomTarget={updateCustomTarget}
              showToast={showToast}
            />
          )}

          {certType === 'jks' && (
            <JksSection signatureAuth={signatureAuth} updateCustomTarget={updateCustomTarget} />
          )}

          {certType === 'pfx' && (
            <PfxSection signatureAuth={signatureAuth} updateCustomTarget={updateCustomTarget} />
          )}

          <div className="space-y-2">
            <Label htmlFor="signature-data-template">Signature Data Template</Label>
            <Input
              id="signature-data-template"
              value={signatureAuth?.signatureDataTemplate || '{{signatureTimestamp}}'}
              onChange={handleSignatureDataTemplateChange}
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
              value={signatureAuth?.signatureValidityMs || ''}
              onChange={handleSignatureValidityChange}
              onBlur={handleSignatureValidityBlur}
              placeholder="How long the signature remains valid"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signature-refresh-buffer">Signature Refresh Buffer (ms)</Label>
            <Input
              id="signature-refresh-buffer"
              type="number"
              value={signatureAuth?.signatureRefreshBufferMs || ''}
              onChange={handleSignatureRefreshBufferChange}
              placeholder="Buffer time before signature expiry to refresh - defaults to 10% of signature validity"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="signature-algorithm">Signature Algorithm</Label>
            <Input
              id="signature-algorithm"
              value={signatureAuth?.signatureAlgorithm || 'SHA256'}
              onChange={handleSignatureAlgorithmChange}
              placeholder="Signature algorithm (default: SHA256)"
            />
          </div>
        </div>
      )}
    </>
  );
};

export default DigitalSignatureAuthTab;
