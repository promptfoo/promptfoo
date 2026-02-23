import React, { useCallback, useState } from 'react';

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

type TlsConfig = NonNullable<HttpProviderOptions['config']>['tls'];

interface TlsTabSharedProps {
  tls: TlsConfig;
  updateTls: (patch: Partial<NonNullable<TlsConfig>>) => void;
}

function buildCertTypeUpdate(certType: string, tls: TlsConfig): NonNullable<TlsConfig> {
  const isPemOrJks = certType === 'pem' || certType === 'jks';
  const isPfxOrJksOrPem = certType === 'pfx' || certType === 'jks' || certType === 'pem';
  return {
    ...tls,
    certificateType: certType,
    cert: isPemOrJks ? tls?.cert : undefined,
    certPath: isPemOrJks ? tls?.certPath : undefined,
    key: isPemOrJks ? tls?.key : undefined,
    keyPath: isPemOrJks ? tls?.keyPath : undefined,
    pfx: certType === 'pfx' ? tls?.pfx : undefined,
    pfxPath: certType === 'pfx' ? tls?.pfxPath : undefined,
    passphrase: isPfxOrJksOrPem ? tls?.passphrase : undefined,
    jksPath: certType === 'jks' ? tls?.jksPath : undefined,
    keyAlias: certType === 'jks' ? tls?.keyAlias : undefined,
  };
}

const PemCertConfig: React.FC<
  TlsTabSharedProps & { showToast: (msg: string, type: string) => void }
> = ({ tls, updateTls, showToast }) => {
  const certInputType = tls?.certInputType;
  const keyInputType = tls?.keyInputType;

  const certUploadVariant = certInputType === 'upload' ? 'default' : ('outline' as const);
  const certPathVariant = certInputType === 'path' ? 'default' : ('outline' as const);
  const certInlineVariant = certInputType === 'inline' ? 'default' : ('outline' as const);
  const keyUploadVariant = keyInputType === 'upload' ? 'default' : ('outline' as const);
  const keyPathVariant = keyInputType === 'path' ? 'default' : ('outline' as const);
  const keyInlineVariant = keyInputType === 'inline' ? 'default' : ('outline' as const);

  const handleCertFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        updateTls({ cert: content, certPath: undefined });
        showToast('Certificate uploaded successfully', 'success');
      };
      reader.readAsText(file);
    },
    [updateTls, showToast],
  );

  const handleKeyFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target?.result as string;
        updateTls({ key: content, keyPath: undefined });
        try {
          await validatePrivateKey(content);
          showToast('Private key validated successfully', 'success');
        } catch (error) {
          showToast(`Key loaded but validation failed: ${(error as Error).message}`, 'warning');
        }
      };
      reader.readAsText(file);
    },
    [updateTls, showToast],
  );

  const certButtonLabel = tls?.cert ? 'Replace Certificate' : 'Choose Certificate File';
  const keyButtonLabel = tls?.key ? 'Replace Key' : 'Choose Key File';

  return (
    <div className="space-y-4">
      <h3 className="font-medium">PEM Certificate Configuration</h3>

      {/* Client Certificate */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <h4 className="font-medium">Client Certificate</h4>
        <div className="flex gap-2">
          <Button
            variant={certUploadVariant}
            onClick={() => updateTls({ certInputType: 'upload' })}
          >
            <Upload className="mr-2 size-4" />
            Upload
          </Button>
          <Button variant={certPathVariant} onClick={() => updateTls({ certInputType: 'path' })}>
            <File className="mr-2 size-4" />
            File Path
          </Button>
          <Button
            variant={certInlineVariant}
            onClick={() => updateTls({ certInputType: 'inline' })}
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
              onChange={handleCertFileChange}
            />
            <label htmlFor="tls-cert-upload">
              <Button variant="outline" asChild>
                <span>{certButtonLabel}</span>
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
            onChange={(e) => updateTls({ certPath: e.target.value, cert: undefined })}
          />
        )}

        {certInputType === 'inline' && (
          <Textarea
            rows={4}
            placeholder="-----BEGIN CERTIFICATE-----&#10;...certificate content...&#10;-----END CERTIFICATE-----"
            value={tls?.cert || ''}
            onChange={(e) => updateTls({ cert: e.target.value, certPath: undefined })}
          />
        )}
      </div>

      {/* Private Key */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <h4 className="font-medium">Private Key</h4>
        <div className="flex gap-2">
          <Button variant={keyUploadVariant} onClick={() => updateTls({ keyInputType: 'upload' })}>
            <Upload className="mr-2 size-4" />
            Upload
          </Button>
          <Button variant={keyPathVariant} onClick={() => updateTls({ keyInputType: 'path' })}>
            <File className="mr-2 size-4" />
            File Path
          </Button>
          <Button variant={keyInlineVariant} onClick={() => updateTls({ keyInputType: 'inline' })}>
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
              onChange={handleKeyFileChange}
            />
            <label htmlFor="tls-key-upload">
              <Button variant="outline" asChild>
                <span>{keyButtonLabel}</span>
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
            onChange={(e) => updateTls({ keyPath: e.target.value, key: undefined })}
          />
        )}

        {keyInputType === 'inline' && (
          <Textarea
            rows={4}
            placeholder="-----BEGIN PRIVATE KEY-----&#10;...key content...&#10;-----END PRIVATE KEY-----"
            value={tls?.key || ''}
            onChange={(e) => updateTls({ key: e.target.value, keyPath: undefined })}
          />
        )}
      </div>

      {/* Private Key Password (Optional) */}
      <div className="rounded-lg border border-border p-4 space-y-4">
        <h4 className="font-medium">Private Key Password (Optional)</h4>
        <SensitiveTextField
          label="Password"
          placeholder="Enter password for encrypted private key"
          value={tls?.passphrase || ''}
          onChange={(e) => updateTls({ passphrase: e.target.value })}
          helperText="Required only if your private key file is encrypted (e.g., starts with 'BEGIN ENCRYPTED PRIVATE KEY')"
        />
      </div>
    </div>
  );
};

const JksCertConfig: React.FC<
  TlsTabSharedProps & { showToast: (msg: string, type: string) => void }
> = ({ tls, updateTls, showToast }) => {
  const jksInputType = tls?.jksInputType;
  const jksUploadVariant = jksInputType === 'upload' ? 'default' : ('outline' as const);
  const jksPathVariant = jksInputType === 'path' ? 'default' : ('outline' as const);
  const jksButtonLabel = tls?.jksContent
    ? `Replace JKS (${tls?.jksFileName || 'loaded'})`
    : 'Choose JKS File';

  const handleJksFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const arrayBuffer = event.target?.result as ArrayBuffer;
          const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
          updateTls({ jksContent: base64, jksPath: undefined, jksFileName: file.name });
          showToast(
            'JKS file uploaded successfully. Enter password to extract certificates.',
            'success',
          );
        } catch (error) {
          showToast(`Failed to load JKS file: ${(error as Error).message}`, 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [updateTls, showToast],
  );

  const handleConfigureJks = useCallback(async () => {
    try {
      showToast(
        'JKS extraction will be performed on the backend. The certificate and key will be automatically converted to PEM format for TLS use.',
        'info',
      );
      updateTls({ jksExtractConfigured: true });
    } catch (error) {
      showToast(`Failed to configure JKS extraction: ${(error as Error).message}`, 'error');
    }
  }, [updateTls, showToast]);

  return (
    <div className="space-y-4">
      <h3 className="font-medium">JKS (Java KeyStore) Certificate</h3>

      <div className="rounded-lg border border-border p-4 space-y-4">
        <Alert variant="info">
          <Info className="size-4" />
          <AlertContent>
            <AlertDescription>
              Upload a JKS file to automatically extract the certificate and private key for TLS
              configuration. The jks-js library will be used to convert the JKS content to PEM
              format.
            </AlertDescription>
          </AlertContent>
        </Alert>

        <div className="space-y-2">
          <h4 className="font-medium">JKS File Input</h4>
          <div className="flex gap-2">
            <Button
              variant={jksUploadVariant}
              onClick={() => updateTls({ jksInputType: 'upload' })}
            >
              <Upload className="mr-2 size-4" />
              Upload JKS
            </Button>
            <Button variant={jksPathVariant} onClick={() => updateTls({ jksInputType: 'path' })}>
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
                onChange={handleJksFileChange}
              />
              <label htmlFor="tls-jks-upload">
                <Button variant="outline" asChild>
                  <span>{jksButtonLabel}</span>
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
                      updateTls({
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
                onChange={(e) => updateTls({ jksPath: e.target.value, jksContent: undefined })}
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
          onChange={(e) => updateTls({ passphrase: e.target.value })}
          required
          helperText="Password for the JKS keystore (required to extract certificates)"
        />

        <div className="space-y-2">
          <Label htmlFor="jks-key-alias">Key Alias (Optional)</Label>
          <Input
            id="jks-key-alias"
            placeholder="mykey"
            value={tls?.keyAlias || ''}
            onChange={(e) => updateTls({ keyAlias: e.target.value })}
          />
          <p className="text-sm text-muted-foreground">
            Alias of the key to extract. If not specified, the first available key will be used.
          </p>
        </div>

        {tls?.jksContent && tls?.passphrase && (
          <div className="space-y-2">
            <Button onClick={handleConfigureJks}>
              <KeyRound className="mr-2 size-4" />
              Configure JKS Extraction
            </Button>

            {tls?.jksExtractConfigured && (
              <Alert variant="success">
                <Check className="size-4" />
                <AlertContent>
                  <AlertDescription>
                    JKS extraction configured. The certificate and private key will be extracted
                    from the JKS file on the backend using the provided password and key alias.
                  </AlertDescription>
                </AlertContent>
              </Alert>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const PfxCertConfig: React.FC<
  TlsTabSharedProps & { showToast: (msg: string, type: string) => void }
> = ({ tls, updateTls, showToast }) => {
  const pfxInputType = tls?.pfxInputType;
  const pfxUploadVariant = pfxInputType === 'upload' ? 'default' : ('outline' as const);
  const pfxPathVariant = pfxInputType === 'path' ? 'default' : ('outline' as const);
  const pfxBase64Variant = pfxInputType === 'base64' ? 'default' : ('outline' as const);
  const pfxButtonLabel = tls?.pfx ? 'Replace PFX' : 'Choose PFX File';
  const pfxTextareaValue = typeof tls?.pfx === 'string' ? tls.pfx : '';

  const handlePfxFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        updateTls({ pfx: base64, pfxPath: undefined });
        showToast('PFX certificate uploaded successfully', 'success');
      };
      reader.readAsArrayBuffer(file);
    },
    [updateTls, showToast],
  );

  return (
    <div className="space-y-4">
      <h3 className="font-medium">PFX/PKCS#12 Certificate Bundle</h3>

      <div className="rounded-lg border border-border p-4 space-y-4">
        <div className="flex gap-2">
          <Button variant={pfxUploadVariant} onClick={() => updateTls({ pfxInputType: 'upload' })}>
            <Upload className="mr-2 size-4" />
            Upload
          </Button>
          <Button variant={pfxPathVariant} onClick={() => updateTls({ pfxInputType: 'path' })}>
            <File className="mr-2 size-4" />
            File Path
          </Button>
          <Button variant={pfxBase64Variant} onClick={() => updateTls({ pfxInputType: 'base64' })}>
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
              onChange={handlePfxFileChange}
            />
            <label htmlFor="tls-pfx-upload">
              <Button variant="outline" asChild>
                <span>{pfxButtonLabel}</span>
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
            onChange={(e) => updateTls({ pfxPath: e.target.value, pfx: undefined })}
          />
        )}

        {pfxInputType === 'base64' && (
          <div className="space-y-2">
            <Textarea
              rows={4}
              placeholder="Base64-encoded PFX content"
              value={pfxTextareaValue}
              onChange={(e) => updateTls({ pfx: e.target.value, pfxPath: undefined })}
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
          onChange={(e) => updateTls({ passphrase: e.target.value })}
          helperText="Password for the PFX certificate bundle"
        />
      </div>
    </div>
  );
};

const CaCertConfig: React.FC<
  TlsTabSharedProps & { showToast: (msg: string, type: string) => void }
> = ({ tls, updateTls, showToast }) => {
  const caInputType = tls?.caInputType;
  const caUploadVariant = caInputType === 'upload' ? 'default' : ('outline' as const);
  const caPathVariant = caInputType === 'path' ? 'default' : ('outline' as const);
  const caInlineVariant = caInputType === 'inline' ? 'default' : ('outline' as const);
  const caButtonLabel = tls?.ca ? 'Replace CA Certificate' : 'Choose CA File';

  const handleCaFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        updateTls({ ca: content, caPath: undefined });
        showToast('CA certificate uploaded successfully', 'success');
      };
      reader.readAsText(file);
    },
    [updateTls, showToast],
  );

  return (
    <div className="space-y-4">
      <h3 className="font-medium">CA Certificate (Optional)</h3>
      <div className="rounded-lg border border-border p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Provide a custom CA certificate to verify the server's certificate
        </p>
        <div className="flex gap-2">
          <Button variant={caUploadVariant} onClick={() => updateTls({ caInputType: 'upload' })}>
            <ShieldCheck className="mr-2 size-4" />
            Upload
          </Button>
          <Button variant={caPathVariant} onClick={() => updateTls({ caInputType: 'path' })}>
            <File className="mr-2 size-4" />
            File Path
          </Button>
          <Button variant={caInlineVariant} onClick={() => updateTls({ caInputType: 'inline' })}>
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
              onChange={handleCaFileChange}
            />
            <label htmlFor="tls-ca-upload">
              <Button variant="outline" asChild>
                <span>{caButtonLabel}</span>
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
            onChange={(e) => updateTls({ caPath: e.target.value, ca: undefined })}
          />
        )}

        {caInputType === 'inline' && (
          <Textarea
            rows={4}
            placeholder="-----BEGIN CERTIFICATE-----&#10;...CA certificate content...&#10;-----END CERTIFICATE-----"
            value={tls?.ca || ''}
            onChange={(e) => updateTls({ ca: e.target.value, caPath: undefined })}
          />
        )}
      </div>
    </div>
  );
};

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

  const tls = selectedTarget.config?.tls;
  const tlsEnabled = !!tls?.enabled;
  const certType = tls?.certificateType || 'none';
  const rejectUnauthorized = tls?.rejectUnauthorized !== false;

  const updateTls = useCallback(
    (patch: Partial<NonNullable<TlsConfig>>) => {
      updateCustomTarget('tls', { ...tls, ...patch });
    },
    [tls, updateCustomTarget],
  );

  const handleTlsEnabledChange = useCallback(
    (checked: boolean) => {
      if (checked) {
        updateCustomTarget('tls', {
          ...tls,
          enabled: true,
          rejectUnauthorized: tls?.rejectUnauthorized ?? true,
        });
      } else {
        updateCustomTarget('tls', undefined);
      }
    },
    [tls, updateCustomTarget],
  );

  const handleCertTypeChange = useCallback(
    (value: string) => {
      updateCustomTarget('tls', buildCertTypeUpdate(value, tls));
    },
    [tls, updateCustomTarget],
  );

  const handleMinVersionChange = useCallback(
    (value: string) => {
      updateTls({ minVersion: value === 'default' ? undefined : value });
    },
    [updateTls],
  );

  const handleMaxVersionChange = useCallback(
    (value: string) => {
      updateTls({ maxVersion: value === 'default' ? undefined : value });
    },
    [updateTls],
  );

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
        <Switch id="tls-enabled" checked={tlsEnabled} onCheckedChange={handleTlsEnabledChange} />
        <Label htmlFor="tls-enabled">Enable TLS configuration</Label>
      </div>

      {tlsEnabled && (
        <div className="mt-6 space-y-8">
          {/* Certificate Type Selection */}
          <div className="space-y-2">
            <Label>Certificate Type</Label>
            <Select value={certType} onValueChange={handleCertTypeChange}>
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

          {certType === 'pem' && (
            <PemCertConfig tls={tls} updateTls={updateTls} showToast={showToast} />
          )}

          {certType === 'jks' && (
            <JksCertConfig tls={tls} updateTls={updateTls} showToast={showToast} />
          )}

          {certType === 'pfx' && (
            <PfxCertConfig tls={tls} updateTls={updateTls} showToast={showToast} />
          )}

          <CaCertConfig tls={tls} updateTls={updateTls} showToast={showToast} />

          {/* Security Options */}
          <div className="space-y-4">
            <h3 className="font-medium">Security Options</h3>
            <div className="rounded-lg border border-border p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="reject-unauthorized"
                  checked={rejectUnauthorized}
                  onCheckedChange={(checked) => updateTls({ rejectUnauthorized: checked })}
                />
                <Label htmlFor="reject-unauthorized">Reject Unauthorized Certificates</Label>
              </div>
              {tls?.rejectUnauthorized === false && (
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
                  value={tls?.servername || ''}
                  onChange={(e) => updateTls({ servername: e.target.value })}
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
                  value={tls?.ciphers || ''}
                  onChange={(e) => updateTls({ ciphers: e.target.value })}
                />
                <p className="text-sm text-muted-foreground">
                  Specify allowed cipher suites (OpenSSL format)
                </p>
              </div>

              <div className="space-y-2">
                <Label>Minimum TLS Version</Label>
                <Select value={tls?.minVersion || 'default'} onValueChange={handleMinVersionChange}>
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
                <Select value={tls?.maxVersion || 'default'} onValueChange={handleMaxVersionChange}>
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
                  onChange={(e) => updateTls({ secureProtocol: e.target.value })}
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
