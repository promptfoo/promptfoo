import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { HIDDEN_METADATA_KEYS } from '@app/constants';
import {
  determinePolicyTypeFromId,
  makeCustomPolicyCloudUrl,
} from '@promptfoo/redteam/plugins/policy/utils';
import { Check, Copy, ExternalLink, SlidersHorizontal } from 'lucide-react';
import { ellipsize } from '../../../../../util/text';

import type { CloudConfigData } from '../../../hooks/useCloudConfig';

const isValidUrl = (str: string): boolean => {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
};

export interface ExpandedMetadataState {
  [key: string]: {
    expanded: boolean;
    lastClickTime: number;
  };
}

interface MetadataPanelProps {
  metadata?: Record<string, unknown>;
  expandedMetadata: ExpandedMetadataState;
  copiedFields: Record<string, boolean>;
  onMetadataClick: (key: string) => void;
  onCopy: (key: string, text: string) => void;
  onApplyFilter: (field: string, value: string, operator?: 'equals' | 'contains') => void;
  cloudConfig?: CloudConfigData | null;
}

export function MetadataPanel({
  metadata,
  expandedMetadata,
  copiedFields,
  onMetadataClick,
  onCopy,
  onApplyFilter,
  cloudConfig,
}: MetadataPanelProps) {
  if (!metadata) {
    return null;
  }

  const metadataEntries = Object.entries(metadata)
    .filter((d) => !HIDDEN_METADATA_KEYS.includes(d[0]))
    .sort((a, b) => a[0].localeCompare(b[0]));

  if (metadataEntries.length === 0) {
    return null;
  }

  return (
    <div className="border border-border rounded overflow-auto">
      <table className="w-full text-sm table-fixed">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="w-1/4 p-2 text-left font-semibold">Key</th>
            <th className="w-[calc(75%-80px)] p-2 text-left font-semibold">Value</th>
            <th className="w-20 p-2" />
          </tr>
        </thead>
        <tbody>
          {metadataEntries.map(([key, value]) => {
            const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
            let cell: React.ReactNode;

            // Is reusable custom policy name?
            if (key === 'policyName' && cloudConfig?.isEnabled && cloudConfig?.appUrl) {
              const policyIdValue = metadataEntries.find(([k]) => k === 'policyId')?.[1];
              const policyId: string | null =
                typeof policyIdValue === 'string' ? policyIdValue : null;

              if (policyId) {
                cell = (
                  <td className="p-2 whitespace-pre-wrap break-words">
                    <div className="flex items-center gap-2">
                      <span>{stringValue}</span>
                      {determinePolicyTypeFromId(policyId) === 'reusable' &&
                        cloudConfig?.appUrl && (
                          <a
                            target="_blank"
                            rel="noopener noreferrer"
                            href={makeCustomPolicyCloudUrl(cloudConfig?.appUrl, policyId)}
                            className="flex items-center gap-1 text-primary hover:underline"
                            data-testid="pf-cloud-policy-detail-link"
                          >
                            <span>View policy in Promptfoo Cloud</span>
                            <ExternalLink className="size-3.5" />
                          </a>
                        )}
                    </div>
                  </td>
                );
              } else {
                cell = <td className="p-2 whitespace-pre-wrap break-words">{stringValue}</td>;
              }
            }
            // Is URL?
            else if (typeof value === 'string' && isValidUrl(value)) {
              cell = (
                <td className="p-2 whitespace-pre-wrap break-all">
                  <a
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {value}
                  </a>
                </td>
              );
            } else {
              const truncatedValue = ellipsize(stringValue, 300);
              cell = (
                <td
                  className="p-2 whitespace-pre-wrap break-words cursor-pointer"
                  onClick={() => onMetadataClick(key)}
                >
                  {expandedMetadata[key]?.expanded ? stringValue : truncatedValue}
                </td>
              );
            }

            return (
              <tr key={key} className="border-b border-border last:border-0">
                <td className="p-2 break-words">{key}</td>
                {cell}

                <td className="p-2">
                  <div className="flex gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onCopy(key, stringValue)}
                          className="p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                          aria-label={`Copy metadata value for ${key}`}
                        >
                          {copiedFields[key] ? (
                            <Check className="size-4" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Copy value</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => onApplyFilter(key, stringValue)}
                          className="p-1 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                          aria-label={`Filter by ${key}`}
                        >
                          <SlidersHorizontal className="size-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>Filter by value (replaces existing filters)</TooltipContent>
                    </Tooltip>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
