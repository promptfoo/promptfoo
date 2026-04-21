import React, { useEffect, useState } from 'react';

import { Alert, AlertContent, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { Spinner } from '@app/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { type ApiHealthStatus, useApiHealth } from '@app/hooks/useApiHealth';
import { cn } from '@app/lib/utils';
import useApiConfig from '@app/stores/apiConfig';
import { AlertCircle, CheckCircle, Circle, RefreshCw } from 'lucide-react';

const StatusIndicator = ({ status }: { status: ApiHealthStatus | 'loading' }) => {
  const statusConfig: Record<
    ApiHealthStatus | 'loading',
    { colorClass: string; text: string; Icon: typeof Circle }
  > = {
    connected: {
      colorClass: 'text-emerald-500',
      text: 'Connected to promptfoo API',
      Icon: CheckCircle,
    },
    blocked: {
      colorClass: 'text-red-500',
      text: 'Cannot connect to promptfoo API',
      Icon: AlertCircle,
    },
    loading: { colorClass: 'text-blue-500', text: 'Checking connection...', Icon: Circle },
    unknown: { colorClass: 'text-gray-400', text: 'Checking connection status...', Icon: Circle },
    disabled: { colorClass: 'text-gray-400', text: 'Remote generation is disabled', Icon: Circle },
  };

  const config = statusConfig[status];
  const Icon = config.Icon;

  return (
    <div className="flex items-center gap-2">
      <Icon className={cn('size-3', config.colorClass)} />
      <span className="text-sm">{config.text}</span>
    </div>
  );
};

export default function ApiSettingsModal<T extends { open: boolean; onClose: () => void }>({
  open,
  onClose,
}: T) {
  const { apiBaseUrl, setApiBaseUrl, enablePersistApiBaseUrl } = useApiConfig();
  const [tempApiBaseUrl, setTempApiBaseUrl] = useState(apiBaseUrl || '');
  const {
    data: { status, message },
    refetch: checkHealth,
    isLoading: isChecking,
  } = useApiHealth();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (open) {
      checkHealth();
    }
  }, [open, checkHealth]);

  useEffect(() => {
    setTempApiBaseUrl(apiBaseUrl || '');
  }, [apiBaseUrl]);

  const handleApiBaseUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setTempApiBaseUrl(event.target.value);
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setApiBaseUrl(tempApiBaseUrl);
      enablePersistApiBaseUrl();
      await checkHealth();
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const isFormDisabled = isChecking || isSaving;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>API and Sharing Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <StatusIndicator status={isChecking ? 'loading' : status} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => checkHealth()}
                  disabled={isChecking}
                  className="size-8"
                  aria-label="Check connection"
                >
                  {isChecking ? <Spinner size="sm" /> : <RefreshCw className="size-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Check connection</TooltipContent>
            </Tooltip>
          </div>

          {message && status !== 'unknown' && !isChecking && (
            <Alert variant={status === 'connected' ? 'success' : 'destructive'}>
              {status === 'connected' ? (
                <CheckCircle className="size-4" />
              ) : (
                <AlertCircle className="size-4" />
              )}
              <AlertContent>
                <AlertDescription>{message}</AlertDescription>
              </AlertContent>
            </Alert>
          )}

          <div className="space-y-2">
            <h3 className="text-base font-semibold">API</h3>
            <div className="space-y-1.5">
              <Label htmlFor="api-base-url">API Base URL</Label>
              <Input
                id="api-base-url"
                value={tempApiBaseUrl}
                onChange={handleApiBaseUrlChange}
                disabled={isFormDisabled}
                placeholder="Enter API base URL"
              />
              <p className="text-xs text-muted-foreground">
                The promptfoo API the webview will connect to
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isFormDisabled}>
            Close
          </Button>
          <Button onClick={handleSave} disabled={isFormDisabled}>
            {isSaving && <Spinner size="sm" className="mr-2" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
