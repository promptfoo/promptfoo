import React from 'react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@app/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { cn } from '@app/lib/utils';
import yaml from 'js-yaml';
import { Check, ClipboardCopy, Download } from 'lucide-react';
import { useTableStore } from './store';

interface ConfigModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ConfigModal({ open, onClose }: ConfigModalProps) {
  const { config } = useTableStore();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = React.useState(false);
  const [yamlConfig, setYamlConfig] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setYamlConfig(yaml.dump(config));
    }
  }, [open, config]);

  const handleCopyClick = () => {
    if (textareaRef.current) {
      textareaRef.current.select();
      document.execCommand('copy');
      setCopied(true);
    }
  };

  const handleDownloadClick = () => {
    const blob = new Blob([yamlConfig], { type: 'text/yaml;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = 'config.yaml';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  };

  const handleClose = () => {
    setCopied(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle className="flex-1">Config</DialogTitle>
            <div className="flex gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleCopyClick}
                    className="p-2 rounded hover:bg-muted transition-colors"
                  >
                    {copied ? <Check className="size-5" /> : <ClipboardCopy className="size-5" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copy to clipboard</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleDownloadClick}
                    className="p-2 rounded hover:bg-muted transition-colors"
                  >
                    <Download className="size-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Download .yaml</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <textarea
            ref={textareaRef}
            readOnly
            value={yamlConfig}
            className={cn(
              'size-full min-h-[500px] font-mono text-sm p-3 rounded border border-border',
              'bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring resize-none',
            )}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
