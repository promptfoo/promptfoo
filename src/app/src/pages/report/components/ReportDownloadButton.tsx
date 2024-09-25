import React, { useState } from 'react';
import DownloadIcon from '@mui/icons-material/Download';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface ReportDownloadButtonProps {
  evalDescription: string;
}

const ReportDownloadButton: React.FC<ReportDownloadButtonProps> = ({ evalDescription }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);

    setTimeout(async () => {
      const element = document.documentElement;
      const canvas = await html2canvas(element, {
        height: Math.max(element.scrollHeight, element.offsetHeight),
        windowHeight: document.documentElement.scrollHeight,
      });
      const data = canvas.toDataURL('image/png');

      const pdf = new jsPDF('p', 'pt', [canvas.width, canvas.height]);
      pdf.addImage(data, 'PNG', 0, 0, canvas.width, canvas.height);
      const filename = evalDescription
        ? `report_${evalDescription
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')}.pdf`
        : 'report.pdf';
      pdf.save(filename);

      setIsDownloading(false);
    }, 100);
  };

  return (
    <Tooltip title="Download report as PDF" placement="top" open={isHovering && !isDownloading}>
      <IconButton
        onClick={handleDownload}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        sx={{ mt: '4px', position: 'relative' }}
        aria-label="download report"
        disabled={isDownloading}
      >
        {isDownloading ? <CircularProgress size={20} /> : <DownloadIcon />}
      </IconButton>
    </Tooltip>
  );
};

export default ReportDownloadButton;
