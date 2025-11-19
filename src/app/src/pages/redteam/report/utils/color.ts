import { Theme } from '@mui/material';
import { Severity } from '@promptfoo/redteam/constants';

export const getSeverityColor = (severity: Severity, theme: Theme): string =>
  theme.palette.custom.severity[severity]?.main || theme.palette.grey[500];

export const getSeverityContrastText = (severity: Severity, theme: Theme): string =>
  theme.palette.custom.severity[severity]?.contrastText || 'white';

export const getProgressColor = (
  percentage: number,
  theme: Theme,
  highIsBad: boolean = false,
): string => {
  const critical = getSeverityColor(Severity.Critical, theme);
  const high = getSeverityColor(Severity.High, theme);
  const mediumHigh = theme.palette.warning.dark;
  const medium = theme.palette.warning.light;
  const low = getSeverityColor(Severity.Low, theme);
  const evalPercentage = highIsBad ? percentage : 100 - percentage;
  if (evalPercentage >= 90) {
    return critical;
  }
  if (evalPercentage >= 75) {
    return high;
  }
  if (evalPercentage >= 50) {
    return mediumHigh;
  }
  if (evalPercentage >= 25) {
    return medium;
  }
  return low;
};
