import { useEffect, useRef, useState } from 'react';

import { Alert, AlertContent, AlertDescription, AlertTitle } from '@app/components/ui/alert';
import { Button } from '@app/components/ui/button';
import { Card, CardContent } from '@app/components/ui/card';
import {
  CheckCircleIcon,
  ContentCopyIcon,
  OpenInNewIcon,
  WarningIcon,
} from '@app/components/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';

interface InstallationGuideProps {
  onRetryCheck: () => void;
  isChecking: boolean;
  error?: string | null;
}

export default function InstallationGuide({
  onRetryCheck,
  isChecking,
  error,
}: InstallationGuideProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const installCommand = 'pip install modelaudit';

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(installCommand);
      setCopied(true);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <Card className="border-amber-400/50 bg-amber-50/50 dark:bg-amber-950/20">
      <CardContent className="p-6">
        <Alert variant="warning" className="mb-6">
          <WarningIcon className="size-4" />
          <AlertContent>
            <AlertTitle>ModelAudit CLI Not Found</AlertTitle>
            <AlertDescription>
              {error ||
                'The modelaudit command-line tool needs to be installed to run security scans.'}
            </AlertDescription>
          </AlertContent>
        </Alert>

        <h3 className="text-lg font-semibold mb-4">Quick Installation</h3>

        <div
          className="flex items-center justify-between p-4 rounded-lg bg-muted font-mono text-sm mb-4"
          role="region"
          aria-label="Installation command"
        >
          <code>{installCommand}</code>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                aria-label={copied ? 'Command copied to clipboard' : 'Copy installation command'}
              >
                {copied ? (
                  <CheckCircleIcon className="size-4 text-green-600" />
                ) : (
                  <ContentCopyIcon className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copied ? 'Copied!' : 'Copy command'}</TooltipContent>
          </Tooltip>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          Make sure you have Python 3.8+ installed. After installation, run the command in your
          terminal.
        </p>

        <div className="flex flex-wrap gap-3 mb-6">
          <Button onClick={onRetryCheck} disabled={isChecking}>
            {isChecking ? 'Checking...' : 'Check Again'}
          </Button>
          <Button variant="outline" asChild>
            <a
              href="https://www.promptfoo.dev/docs/model-audit/"
              target="_blank"
              rel="noopener noreferrer"
            >
              View Documentation
              <OpenInNewIcon className="size-4 ml-2" />
            </a>
          </Button>
        </div>

        <h4 className="text-sm font-medium text-muted-foreground mb-3">Troubleshooting</h4>
        <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
          <li>
            Make sure <code className="bg-muted px-1 rounded">pip</code> is available in your PATH
          </li>
          <li>
            Try using <code className="bg-muted px-1 rounded">pip3 install modelaudit</code> if{' '}
            <code className="bg-muted px-1 rounded">pip</code> doesn't work
          </li>
          <li>If using a virtual environment, ensure it's activated</li>
          <li>After installation, you may need to restart the Promptfoo server</li>
        </ul>

        <div className="mt-6 pt-4 border-t border-border/50 text-sm text-muted-foreground">
          Need help?{' '}
          <a
            href="https://github.com/promptfoo/promptfoo/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            Open an issue on GitHub
          </a>{' '}
          or check the{' '}
          <a
            href="https://www.promptfoo.dev/docs/model-audit/installation/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            installation guide
          </a>
          .
        </div>
      </CardContent>
    </Card>
  );
}
