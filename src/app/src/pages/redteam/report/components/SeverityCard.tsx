import {
  alpha,
  Card,
  CardActionArea,
  CardContent,
  Tooltip,
  Typography,
  useTheme,
} from '@mui/material';
import { Severity, severityDisplayNames } from '@promptfoo/redteam/constants';

interface SeverityCardProps {
  severity: Severity;
  issueCount?: number;
  navigateOnClick: boolean;
  navigateToIssues: (props: { severity: Severity }) => void;
  isActive?: boolean;
  hasActiveFilter?: boolean;
}

export default function SeverityCard({
  severity,
  issueCount = 0,
  navigateOnClick,
  navigateToIssues,
  isActive = false,
  hasActiveFilter = false,
}: SeverityCardProps) {
  const hasIssues = issueCount > 0;
  const theme = useTheme();
  const severityColor = hasIssues
    ? theme.palette.custom.severity[severity].main
    : theme.palette.text.disabled;

  // De-emphasize inactive cards when a filter is active
  const isInactive = hasActiveFilter && !isActive;
  const content = (
    <CardContent
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <Typography
        variant="h6"
        gutterBottom
        fontWeight={600}
        sx={[
          {
            color: severityColor,
          },
        ]}
      >
        {severityDisplayNames[severity]}
      </Typography>
      <Typography variant="h4" sx={{ color: severityColor }}>
        {issueCount}
      </Typography>
      <Typography
        variant="body2"
        sx={[
          {
            color: severityColor,
          },
        ]}
      >
        {issueCount === 1 ? 'Vulnerability' : 'Vulnerabilities'}
      </Typography>
    </CardContent>
  );
  const cardContent = (
    <Card
      sx={[
        {
          borderLeft: '5px solid',
          borderLeftColor: severityColor,
          backgroundColor: hasIssues ? alpha(severityColor, 0.05) : 'transparent',
          filter: hasIssues ? 'none' : 'grayscale(0.5)',
          height: '100%',
          opacity: isInactive ? 0.4 : 1,
          transition: 'all 0.2s ease-in-out',
        },
      ]}
    >
      {navigateOnClick && hasIssues ? (
        <CardActionArea
          aria-label={
            isActive
              ? `Clear ${severityDisplayNames[severity]} filter`
              : `Filter by ${severityDisplayNames[severity]} vulnerabilities`
          }
          onClick={navigateToIssues ? () => navigateToIssues({ severity }) : undefined}
          sx={{
            height: '100%',
            transition: 'transform 0.3s ease-in-out, box-shadow 0.3s ease-in-out',
            '&:hover': {
              transform: 'translateY(-5px)',
              //   boxShadow:
              //     theme.palette.mode === 'dark' || !hasIssues
              //       ? 'none'
              //       : '0 8px 16px rgba(0, 0, 0, 0.1)',
            },
          }}
        >
          {content}
        </CardActionArea>
      ) : (
        content
      )}
    </Card>
  );

  // Wrap clickable cards with tooltip
  if (navigateOnClick && hasIssues) {
    const tooltipTitle = isActive ? 'Click to clear filter' : 'Click to filter';
    return (
      <Tooltip title={tooltipTitle} placement="top" arrow>
        {cardContent}
      </Tooltip>
    );
  }

  return cardContent;
}
