import React from 'react';

import { Button } from '@app/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@app/components/ui/dialog';
import { Separator } from '@app/components/ui/separator';
import { RotateCcw, Settings, X } from 'lucide-react';
import SettingsPanel from './components/SettingsPanel';
import { useSettingsState } from './hooks/useSettingsState';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

const TableSettingsModal = ({ open, onClose }: SettingsModalProps) => {
  const { resetToDefaults } = useSettingsState(open);

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-[680px] p-0 overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between p-5 pb-3 border-b border-border/10">
          <div className="flex items-center gap-3">
            <Settings className="h-7 w-7 text-primary opacity-90" />
            <DialogTitle className="text-lg font-semibold">Table Settings</DialogTitle>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 rounded hover:bg-primary/10 transition-colors"
            aria-label="close"
          >
            <X className="h-5 w-5" />
          </button>
        </DialogHeader>

        <div className="p-0">
          <SettingsPanel />
        </div>

        <Separator className="opacity-60" />

        <DialogFooter className="px-5 py-3 justify-between">
          <Button
            onClick={resetToDefaults}
            variant="ghost"
            size="sm"
            className="rounded-full px-4"
            aria-label="Reset settings to defaults"
            title="Reset all settings to their default values"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
          <Button onClick={handleClose} className="rounded-full px-6 font-semibold">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default React.memo(TableSettingsModal);
