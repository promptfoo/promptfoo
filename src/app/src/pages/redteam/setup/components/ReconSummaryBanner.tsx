import CodeIcon from '@mui/icons-material/Code';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import SettingsIcon from '@mui/icons-material/Settings';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import { useRedTeamConfig } from '../hooks/useRedTeamConfig';

/**
 * Banner component that displays when the configuration was loaded from recon.
 * Shows summary information about the codebase analysis.
 */
export default function ReconSummaryBanner() {
  const theme = useTheme();
  const { reconContext } = useRedTeamConfig();

  // Only render if we have recon context
  if (!reconContext || reconContext.source !== 'recon-cli') {
    return null;
  }

  const formatDate = (timestamp: number) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(timestamp));
  };

  const truncateDirectory = (path: string | undefined) => {
    if (!path) {
      return 'Unknown';
    }
    const parts = path.split('/');
    if (parts.length <= 3) {
      return path;
    }
    return `.../${parts.slice(-2).join('/')}`;
  };

  return (
    <Alert
      severity="info"
      icon={<CodeIcon />}
      sx={{
        backgroundColor:
          theme.palette.mode === 'dark'
            ? alpha(theme.palette.info.main, 0.1)
            : alpha(theme.palette.info.main, 0.05),
        border: `1px solid ${
          theme.palette.mode === 'dark'
            ? alpha(theme.palette.info.main, 0.3)
            : alpha(theme.palette.info.main, 0.2)
        }`,
        '& .MuiAlert-icon': {
          color: theme.palette.info.main,
        },
        '& .MuiAlert-message': {
          width: '100%',
        },
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <Typography
          variant="subtitle2"
          sx={{ fontWeight: 'medium', color: theme.palette.info.main }}
        >
          Configuration loaded from Recon CLI
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          {reconContext.codebaseDirectory && (
            <Chip
              size="small"
              icon={<FolderOpenIcon />}
              label={truncateDirectory(reconContext.codebaseDirectory)}
              variant="outlined"
              sx={{ borderColor: alpha(theme.palette.info.main, 0.3) }}
            />
          )}
          {reconContext.keyFilesAnalyzed !== undefined && reconContext.keyFilesAnalyzed > 0 && (
            <Chip
              size="small"
              icon={<InsertDriveFileIcon />}
              label={`${reconContext.keyFilesAnalyzed} key files analyzed`}
              variant="outlined"
              sx={{ borderColor: alpha(theme.palette.info.main, 0.3) }}
            />
          )}
          {reconContext.fieldsPopulated !== undefined && reconContext.fieldsPopulated > 0 && (
            <Chip
              size="small"
              icon={<SettingsIcon />}
              label={`${reconContext.fieldsPopulated} fields populated`}
              variant="outlined"
              sx={{ borderColor: alpha(theme.palette.info.main, 0.3) }}
            />
          )}
        </Box>
        <Typography variant="caption" color="text.secondary">
          Analyzed on {formatDate(reconContext.timestamp)}. Review and adjust the details below as
          needed.
        </Typography>
      </Box>
    </Alert>
  );
}
