import React from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { HelperText } from '@app/components/ui/helper-text';
import { Input } from '@app/components/ui/input';
import { Label } from '@app/components/ui/label';
import { isJavascriptFile } from '@promptfoo/util/fileExtensions';
import type { ProviderOptions } from '@promptfoo/types';

interface AddLocalProviderDialogProps {
  open: boolean;
  onClose: () => void;
  onAdd: (provider: ProviderOptions) => void;
}

const AddLocalProviderDialog = ({ open, onClose, onAdd }: AddLocalProviderDialogProps) => {
  const [path, setPath] = React.useState('');
  const [error, setError] = React.useState('');

  const handleSubmit = () => {
    const trimmedPath = path.trim();

    if (!trimmedPath) {
      setError('Path is required');
      return;
    }

    if (
      !isJavascriptFile(trimmedPath) &&
      !trimmedPath.endsWith('.py') &&
      !trimmedPath.endsWith('.go') &&
      !trimmedPath.endsWith('.rb')
    ) {
      setError('Only javascript, python, go and ruby files are supported');
      return;
    }

    const provider: ProviderOptions = {
      id: `file://${trimmedPath}`,
      config: {},
      label: trimmedPath.split('/').pop() || trimmedPath,
    };

    onAdd(provider);
    onClose();
    setPath('');
    setError('');
  };

  const handleClose = () => {
    setPath('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Local Provider</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Enter the absolute path to your local provider implementation (.py, .js or .rb file).
            This file will be referenced in your promptfoo configuration.
          </p>

          <div className="space-y-2">
            <Label htmlFor="provider-path">Provider Path</Label>
            <Input
              id="provider-path"
              placeholder="/absolute/path/to/your/provider.py"
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                setError('');
              }}
              className={error ? 'border-destructive' : ''}
            />
            <HelperText error={!!error}>
              {error || 'Example: /home/user/projects/my-provider.py'}
            </HelperText>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit}>Add Provider</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddLocalProviderDialog;
