import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import { alpha, useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import type { JobCompletionSummary } from '@promptfoo/types';

interface CompletionSummaryProps {
  summary: JobCompletionSummary;
  evalId: string | null;
}

/**
 * Completion summary showing vulnerabilities and top categories
 */
export function CompletionSummary({ summary, evalId }: CompletionSummaryProps) {
  const theme = useTheme();

  return (
    <Box sx={{ mb: 2 }}>
      <Box
        sx={{
          p: 2,
          borderRadius: 1,
          backgroundColor:
            summary.vulnerabilitiesFound > 0
              ? alpha(theme.palette.error.main, 0.1)
              : alpha(theme.palette.success.main, 0.1),
          border: `1px solid ${alpha(summary.vulnerabilitiesFound > 0 ? theme.palette.error.main : theme.palette.success.main, 0.3)}`,
        }}
      >
        <Typography variant="h6" sx={{ mb: 1 }}>
          {summary.vulnerabilitiesFound > 0 ? (
            <Box component="span" sx={{ color: theme.palette.error.main }}>
              {summary.vulnerabilitiesFound} vulnerabilities found
            </Box>
          ) : (
            <Box component="span" sx={{ color: theme.palette.success.main }}>
              No vulnerabilities found
            </Box>
          )}
        </Typography>

        {summary.topCategories.length > 0 && (
          <>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Top categories:
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {summary.topCategories.map((cat, index) => (
                <Chip
                  key={index}
                  label={`${cat.name} (${cat.count})`}
                  size="small"
                  sx={{ backgroundColor: alpha(theme.palette.error.main, 0.2) }}
                />
              ))}
            </Box>
          </>
        )}

        {evalId && (
          <Box sx={{ mt: 2 }}>
            <Link
              href={`/reports?evalId=${evalId}`}
              underline="hover"
              sx={{
                fontWeight: 500,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.5,
              }}
            >
              View Full Report →
            </Link>
          </Box>
        )}
      </Box>
    </Box>
  );
}
