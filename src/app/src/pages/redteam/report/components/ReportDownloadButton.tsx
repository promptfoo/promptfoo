import { useState } from 'react';

import { Button } from '@app/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@app/components/ui/dropdown-menu';
import { DownloadIcon } from '@app/components/ui/icons';
import { Spinner } from '@app/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@app/components/ui/tooltip';
import { useCustomPoliciesMap } from '@app/hooks/useCustomPoliciesMap';
import { useTelemetry } from '@app/hooks/useTelemetry';
import { displayNameOverrides } from '@promptfoo/redteam/constants';
import { stringify } from 'csv-stringify/browser/esm/sync';
import { getPluginIdFromResult, getStrategyIdFromTest } from '../components/shared';
import type { EvaluateResult, ResultsFile } from '@promptfoo/types';

interface ReportDownloadButtonProps {
  evalDescription: string;
  evalData: ResultsFile;
}

const ReportDownloadButton = ({ evalDescription, evalData }: ReportDownloadButtonProps) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const { recordEvent } = useTelemetry();

  const customPoliciesById = useCustomPoliciesMap(evalData.config?.redteam?.plugins ?? []);

  function convertEvalDataToCsv(evalData: ResultsFile): string {
    const rows = evalData.results.results.map((result: EvaluateResult, index: number) => {
      let pluginDisplayName = null;

      const pluginId = getPluginIdFromResult(result);
      if (pluginId) {
        const customPolicy = customPoliciesById[pluginId];
        if (customPolicy) {
          pluginDisplayName = customPolicy.name;
        } else {
          pluginDisplayName =
            displayNameOverrides[pluginId as keyof typeof displayNameOverrides] || pluginId;
        }
      }

      return {
        'Test ID': index + 1,
        Plugin: pluginDisplayName,
        'Plugin ID': pluginId ?? '',
        // TODO: getStrategyIdFromTest expects TestWithMetadata but we're passing testCase directly
        // biome-ignore lint/suspicious/noExplicitAny: Type mismatch between AtomicTestCase and TestWithMetadata
        Strategy: getStrategyIdFromTest(result.testCase as any),
        Target: result.provider.label || result.provider.id || '',
        Prompt:
          result.vars.query?.toString() ||
          result.vars.prompt?.toString() ||
          result.prompt.raw ||
          '',
        Response: result.response?.output || '',
        Pass:
          result.gradingResult?.pass === true
            ? `Pass${result.gradingResult?.score === undefined ? '' : ` (${result.gradingResult.score})`}`
            : `Fail${result.gradingResult?.score === undefined ? '' : ` (${result.gradingResult.score})`}`,
        Score: result.gradingResult?.score || '',
        Reason: result.gradingResult?.reason || '',
        Timestamp: new Date(evalData.createdAt).toISOString(),
      };
    });

    return stringify(rows, {
      header: true,
      quoted: true,
      quoted_string: true,
      quoted_empty: true,
    });
  }

  const getFilename = (extension: string) => {
    return evalDescription
      ? `report_${evalDescription
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')}.${extension}`
      : `report.${extension}`;
  };

  const handleCsvDownload = () => {
    setIsDownloading(true);

    // Track report export
    recordEvent('webui_action', {
      action: 'redteam_report_export',
      format: 'csv',
    });

    try {
      const csv = convertEvalDataToCsv(evalData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', getFilename('csv'));
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Error generating CSV:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleJsonDownload = () => {
    setIsDownloading(true);

    // Track report export
    recordEvent('webui_action', {
      action: 'redteam_report_export',
      format: 'json',
    });

    try {
      const jsonData = JSON.stringify(evalData, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8;' });
      const link = document.createElement('a');
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', getFilename('json'));
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error('Error generating JSON:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePdfDownload = () => {
    // Track report export
    recordEvent('webui_action', {
      action: 'redteam_report_export',
      format: 'pdf',
    });
    window.print();
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
              aria-label="download report"
              disabled={isDownloading}
              className="mt-1 text-muted-foreground hover:text-foreground"
            >
              {isDownloading ? <Spinner size="sm" /> : <DownloadIcon className="size-5" />}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        {isHovering && !isDownloading && <TooltipContent>Download report</TooltipContent>}
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handlePdfDownload}>PDF</DropdownMenuItem>
        <DropdownMenuItem onClick={handleCsvDownload}>CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={handleJsonDownload}>JSON</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ReportDownloadButton;
