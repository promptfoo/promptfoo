import React from 'react';

import { Button } from '@app/components/ui/button';
import { CheckboxWithLabel } from '@app/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@app/components/ui/dialog';
import { SliderWithLabel } from '@app/components/ui/slider';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@app/components/ui/tooltip';
import { Settings } from 'lucide-react';
import { useReportStore } from './store';

const ReportSettingsDialogButton = () => {
  const {
    showPercentagesOnRiskCards,
    setShowPercentagesOnRiskCards,
    pluginPassRateThreshold,
    setPluginPassRateThreshold,
  } = useReportStore();
  const [open, setOpen] = React.useState(false);

  // Handle NaN and out-of-range values
  const safeThreshold = Number.isNaN(pluginPassRateThreshold)
    ? 0
    : Math.min(1, Math.max(0, pluginPassRateThreshold || 0));

  return (
    <TooltipProvider>
      <Dialog open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="settings">
                <Settings className="h-5 w-5" />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent side="top">Report Settings</TooltipContent>
        </Tooltip>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Report Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <CheckboxWithLabel
              label="Show percentages on risk cards"
              checked={showPercentagesOnRiskCards}
              onChange={setShowPercentagesOnRiskCards}
            />

            <SliderWithLabel
              label="Plugin Pass Rate Threshold"
              description="Sets the threshold for considering a plugin as passed on the risk cards."
              value={safeThreshold}
              onValueChange={setPluginPassRateThreshold}
              min={0}
              max={1}
              step={0.05}
              showMarks
              formatValue={(v) => `${(v * 100).toFixed(0)}%`}
            />
          </div>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
};

export default ReportSettingsDialogButton;
