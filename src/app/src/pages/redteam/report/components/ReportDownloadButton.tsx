import React, { useState } from 'react';
import DownloadIcon from '@mui/icons-material/Download';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import type { ResultsFile } from '@promptfoo/types';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { convertEvalDataToCsv } from '../utils/csvExport';

interface ReportDownloadButtonProps {
  evalDescription: string;
  evalData: ResultsFile;
}

const ReportDownloadButton: React.FC<ReportDownloadButtonProps> = ({
  evalDescription,
  evalData,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const getFilename = (extension: string) => {
    return evalDescription
      ? `report_${evalDescription
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')}.${extension}`
      : `report.${extension}`;
  };

  const handlePdfDownload = async () => {
    setIsDownloading(true);
    handleClose();

    setTimeout(async () => {
      const element = document.documentElement;
      const canvas = await html2canvas(element, {
        height: Math.max(element.scrollHeight, element.offsetHeight),
        windowHeight: document.documentElement.scrollHeight,
      });
      const data = canvas.toDataURL('image/png');

      const pdf = new jsPDF('p', 'pt', [canvas.width, canvas.height]);
      pdf.addImage(data, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(getFilename('pdf'));

      setIsDownloading(false);
    }, 100);
  };

  const handleCsvDownload = () => {
    setIsDownloading(true);
    handleClose();

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
        <MenuItem onClick={handlePdfDownload}>Download as PDF</MenuItem>
        <MenuItem onClick={handleCsvDownload}>Download as CSV</MenuItem>
      </Menu>
    </>
  );
};

export default ReportDownloadButton;
