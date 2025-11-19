import { alpha, Card, CardActionArea, CardContent, Typography, useTheme } from '@mui/material';
import { Severity, severityDisplayNames } from '@promptfoo/redteam/constants';

interface SeverityCardProps {
  severity: Severity;
  issueCount?: number;
  navigateOnClick: boolean;
  navigateToIssues: (props: { severity: Severity }) => void;
}

export default function SeverityCard({
  severity,
  issueCount = 0,
  navigateOnClick,
  navigateToIssues,
}: SeverityCardProps) {
  const hasIssues = issueCount > 0;
  const theme = useTheme();
  const severityColor = hasIssues
    ? theme.palette.custom.severity[severity].main
    : theme.palette.text.disabled;
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
  return (
    <Card
      sx={[
        {
          borderLeft: '5px solid',
          borderLeftColor: severityColor,
          backgroundColor: hasIssues ? alpha(severityColor, 0.05) : 'transparent',
          filter: hasIssues ? 'none' : 'grayscale(0.5)',
          height: '100%',
        },
      ]}
    >
      {navigateOnClick && hasIssues ? (
        <CardActionArea
          aria-label={`Filter by ${severityDisplayNames[severity]} vulnerabilities`}
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
}
