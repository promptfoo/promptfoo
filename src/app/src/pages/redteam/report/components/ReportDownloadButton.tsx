import React, { useState } from 'react';

import { useCustomPoliciesMap } from '@app/hooks/useCustomPoliciesMap';
import { useTelemetry } from '@app/hooks/useTelemetry';
import DownloadIcon from '@mui/icons-material/Download';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
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
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const { recordEvent } = useTelemetry();

  const customPoliciesById = useCustomPoliciesMap(evalData.config?.redteam?.plugins ?? []);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

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
        Strategy: getStrategyIdFromTest(result.testCase),
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
    handleClose();

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
    handleClose();

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
    handleClose();
    // Track report export
    recordEvent('webui_action', {
      action: 'redteam_report_export',
      format: 'pdf',
    });
    window.print();
  };

  return (
    <>
      <Tooltip title="Download report" placement="top" open={isHovering && !isDownloading}>
        <IconButton
          onClick={handleClick}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          sx={{ mt: '4px', position: 'relative' }}
          aria-label="download report"
          disabled={isDownloading}
        >
          {isDownloading ? <CircularProgress size={20} /> : <DownloadIcon />}
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
      >
        <MenuItem onClick={handlePdfDownload}>PDF</MenuItem>
        <MenuItem onClick={handleCsvDownload}>CSV</MenuItem>
        <MenuItem onClick={handleJsonDownload}>JSON</MenuItem>
      </Menu>
    </>
  );
};

export default ReportDownloadButton;
