import { EVAL_ROUTES } from '@app/constants/routes';
import { formatASRForDisplay } from '@app/utils/redteam';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoIcon from '@mui/icons-material/Info';
import Box from '@mui/material/Box';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import { useTheme } from '@mui/material/styles';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { riskCategorySeverityMap, Severity } from '@promptfoo/redteam/constants';
import { useNavigate } from 'react-router-dom';
import { getSeverityColor } from '../utils/color';
import { getPluginDisplayName } from './FrameworkComplianceUtils';

export interface FrameworkPluginResultProps {
  evalId: string;
  plugin: string;
  getPluginASR: (plugin: string) => { asr: number; total: number; failCount: number };
  type: 'failed' | 'passed' | 'untested';
}

export default function FrameworkPluginResult({
  evalId,
  plugin,
  getPluginASR,
  type,
}: FrameworkPluginResultProps) {
  const theme = useTheme();
  const navigate = useNavigate();

  const handlePluginClick = (pluginId: string) => {
    const { asr } = getPluginASR(plugin);

    const filterParam = encodeURIComponent(
      JSON.stringify([
        {
          type: 'plugin',
          operator: 'equals',
          value: pluginId,
        },
      ]),
    );

    const mode = asr === 0 ? 'passes' : 'failures';
    navigate(`${EVAL_ROUTES.DETAIL(evalId)}?filter=${filterParam}&mode=${mode}`);
  };

  const { asr, total, failCount } = getPluginASR(plugin);

  const pluginSeverity =
    riskCategorySeverityMap[plugin as keyof typeof riskCategorySeverityMap] || Severity.Low;

  return (
    <ListItem
      sx={{
        borderLeft: `3px solid ${getSeverityColor(pluginSeverity, theme)}`,
        pl: 2,
        mb: 0.5,
        bgcolor: 'rgba(0, 0, 0, 0.02)',
        borderRadius: '0 4px 4px 0',
        opacity: type === 'untested' ? 0.7 : 1,
      }}
    >
      <ListItemIcon sx={{ minWidth: 30 }}>
        {type === 'failed' && <CancelIcon fontSize="small" color="error" />}
        {type === 'passed' && <CheckCircleIcon fontSize="small" color="success" />}
        {type === 'untested' && <InfoIcon fontSize="small" color="action" />}
      </ListItemIcon>
      <ListItemText
        primary={
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography
              variant="body2"
              // Failed and passed plugins are clickable; untested plugins are not:
              sx={
                type !== 'untested'
                  ? {
                      cursor: 'pointer',
                      '&:hover': { textDecoration: 'underline' },
                    }
                  : {}
              }
              onClick={() => type !== 'untested' && handlePluginClick(plugin)}
            >
              {getPluginDisplayName(plugin)}
            </Typography>
            <Tooltip title={`${failCount}/${total} attacks successful`}>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: type === 'untested' ? 600 : 'bold',
                  color:
                    type === 'failed'
                      ? 'error.main'
                      : type === 'passed'
                        ? 'success.main'
                        : type === 'untested'
                          ? 'text.secondary'
                          : 'inherit',
                }}
              >
                {type === 'untested' ? 'Not Tested' : `${formatASRForDisplay(asr)}%`}
              </Typography>
            </Tooltip>
          </Box>
        }
      />
    </ListItem>
  );
}
