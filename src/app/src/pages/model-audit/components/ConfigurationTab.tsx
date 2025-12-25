import { Alert, AlertDescription } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { PlayArrowIcon, SettingsIcon } from '@app/components/ui/icons';
import { Spinner } from '@app/components/ui/spinner';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import InstallationGuide from './InstallationGuide';
import PathSelector from './PathSelector';

import type { ScanPath } from '../ModelAudit.types';

interface ConfigurationTabProps {
  paths: ScanPath[];
  onAddPath: (path: ScanPath) => void;
  onRemovePath: (index: number) => void;
  onShowOptions: () => void;
  onScan: () => void;
  isScanning: boolean;
  error: string | null;
  onClearError: () => void;
  currentWorkingDir?: string;
  installationStatus?: {
    checking: boolean;
    installed: boolean | null;
    error?: string | null;
  };
  onRetryInstallationCheck?: () => void;
}

export default function ConfigurationTab({
  paths,
  onAddPath,
  onRemovePath,
  onShowOptions,
  onScan,
  isScanning,
  error,
  onClearError,
  currentWorkingDir,
  installationStatus,
  onRetryInstallationCheck,
}: ConfigurationTabProps) {
  const isCheckingInstallation = installationStatus?.checking ?? false;
  const isNotInstalled = installationStatus?.installed === false;
  const installationUnknown = installationStatus?.installed === null;
  const installationError = installationStatus?.error ?? null;

  const scanButtonDisabled = isScanning || paths.length === 0 || isCheckingInstallation;

  const getScanButtonText = () => {
    if (isScanning) {
      return 'Scanning...';
    }
    if (isCheckingInstallation) {
      return 'Checking Installation...';
    }
    if (isNotInstalled) {
      return 'ModelAudit Not Installed';
    }
    if (installationUnknown) {
      return 'Start Security Scan (Checking...)';
    }
    return 'Start Security Scan';
  };

  const getScanButtonTooltip = () => {
    if (paths.length === 0) {
      return 'Add at least one path to scan';
    }
    if (isCheckingInstallation) {
      return 'Checking if ModelAudit is installed...';
    }
    if (isNotInstalled) {
      return 'Click to see installation instructions';
    }
    if (installationUnknown) {
      return 'Installation status will be verified when you click';
    }
    return '';
  };

  return (
    <div className="space-y-6">
      {/* Installation Warning - Show prominently if not installed */}
      {isNotInstalled && onRetryInstallationCheck && (
        <InstallationGuide
          onRetryCheck={onRetryInstallationCheck}
          isChecking={isCheckingInstallation}
          error={installationError}
        />
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Select Models</h2>
        <Button variant="outline" onClick={onShowOptions}>
          <SettingsIcon className="h-4 w-4 mr-2" />
          Advanced Options
        </Button>
      </div>

      <PathSelector
        paths={paths}
        onAddPath={onAddPath}
        onRemovePath={onRemovePath}
        currentWorkingDir={currentWorkingDir}
      />

      <div className="mt-8">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button
                  size="lg"
                  className={cn(
                    'w-full py-6 text-lg font-semibold',
                    isNotInstalled && 'bg-destructive hover:bg-destructive/90',
                  )}
                  onClick={onScan}
                  disabled={scanButtonDisabled}
                >
                  {isScanning || isCheckingInstallation ? (
                    <Spinner size="sm" className="mr-2" />
                  ) : (
                    <PlayArrowIcon className="h-5 w-5 mr-2" />
                  )}
                  {getScanButtonText()}
                </Button>
              </div>
            </TooltipTrigger>
            {getScanButtonTooltip() && (
              <TooltipContent side="top">
                <p>{getScanButtonTooltip()}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {error && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription className="flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={onClearError}
                className="text-sm underline hover:no-underline"
              >
                Dismiss
              </button>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
