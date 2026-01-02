import { Button } from '@app/components/ui/button';
import { Card } from '@app/components/ui/card';
import { SecurityIcon } from '@app/components/ui/icons';

export default function InstallationCheck() {
  return (
    <div className="container max-w-3xl mx-auto mt-16">
      <Card className="p-12 text-center">
        <SecurityIcon className="size-16 text-destructive mx-auto mb-6" />
        <h1 className="text-3xl font-bold mb-2">ModelAudit Not Installed</h1>
        <p className="text-muted-foreground mb-6">
          The ModelAudit Python package is required to scan ML models for security vulnerabilities.
        </p>
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
