import { Button } from '@app/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@app/components/ui/dialog';
import { ChevronRight } from 'lucide-react';

interface SetupProps {
  open: boolean;
  onClose: () => void;
}

export default function Setup({ open, onClose }: SetupProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>LLM Red Team Configuration Setup</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <p className="text-sm text-foreground">
            You are about to set up several components that define how your AI system will be
            tested:
          </p>
          <ul className="list-disc space-y-2 pl-6 text-sm">
            <li>
              <strong>Application:</strong> Metadata used to tailor the adversarial inputs to your
              application.
            </li>
            <li>
              <strong>Targets:</strong> The specific endpoints, models, or components of your AI
              system that will be tested.
            </li>
            <li>
              <strong>Plugins:</strong> Modules that generate diverse adversarial inputs, simulating
              various types of attacks or edge cases.
            </li>
            <li>
              <strong>Strategies:</strong> Define how adversarial inputs are delivered to your
              system, including techniques like jailbreaking and prompt injection.
            </li>
          </ul>
          <div className="flex items-center justify-between pt-4">
            <a
              href="https://www.promptfoo.dev/docs/red-team/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              Learn more about LLM red teaming
            </a>
            <Button onClick={onClose} className="px-6">
              Get Started
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
