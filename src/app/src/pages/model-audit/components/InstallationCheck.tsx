import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { SecurityIcon } from '@app/components/ui/icons';
import { Typography } from '@app/components/ui/typography';

export default function InstallationCheck() {
  return (
    <div className="container max-w-3xl mx-auto mt-16">
      <Card className="p-12 text-center">
        <SecurityIcon className="h-16 w-16 text-destructive mx-auto mb-6" />
        <Typography variant="pageTitle" as="h1" weight="bold" className="mb-2">
          ModelAudit Not Installed
        </Typography>
        <Typography variant="muted" className="mb-6">
          The ModelAudit Python package is required to scan ML models for security vulnerabilities.
        </Typography>
        <Card className="p-6 bg-muted/50 max-w-md mx-auto mb-6">
          <p className="font-mono font-medium">pip install modelaudit</p>
        </Card>
        <Button asChild>
          <a
            href="https://www.promptfoo.dev/docs/model-audit/"
            target="_blank"
            rel="noopener noreferrer"
          >
            View Documentation
          </a>
        </Button>
      </Card>
    </div>
  );
}
