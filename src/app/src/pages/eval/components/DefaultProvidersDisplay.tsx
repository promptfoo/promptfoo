import { Chip } from '@app/components/ui/chip';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { Cpu } from 'lucide-react';
import type { DefaultProviderSelectionInfo } from '@promptfoo/types/providers';

interface DefaultProvidersDisplayProps {
  info: DefaultProviderSelectionInfo;
}

export function DefaultProvidersDisplay({ info }: DefaultProvidersDisplayProps) {
  const { selectedProvider, reason, detectedCredentials, skippedProviders, providerSlots } = info;

  // Build the tooltip content
  const tooltipContent = (
    <div className="space-y-3 max-w-xs">
      <div>
        <p className="text-sm font-medium">Why {selectedProvider}?</p>
        <p className="text-xs text-muted-foreground">{reason}</p>
      </div>

      {detectedCredentials.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1">Detected credentials:</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {detectedCredentials.map((cred) => (
              <li key={cred} className="flex items-center gap-1">
                <span className="text-emerald-500">✓</span> {cred}
              </li>
            ))}
          </ul>
        </div>
      )}

      {skippedProviders.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1">Skipped providers:</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {skippedProviders.map((provider) => (
              <li key={provider.name} className="flex items-start gap-1">
                <span className="text-muted-foreground/50">✗</span>
                <span>
                  {provider.name}: {provider.reason}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {Object.keys(providerSlots).length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1">Provider assignments:</p>
          <ul className="text-xs text-muted-foreground space-y-0.5">
            {Object.entries(providerSlots).map(([slot, slotInfo]) => (
              <li key={slot}>
                <span className="capitalize">{slot}:</span>{' '}
                <span className="font-mono text-[10px]">{slotInfo?.model || slotInfo?.id}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="pt-2 border-t border-border/50">
        <p className="text-xs text-muted-foreground">
          Override: Set{' '}
          <code className="text-[10px] bg-muted px-1 rounded">defaultTest.options.provider</code> in
          config
        </p>
      </div>
    </div>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Chip
          label="GRADING"
          interactive={false}
          trailingIcon={<Cpu className="size-3.5 text-muted-foreground" />}
        >
          {selectedProvider}
        </Chip>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="p-3">
        {tooltipContent}
      </TooltipContent>
    </Tooltip>
  );
}
