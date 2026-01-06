import { useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@app/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { ExpandMoreIcon, SettingsIcon } from '@app/components/ui/icons';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { cn } from '@app/lib/utils';
import { useStore } from '@app/stores/evalConfig';

interface EnvSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function EnvSection({ title, defaultOpen = false, children }: EnvSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border-b border-border">
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-left font-medium hover:bg-muted/50 transition-colors">
        {title}
        <ExpandMoreIcon className={cn('size-4 transition-transform', isOpen && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-4 pb-4 space-y-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

interface EnvFieldProps {
  label: string;
  envKey: string;
  value: string;
  onChange: (key: string, value: string) => void;
}

function EnvField({ label, envKey, value, onChange }: EnvFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={envKey}>{label}</Label>
      <Input
        id={envKey}
        type="password"
        value={value}
        onChange={(e) => onChange(envKey, e.target.value)}
        placeholder={`Enter ${label.toLowerCase()}`}
      />
    </div>
  );
}

const ConfigureEnvButton = () => {
  const { config, updateConfig } = useStore();
  const defaultEnv = config.env || {};
  const [dialogOpen, setDialogOpen] = useState(false);
  const [env, setEnv] = useState<Record<string, string>>(defaultEnv as Record<string, string>);

  const handleOpen = () => {
    setDialogOpen(true);
  };

  const handleClose = () => {
    setDialogOpen(false);
  };

  const handleSave = () => {
    updateConfig({ env });
    handleClose();
  };

  const handleEnvChange = (key: string, value: string) => {
    setEnv({ ...env, [key]: value });
  };

  return (
    <>
      <Button variant="outline" onClick={handleOpen}>
        <SettingsIcon className="size-4 mr-2" />
        API keys
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Provider Settings</DialogTitle>
          </DialogHeader>

          <div className="border border-border rounded-lg overflow-hidden">
            <EnvSection title="OpenAI" defaultOpen>
              <EnvField
                label="OpenAI API key"
                envKey="OPENAI_API_KEY"
                value={env.OPENAI_API_KEY || ''}
                onChange={handleEnvChange}
              />
              <EnvField
                label="OpenAI API host"
                envKey="OPENAI_API_HOST"
                value={env.OPENAI_API_HOST || ''}
                onChange={handleEnvChange}
              />
              <EnvField
                label="OpenAI organization"
                envKey="OPENAI_ORGANIZATION"
                value={env.OPENAI_ORGANIZATION || ''}
                onChange={handleEnvChange}
              />
            </EnvSection>

            <EnvSection title="Azure">
              <EnvField
                label="Azure API key"
                envKey="AZURE_API_KEY"
                value={env.AZURE_API_KEY || env.AZURE_OPENAI_API_KEY || ''}
                onChange={handleEnvChange}
              />
            </EnvSection>

            <EnvSection title="Amazon Bedrock">
              <EnvField
                label="Bedrock Region"
                envKey="AWS_BEDROCK_REGION"
                value={env.AWS_BEDROCK_REGION || ''}
                onChange={handleEnvChange}
              />
            </EnvSection>

            <EnvSection title="Anthropic">
              <EnvField
                label="Anthropic API key"
                envKey="ANTHROPIC_API_KEY"
                value={env.ANTHROPIC_API_KEY || ''}
                onChange={handleEnvChange}
              />
            </EnvSection>

            <EnvSection title="Google Vertex AI">
              <EnvField
                label="Vertex API Key"
                envKey="VERTEX_API_KEY"
                value={env.VERTEX_API_KEY || ''}
                onChange={handleEnvChange}
              />
              <EnvField
                label="Vertex Project ID"
                envKey="VERTEX_PROJECT_ID"
                value={env.VERTEX_PROJECT_ID || ''}
                onChange={handleEnvChange}
              />
              <EnvField
                label="Vertex Region"
                envKey="VERTEX_REGION"
                value={env.VERTEX_REGION || ''}
                onChange={handleEnvChange}
              />
            </EnvSection>

            <EnvSection title="Replicate">
              <EnvField
                label="Replicate API key"
                envKey="REPLICATE_API_KEY"
                value={env.REPLICATE_API_KEY || ''}
                onChange={handleEnvChange}
              />
            </EnvSection>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ConfigureEnvButton;
