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
import {
  classifyAgentOutcome,
  displayNameOverrides,
  getAgentOutcomeCase,
  isAgentOutcomePlugin,
} from '@promptfoo/redteam/constants';
import { ResultFailureReason } from '@promptfoo/types/results';
import { stringify } from 'csv-stringify/browser/esm/sync';
import {
  getPluginIdFromResult,
  getStrategyIdFromTest,
  reportRowPassed,
} from '../components/shared';
import type { EvaluateResult, ResultsFile } from '@promptfoo/types';

interface ReportDownloadButtonProps {
  evalDescription: string;
  evalData: ResultsFile;
}

function outcomeColumns(result: EvaluateResult, pluginId: string | null, isError: boolean) {
  const classification = classifyAgentOutcome(result, pluginId);
  return {
    'Trial Variant': getAgentOutcomeCase(result.testCase)?.variant ?? '',
    'Eligible Attack': !isError && (!classification || classification === 'attack') ? 'Yes' : 'No',
  };
}

const ReportDownloadButton = ({ evalDescription, evalData }: ReportDownloadButtonProps) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const { recordEvent } = useTelemetry();

  const customPoliciesById = useCustomPoliciesMap(evalData.config?.redteam?.plugins ?? []);

  function convertEvalDataToCsv(evalData: ResultsFile): string {
    const hasOutcomes = evalData.results.results.some((result) =>
      isAgentOutcomePlugin(getPluginIdFromResult(result) ?? ''),
    );
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

      const error = result.failureReason === ResultFailureReason.ERROR;
      const assigned = getAgentOutcomeCase(result.testCase);
      const score = result.gradingResult?.score ?? result.score;
      const verdict = error ? 'Error' : reportRowPassed(result) ? 'Pass' : 'Fail';
      return {
        'Test ID': index + 1,
        Plugin: pluginDisplayName,
        'Plugin ID': pluginId ?? '',
        ...(hasOutcomes && outcomeColumns(result, pluginId, error)),
        Strategy: getStrategyIdFromTest({ result }),
        Target: result.provider.label || result.provider.id || '',
        Prompt:
          assigned?.message ||
          result.vars.query?.toString() ||
          result.vars.prompt?.toString() ||
          result.prompt.raw ||
          '',
        Response: result.response?.output || '',
        Pass: score == null || error ? verdict : `${verdict} (${score})`,
        Score: score ?? '',
        Reason: result.gradingResult?.reason ?? result.error ?? '',
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

  const handleDownload = (format: 'csv' | 'json') => {
    setIsDownloading(true);

    // Track report export
    recordEvent('webui_action', {
      action: 'redteam_report_export',
      format,
    });

    try {
      const content =
        format === 'csv' ? convertEvalDataToCsv(evalData) : JSON.stringify(evalData, null, 2);
      const blob = new Blob([content], {
        type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json;charset=utf-8;',
      });
      const link = document.createElement('a');
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', getFilename(format));
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (error) {
      console.error(format === 'csv' ? 'Error generating CSV:' : 'Error generating JSON:', error);
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
        <DropdownMenuItem onClick={() => handleDownload('csv')}>CSV</DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleDownload('json')}>JSON</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ReportDownloadButton;
